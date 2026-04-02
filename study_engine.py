"""
study_engine.py — Fully local AI study features. No API keys required.

Uses google/flan-t5-large (HuggingFace Transformers) running on-device to
transform raw notes into structured summaries, study guides, compiled
multi-day notes, and quizzes.

Model is downloaded once (~800MB) on first use via HuggingFace hub.
"""

import hashlib
import json
import logging
import math
import re
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
# Lazy model loading
# ---------------------------------------------------------------------------

_pipeline = None
MODEL_NAME = "google/flan-t5-large"
MAX_INPUT_TOKENS = 450   # conservative limit per chunk for flan-t5
MAX_NEW_TOKENS = 512


def _get_pipeline():
    """Load the FLAN-T5-Large pipeline on first use (cached in memory after)."""
    global _pipeline
    if _pipeline is None:
        logger.info("Loading %s model (first run — downloads ~800MB once)...", MODEL_NAME)
        from transformers import pipeline
        _pipeline = pipeline(
            "text2text-generation",
            model=MODEL_NAME,
            max_new_tokens=MAX_NEW_TOKENS,
        )
        logger.info("Model loaded.")
    return _pipeline


# ---------------------------------------------------------------------------
# In-memory result cache
# ---------------------------------------------------------------------------

_cache: dict[str, Any] = {}


def _cache_key(text: str, func_name: str) -> str:
    return f"{func_name}:{hashlib.md5(text.encode()).hexdigest()}"


# ---------------------------------------------------------------------------
# Text chunking helpers
# ---------------------------------------------------------------------------

def _split_into_chunks(text: str, max_words: int = 300) -> list[str]:
    """Split text into word-count-bounded chunks, breaking on sentences."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks, current, count = [], [], 0
    for sent in sentences:
        words = len(sent.split())
        if count + words > max_words and current:
            chunks.append(" ".join(current))
            current, count = [], 0
        current.append(sent)
        count += words
    if current:
        chunks.append(" ".join(current))
    return chunks or [text]


def _run_on_chunks(prompt_template: str, text: str, join_sep: str = "\n") -> str:
    """Run the model on each chunk of text and join results."""
    pipe = _get_pipeline()
    chunks = _split_into_chunks(text)
    results = []
    for i, chunk in enumerate(chunks):
        prompt = prompt_template.format(text=chunk)
        logger.info("Processing chunk %d/%d", i + 1, len(chunks))
        out = pipe(prompt)[0]["generated_text"].strip()
        if out:
            results.append(out)
    return join_sep.join(results)


# ---------------------------------------------------------------------------
# 1. generate_structured_summary
# ---------------------------------------------------------------------------

def generate_structured_summary(notes_text: str) -> str:
    """
    Transform raw notes into a structured markdown summary using FLAN-T5-Large.
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

        # Summarize each chunk
        chunk_summaries = []
        for i, chunk in enumerate(chunks):
            logger.info("Summarizing chunk %d/%d", i + 1, len(chunks))
            prompt = f"Summarize the following lecture notes into key points:\n{chunk}"
            out = pipe(prompt)[0]["generated_text"].strip()
            if out:
                chunk_summaries.append(out)

        combined = "\n".join(chunk_summaries)

        # Generate overview from combined summaries
        overview_prompt = f"Write a 2-3 sentence overview of these notes:\n{combined[:1000]}"
        overview = pipe(overview_prompt)[0]["generated_text"].strip()

        # Key concepts
        concepts_prompt = f"List the main concepts and ideas from these notes as bullet points:\n{combined[:1000]}"
        concepts = pipe(concepts_prompt)[0]["generated_text"].strip()

        # Quick review
        review_prompt = f"Create a quick review list of the most important facts from:\n{combined[:800]}"
        review = pipe(review_prompt)[0]["generated_text"].strip()

        # Build markdown output
        title_prompt = f"Give a short title (5 words max) for these notes:\n{notes_text[:300]}"
        title = pipe(title_prompt)[0]["generated_text"].strip()

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
        _cache[key] = result
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
        pipe = _get_pipeline()

        # Get summary first (uses cache if already generated)
        summary = generate_structured_summary(notes_text)

        truncated = notes_text[:1200]

        # Key terms
        terms_prompt = f"List important terms and their definitions from these notes:\n{truncated}"
        terms = pipe(terms_prompt)[0]["generated_text"].strip()

        # Practice questions
        questions_prompt = f"Write 5 practice questions to test understanding of these notes:\n{truncated}"
        questions = pipe(questions_prompt)[0]["generated_text"].strip()

        # Memory aids
        aids_prompt = f"Suggest memory tips or mnemonics to remember the key ideas from:\n{truncated}"
        aids = pipe(aids_prompt)[0]["generated_text"].strip()

        result = f"""# Study Guide

## Summary
{summary}

## Key Terms
{terms}

## Practice Questions
{questions}

## Memory Aids
{aids}
"""
        _cache[key] = result
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

    dated_sections = []
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

    logger.info("Compiling notes from %d days locally...", len(dated_sections))

    try:
        pipe = _get_pipeline()
        all_content = "\n\n".join(dated_sections)

        # Summarize each day's notes
        compiled_days = []
        for entry in notes_list:
            date = entry.get("date", "Unknown date")
            content = entry.get("content", "").strip()
            if not content:
                continue
            prompt = f"Summarize the key points from these notes:\n{content[:800]}"
            day_summary = pipe(prompt)[0]["generated_text"].strip()
            compiled_days.append(f"**{date}**: {day_summary}")

        # Find major themes across all days
        themes_prompt = f"What are the main recurring themes across these notes:\n{all_content[:1000]}"
        themes = pipe(themes_prompt)[0]["generated_text"].strip()

        # Key takeaways
        takeaways_prompt = f"List the most important takeaways from all these notes:\n{all_content[:1000]}"
        takeaways = pipe(takeaways_prompt)[0]["generated_text"].strip()

        result = f"""# Compiled Notes

## Major Themes
{themes}

## By Date
{chr(10).join(compiled_days)}

## Key Takeaways
{takeaways}
"""
        _cache[key] = result
        return result

    except Exception as exc:
        logger.error("compile_notes failed: %s", exc)
        return f"[Error] Compilation failed: {exc}"


