"""
study_engine.py — Fully local AI study features. No API keys required.

Uses facebook/bart-large-cnn (HuggingFace Transformers) running on-device to
transform raw notes into structured summaries, study guides, compiled
multi-day notes, and quizzes.

Model is downloaded once (~1.6GB) on first use via HuggingFace hub.
Quiz generation is fully extractive (TF-IDF based) — no generative model
needed for questions, giving reliable and deterministic correct answers.
"""

import hashlib
import logging
import math
import random
import re
from collections import OrderedDict
from typing import Any

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ---------------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------------

MODEL_NAME = "facebook/bart-large-cnn"
MAX_CHUNK_TOKENS = 900   # leave headroom for BART's 1024-token limit

# ---------------------------------------------------------------------------
# Lazy pipeline and tokenizer loading
# ---------------------------------------------------------------------------

_pipeline = None
_tokenizer = None


def _get_tokenizer():
    """Load the BART tokenizer on first use (cached in memory after)."""
    global _tokenizer
    if _tokenizer is None:
        from transformers import AutoTokenizer
        logger.info("Loading tokenizer for %s...", MODEL_NAME)
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        logger.info("Tokenizer loaded.")
    return _tokenizer


def _get_pipeline():
    """Load the BART summarization pipeline on first use (cached in memory after)."""
    global _pipeline
    if _pipeline is None:
        logger.info(
            "Loading %s model (first run — downloads ~1.6GB once)...", MODEL_NAME
        )
        from transformers import pipeline
        _pipeline = pipeline(
            "summarization",
            model=MODEL_NAME,
        )
        logger.info("Model loaded.")
    return _pipeline


# ---------------------------------------------------------------------------
# LRU cache with max 100 entries — prevents OOM on long-running servers
# ---------------------------------------------------------------------------

_cache: OrderedDict[str, Any] = OrderedDict()
MAX_CACHE = 100


def _cache_key(text: str, func_name: str) -> str:
    return f"{func_name}:{hashlib.md5(text.encode()).hexdigest()}"


def _cache_set(key: str, value: Any) -> None:
    """Insert or refresh a cache entry; evict LRU entry if over capacity."""
    if key in _cache:
        _cache.move_to_end(key)
    _cache[key] = value
    if len(_cache) > MAX_CACHE:
        _cache.popitem(last=False)


# ---------------------------------------------------------------------------
# Token-based text chunking
# ---------------------------------------------------------------------------

def _split_into_chunks(text: str, max_tokens: int = MAX_CHUNK_TOKENS) -> list[str]:
    """Split text into token-count-bounded chunks, breaking on sentence boundaries."""
    tokenizer = _get_tokenizer()
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks: list[str] = []
    current_sentences: list[str] = []
    current_tokens = 0

    for sent in sentences:
        sent_tokens = len(tokenizer.encode(sent, add_special_tokens=False))
        # If a single sentence exceeds the limit, split it hard by characters
        if sent_tokens > max_tokens:
            # Flush what we have first
            if current_sentences:
                chunks.append(" ".join(current_sentences))
                current_sentences, current_tokens = [], 0
            # Break the oversized sentence into sub-chunks
            words = sent.split()
            sub: list[str] = []
            sub_tokens = 0
            for word in words:
                wt = len(tokenizer.encode(word, add_special_tokens=False))
                if sub_tokens + wt > max_tokens and sub:
                    chunks.append(" ".join(sub))
                    sub, sub_tokens = [], 0
                sub.append(word)
                sub_tokens += wt
            if sub:
                chunks.append(" ".join(sub))
            continue

        if current_tokens + sent_tokens > max_tokens and current_sentences:
            chunks.append(" ".join(current_sentences))
            current_sentences, current_tokens = [], 0

        current_sentences.append(sent)
        current_tokens += sent_tokens

    if current_sentences:
        chunks.append(" ".join(current_sentences))

    return chunks or [text]


def _run_on_chunks(text: str, max_length: int = 200, min_length: int = 30) -> str:
    """Summarize text chunk-by-chunk with BART and return joined results."""
    pipe = _get_pipeline()
    chunks = _split_into_chunks(text)
    results: list[str] = []
    for i, chunk in enumerate(chunks):
        logger.info("Summarizing chunk %d/%d", i + 1, len(chunks))
        out = pipe(chunk, max_length=max_length, min_length=min_length, do_sample=False)
        summary = out[0]["summary_text"].strip()
        if summary:
            results.append(summary)
    return "\n".join(results)


# ---------------------------------------------------------------------------
# TF-IDF helpers for extractive quiz and study guide generation
# ---------------------------------------------------------------------------

def _tokenize_words(text: str) -> list[str]:
    """Lower-case word tokenizer (strips punctuation)."""
    return re.findall(r"[a-z]+", text.lower())


def _compute_tfidf(sentences: list[str]) -> list[float]:
    """
    Return a TF-IDF relevance score for each sentence.
    Uses the sentence itself as the 'document' and the full corpus for IDF.
    """
    if not sentences:
        return []

    # Build document frequency table
    df: dict[str, int] = {}
    tokenized = [_tokenize_words(s) for s in sentences]
    for words in tokenized:
        for w in set(words):
            df[w] = df.get(w, 0) + 1

    N = len(sentences)
    scores: list[float] = []
    for words in tokenized:
        if not words:
            scores.append(0.0)
            continue
        tf: dict[str, float] = {}
        for w in words:
            tf[w] = tf.get(w, 0) + 1
        for w in tf:
            tf[w] /= len(words)
        score = sum(
            tf[w] * math.log((N + 1) / (df.get(w, 0) + 1))
            for w in tf
        )
        scores.append(score)
    return scores


def _pick_top_sentences(notes_text: str, n: int = 7) -> list[str]:
    """Return the top-n sentences ranked by TF-IDF relevance."""
    sentences = [
        s.strip()
        for s in re.split(r'(?<=[.!?])\s+', notes_text.strip())
        if len(s.split()) > 5
    ]
    if not sentences:
        return []
    scores = _compute_tfidf(sentences)
    ranked = sorted(zip(scores, sentences), key=lambda x: x[0], reverse=True)
    return [s for _, s in ranked[:n]]


def _find_key_word(sentence: str) -> str:
    """
    Find the most significant word/entity in a sentence.
    Prefers longest capitalized multi-word sequence, then longest word >5 chars.
    Returns empty string if nothing suitable found.
    """
    # Try longest capitalized sequence (proper noun / entity)
    cap_matches = re.findall(r'(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', sentence)
    if cap_matches:
        return max(cap_matches, key=len)
    # Fall back to longest word longer than 5 characters
    words = re.findall(r'[A-Za-z]{6,}', sentence)
    if words:
        return max(words, key=len)
    return ""


def _collect_distractor_words(notes_text: str, exclude_sentence: str, n: int = 3) -> list[str]:
    """
    Collect n significant words from the full notes text, excluding those
    in the given sentence, to use as wrong-answer distractors.
    """
    exclude_lower = set(_tokenize_words(exclude_sentence))
    # Pull all candidate significant words from entire notes text
    candidates: list[str] = []
    for sent in re.split(r'(?<=[.!?])\s+', notes_text):
        if sent.strip() == exclude_sentence.strip():
            continue
        word = _find_key_word(sent)
        if word and word.lower() not in exclude_lower and word not in candidates:
            candidates.append(word)
    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for w in candidates:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    # Shuffle so distractors aren't always in document order
    random.shuffle(unique)
    return unique[:n]


# ---------------------------------------------------------------------------
# 1. generate_structured_summary
# ---------------------------------------------------------------------------