# ---------------------------------------------------------------------------
# 4. generate_quiz
# ---------------------------------------------------------------------------

def generate_quiz(notes_text: str) -> dict:
    """
    Generate a mixed quiz from raw notes using FLAN-T5-Large.
    Runs entirely locally — no API key needed.
    """
    if not notes_text or not notes_text.strip():
        return _empty_quiz("No notes were provided.")

    key = _cache_key(notes_text, "generate_quiz")
    if key in _cache:
        return _cache[key]

    logger.info("Generating quiz locally...")

    try:
        pipe = _get_pipeline()
        truncated = notes_text[:1500]
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', truncated) if len(s.split()) > 6]
        # Pick up to 7 sentences spread through the text
        step = max(1, len(sentences) // 7)
        selected = sentences[::step][:7]

        questions = []
        qid = 1

        # Multiple choice questions (first 3 sentences)
        for sent in selected[:3]:
            q_prompt = f"Write a multiple choice question about this fact with 4 options (A, B, C, D) and mark the correct answer:\n{sent}"
            raw = pipe(q_prompt)[0]["generated_text"].strip()
            questions.append({
                "id": qid,
                "type": "multiple_choice",
                "question": f"Which of the following best describes: {sent[:80]}...?" if len(sent) > 80 else f"Question about: {sent}",
                "options": _extract_or_make_options(raw, sent),
                "answer": "A",
                "explanation": raw[:200] if raw else sent,
            })
            qid += 1

        # Short answer questions (next 3 sentences)
        for sent in selected[3:6]:
            q_prompt = f"Write a short answer question to test understanding of:\n{sent}"
            question_text = pipe(q_prompt)[0]["generated_text"].strip()
            if not question_text or len(question_text) < 5:
                question_text = f"Explain in your own words: {sent[:100]}"

            a_prompt = f"Provide a concise answer to: {question_text}\nBased on: {sent}"
            answer_text = pipe(a_prompt)[0]["generated_text"].strip()

            questions.append({
                "id": qid,
                "type": "short_answer",
                "question": question_text,
                "options": None,
                "answer": answer_text or sent,
                "explanation": sent,
            })
            qid += 1

        # Concept question (last sentence or overall)
        concept_src = selected[6] if len(selected) > 6 else truncated[:300]
        c_prompt = f"Write a conceptual question asking someone to explain the main idea of:\n{concept_src[:400]}"
        concept_q = pipe(c_prompt)[0]["generated_text"].strip()
        if not concept_q or len(concept_q) < 5:
            concept_q = "Explain the main concept covered in these notes."

        exp_prompt = f"Explain the main concept in:\n{concept_src[:400]}"
        concept_ans = pipe(exp_prompt)[0]["generated_text"].strip()

        questions.append({
            "id": qid,
            "type": "concept",
            "question": concept_q,
            "options": None,
            "answer": concept_ans or concept_src[:200],
            "explanation": concept_src[:200],
        })

        result = {"questions": questions}
        _cache[key] = result
        return result

    except Exception as exc:
        logger.error("generate_quiz failed: %s", exc)
        return _empty_quiz(f"Quiz generation failed: {exc}")


def _extract_or_make_options(raw: str, context: str) -> list[str]:
    """Extract A/B/C/D options from model output, or generate basic ones."""
    lines = raw.splitlines()
    options = []
    for line in lines:
        line = line.strip()
        if re.match(r'^[A-D][.)]\s+', line):
            options.append(line)
    if len(options) == 4:
        return options
    # Fallback: make simple true/false style options
    short = context[:60].rstrip(".,;")
    return [
        f"A. {short}",
        f"B. The opposite of what was stated",
        f"C. None of the above",
        f"D. All of the above",
    ]


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