def generate_structured_summary(notes_text: str) -> str:
    """
    Transform raw notes into a structured markdown summary using BART.
    Runs entirely locally — no API key needed.
    """
    if not notes_text or not notes_text.strip():
        return "[Error] No notes provided."

    key = _cache_key(notes_text, "generate_structured_summary")
    if key in _cache:
        return _cache[key]

    logger.info("Generating structured summary locally...")

    try:
        pipe = _get_pipeline()
        chunks = _split_into_chunks(notes_text)

        # Summarize each chunk individually
        chunk_summaries: list[str] = []
        for i, chunk in enumerate(chunks):
            logger.info("Summarizing chunk %d/%d", i + 1, len(chunks))
            out = pipe(chunk, max_length=200, min_length=30, do_sample=False)
            summary = out[0]["summary_text"].strip()
            if summary:
                chunk_summaries.append(summary)

        combined = "\n".join(chunk_summaries)

        # Generate higher-level overview from combined chunk summaries
        overview = _run_on_chunks(combined, max_length=120, min_length=30)

        # Key concepts: summarize the combined summaries more aggressively
        concepts_raw = _run_on_chunks(combined, max_length=150, min_length=20)
        # Format as bullet points (one per sentence)
        concept_sentences = re.split(r'(?<=[.!?])\s+', concepts_raw.strip())
        concepts = "\n".join(f"- {s.strip()}" for s in concept_sentences if s.strip())

        # Quick review: tightest summary of the combined output
        review_raw = _run_on_chunks(combined, max_length=80, min_length=15)
        review_sentences = re.split(r'(?<=[.!?])\s+', review_raw.strip())
        review = "\n".join(f"- {s.strip()}" for s in review_sentences if s.strip())

        # Title: summarize the first chunk very short
        title_out = pipe(chunks[0], max_length=12, min_length=3, do_sample=False)
        title = title_out[0]["summary_text"].strip()

        result = f"""# {title}

## Overview
{overview}

## Key Concepts
{concepts}

## Detailed Notes
{combined}

## Quick Review
{review}
"""
        _cache_set(key, result)
        return result

    except Exception as exc:
        logger.error("generate_structured_summary failed: %s", exc)
        return f"[Error] Summary generation failed: {exc}"


# ---------------------------------------------------------------------------
# 2. generate_study_guide
# ---------------------------------------------------------------------------

def generate_study_guide(notes_text: str) -> str:
    """
    Produce a study guide with key terms, practice questions, and memory aids.
    Runs entirely locally — no API key needed.
    """
    if not notes_text or not notes_text.strip():
        return "[Error] No notes provided."

    key = _cache_key(notes_text, "generate_study_guide")
    if key in _cache:
        return _cache[key]

    logger.info("Generating study guide locally...")

    try:
        # Summarize the full text properly with chunking
        summary = _run_on_chunks(notes_text, max_length=200, min_length=30)

        # Extract key terms via TF-IDF on full text
        sentences = [
            s.strip()
            for s in re.split(r'(?<=[.!?])\s+', notes_text.strip())
            if len(s.split()) > 5
        ]
        scores = _compute_tfidf(sentences)
        ranked_sents = [s for _, s in sorted(zip(scores, sentences), key=lambda x: x[0], reverse=True)]

        # Collect unique significant words from top sentences as key terms
        seen_terms: set[str] = set()
        terms_list: list[str] = []
        for sent in ranked_sents[:15]:
            word = _find_key_word(sent)
            if word and word.lower() not in seen_terms:
                seen_terms.add(word.lower())
                terms_list.append(f"- **{word}**: found in — \"{sent[:80]}...\"" if len(sent) > 80 else f"- **{word}**: found in — \"{sent}\"")
            if len(terms_list) >= 10:
                break
        terms = "\n".join(terms_list) if terms_list else "- (No key terms extracted)"

        # Practice questions from top sentences (extractive fill-in-blank)
        top_sents = _pick_top_sentences(notes_text, n=5)
        practice_qs: list[str] = []
        for idx, sent in enumerate(top_sents, 1):
            word = _find_key_word(sent)
            if word:
                q = sent.replace(word, "_____", 1)
                practice_qs.append(f"{idx}. Fill in the blank: {q}\n   *(Answer: {word})*")
            else:
                practice_qs.append(f"{idx}. Explain the following: {sent[:100]}")
        questions = "\n\n".join(practice_qs) if practice_qs else "(No practice questions generated)"

        result = f"""# Study Guide

## Summary
{summary}

## Key Terms
{terms}

## Practice Questions
{questions}
"""
        _cache_set(key, result)
        return result

    except Exception as exc:
        logger.error("generate_study_guide failed: %s", exc)
        return f"[Error] Study guide generation failed: {exc}"


# ---------------------------------------------------------------------------
# 3. compile_notes
# ---------------------------------------------------------------------------

def compile_notes(notes_list: list[dict]) -> str:
    """
    Merge multiple days of notes into one cohesive document.
    Runs entirely locally — no API key needed.
    """
    if not notes_list:
        return "[Error] No notes provided."

    dated_sections: list[str] = []
    for entry in notes_list:
        date = entry.get("date", "Unknown date")
        content = entry.get("content", "").strip()
        if content:
            dated_sections.append(f"### {date}\n{content}")

    if not dated_sections:
        return "[Error] All provided notes were empty."

    key = _cache_key("\n".join(dated_sections), "compile_notes")
    if key in _cache:
        return _cache[key]

    logger.info("Compiling notes from %d days locally...", len(notes_list))

    try:
        # Summarize each day's content with BART (token-chunked)
        compiled_days: list[str] = []
        for entry in notes_list:
            date = entry.get("date", "Unknown date")
            content = entry.get("content", "").strip()
            if not content:
                continue
            day_summary = _run_on_chunks(content, max_length=150, min_length=20)
            compiled_days.append(f"**{date}**: {day_summary}")

        # Find major themes by summarizing all daily summaries together
        all_summaries = "\n\n".join(compiled_days)
        themes = _run_on_chunks(all_summaries, max_length=180, min_length=30)

        # Key takeaways: tighter summary of the combined summaries
        takeaways_raw = _run_on_chunks(all_summaries, max_length=120, min_length=20)
        takeaway_sentences = re.split(r'(?<=[.!?])\s+', takeaways_raw.strip())
        takeaways = "\n".join(f"- {s.strip()}" for s in takeaway_sentences if s.strip())

        result = f"""# Compiled Notes

## Major Themes
{themes}

## By Date
{chr(10).join(compiled_days)}

## Key Takeaways
{takeaways}
"""
        _cache_set(key, result)
        return result

    except Exception as exc:
        logger.error("compile_notes failed: %s", exc)
        return f"[Error] Compilation failed: {exc}"


# ---------------------------------------------------------------------------
# 4. generate_quiz  — fully extractive, no generative model for questions
# ---------------------------------------------------------------------------

def generate_quiz(notes_text: str) -> dict:
    """
    Generate a multiple-choice quiz from raw notes using extractive TF-IDF.

    - Scores ALL sentences in notes_text by TF-IDF relevance (no truncation).
    - Picks top 7 sentences as quiz-worthy.
    - For each sentence, blanks the most significant word/entity.
    - Correct option is randomly placed among A/B/C/D and tracked correctly.
    - Distractors are other significant words drawn from the full notes text.

    Runs entirely locally — no API key, no generative model needed for questions.
    """
    if not notes_text or not notes_text.strip():
        return _empty_quiz("No notes were provided.")

    key = _cache_key(notes_text, "generate_quiz")
    if key in _cache:
        return _cache[key]

    logger.info("Generating quiz locally (extractive TF-IDF)...")

    try:
        top_sentences = _pick_top_sentences(notes_text, n=7)
        if not top_sentences:
            return _empty_quiz("Could not extract sentences from notes.")

        questions: list[dict] = []
        letters = ["A", "B", "C", "D"]

        for qid, sent in enumerate(top_sentences, 1):
            correct_word = _find_key_word(sent)
            if not correct_word:
                # Skip sentences where we can't find a key word
                continue

            # Build fill-in-blank question stem
            blanked = sent.replace(correct_word, "_____", 1)
            question_text = f"Fill in the blank: {blanked}"

            # Get 3 distractor words from the rest of the notes
            distractors = _collect_distractor_words(notes_text, sent, n=3)
            # If not enough distractors, pad with generic placeholders
            while len(distractors) < 3:
                distractors.append(f"term{len(distractors) + 1}")

            # Build the 4-option pool and shuffle
            option_words = [correct_word] + distractors[:3]
            random.shuffle(option_words)

            # Find which letter the correct word landed on after shuffle
            correct_letter = letters[option_words.index(correct_word)]

            # Format options as "A. word" etc.
            options = [f"{letters[i]}. {option_words[i]}" for i in range(4)]

            questions.append({
                "id": qid,
                "type": "multiple_choice",
                "question": question_text,
                "options": options,
                "answer": correct_letter,
                "explanation": sent,
            })

        if not questions:
            return _empty_quiz("No quiz-worthy sentences found in notes.")

        result: dict = {"questions": questions}
        _cache_set(key, result)
        return result

    except Exception as exc:
        logger.error("generate_quiz failed: %s", exc)
        return _empty_quiz(f"Quiz generation failed: {exc}")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _empty_quiz(reason: str) -> dict:
    return {
        "questions": [{
            "id": 1,
            "type": "short_answer",
            "question": reason,
            "options": None,
            "answer": "N/A",
            "explanation": "Please provide notes to generate a quiz.",
        }]
    }
