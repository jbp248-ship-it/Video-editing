"""
NLP engine — entity extraction, sentiment analysis, and semantic search.

Provides advanced NLP capabilities for the AI note taker:
- Named entity recognition (regex-based + optional spaCy/HF)
- Sentiment timeline tracking
- Semantic search over transcripts
- Word cloud data generation
- Text complexity scoring

Works with zero extra dependencies (Python stdlib + regex).
Optional enhanced accuracy with spaCy, sentence-transformers, or HuggingFace.
"""

import logging
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Entity:
    """A named entity extracted from the transcript."""
    text: str
    entity_type: str       # "person", "organization", "date", "topic", "metric", "location"
    mentions: list[dict] = field(default_factory=list)  # [{"timestamp": float, "context": str}]
    frequency: int = 1
    importance: float = 0.0


@dataclass
class SearchResult:
    """A search result from the transcript."""
    text: str
    timestamp: float
    relevance: float
    context: str
    topic_section: str = ""


@dataclass
class NLPAnalysis:
    """Complete NLP analysis of a transcript."""
    entities: list[Entity]
    topics: list[str]
    sentiment_timeline: list[dict]
    word_cloud_data: dict
    complexity_score: float
    search_index: dict


# ---------------------------------------------------------------------------
# Stop words
# ---------------------------------------------------------------------------

_STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "and", "but", "or", "not", "no", "so", "if",
    "then", "than", "that", "this", "it", "its", "i", "me", "my", "you",
    "your", "he", "she", "we", "they", "them", "what", "which", "who",
    "when", "where", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "just", "about", "up", "out", "like",
    "really", "very", "also", "well", "even", "still", "already", "got",
    "get", "going", "go", "know", "think", "thing", "right", "yeah",
    "okay", "oh", "um", "uh", "actually", "basically", "literally",
    "kind", "stuff", "lot", "much", "way", "something", "anything",
}


# ---------------------------------------------------------------------------
# Sentiment word lists
# ---------------------------------------------------------------------------

_POSITIVE_WORDS = {
    "good", "great", "excellent", "amazing", "awesome", "fantastic",
    "wonderful", "perfect", "brilliant", "outstanding", "love", "happy",
    "excited", "pleased", "glad", "agree", "success", "successful",
    "improve", "improvement", "progress", "positive", "best", "better",
    "win", "winning", "opportunity", "growth", "strong", "powerful",
    "effective", "efficient", "innovative", "creative", "impressive",
    "remarkable", "helpful", "useful", "valuable", "benefit", "achieve",
    "accomplish", "celebrate", "confident", "optimistic", "promising",
    "productive", "thrilled", "solved", "resolve", "clarity",
}

_NEGATIVE_WORDS = {
    "bad", "terrible", "awful", "horrible", "poor", "worst", "worse",
    "fail", "failure", "problem", "issue", "concern", "risk", "danger",
    "difficult", "challenge", "struggle", "worry", "worried", "anxious",
    "frustrated", "frustrating", "confused", "confusing", "disagree",
    "wrong", "mistake", "error", "bug", "broken", "blocked", "blocker",
    "delay", "delayed", "behind", "overdue", "missing", "lack",
    "unfortunately", "disappointed", "regret", "lost", "losing",
    "decline", "decrease", "dropped", "crisis", "urgent", "critical",
    "complicated", "complex", "unclear", "unstable", "negative",
}


# ---------------------------------------------------------------------------
# Entity extraction — Regex-based (always available)
# ---------------------------------------------------------------------------

def _extract_entities_regex(transcript_segments: list) -> list[Entity]:
    """Extract entities using regex patterns and heuristics."""
    entities_map: dict[str, Entity] = {}

    for seg in transcript_segments:
        text = seg.text
        timestamp = seg.start

        # --- People: Capitalized word pairs ---
        people = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b", text)
        for name in people:
            # Filter out common non-names (sentence starts, etc.)
            if name.split()[0].lower() in {"the", "this", "that", "we", "they", "it", "but", "and", "so", "if"}:
                continue
            _add_entity(entities_map, name, "person", timestamp, text)

        # --- People: Title + Name ---
        titled = re.findall(
            r"\b((?:Mr|Mrs|Ms|Dr|Prof|CEO|CTO|CFO|VP|Director)\s*\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
            text,
        )
        for name in titled:
            _add_entity(entities_map, name, "person", timestamp, text)

        # --- Organizations: common suffixes ---
        orgs = re.findall(
            r"\b([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Group|Team|Labs?|Studios?|Technologies|Solutions)\.?)\b",
            text,
        )
        for org in orgs:
            _add_entity(entities_map, org, "organization", timestamp, text)

        # --- Dates ---
        dates = re.findall(
            r"\b((?:next|this|last)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month|quarter|year))\b",
            text, re.IGNORECASE,
        )
        for d in dates:
            _add_entity(entities_map, d, "date", timestamp, text)

        date_specific = re.findall(
            r"\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?)\b",
            text,
        )
        for d in date_specific:
            _add_entity(entities_map, d, "date", timestamp, text)

        quarter_dates = re.findall(r"\b(Q[1-4]\s+\d{4})\b", text)
        for d in quarter_dates:
            _add_entity(entities_map, d, "date", timestamp, text)

        # --- Metrics/Numbers ---
        metrics = re.findall(
            r"(\$\s*[\d,.]+(?:\s*(?:million|billion|thousand|[kKmMbB]))?)\b",
            text,
        )
        for m in metrics:
            _add_entity(entities_map, m, "metric", timestamp, text)

        percentages = re.findall(r"(\d+(?:\.\d+)?%)", text)
        for p in percentages:
            _add_entity(entities_map, p, "metric", timestamp, text)

        big_numbers = re.findall(
            r"\b(\d+(?:\.\d+)?\s*(?:million|billion|thousand|users|customers|downloads))\b",
            text, re.IGNORECASE,
        )
        for n in big_numbers:
            _add_entity(entities_map, n, "metric", timestamp, text)

    # Score importance
    entities = list(entities_map.values())
    max_freq = max((e.frequency for e in entities), default=1)
    for e in entities:
        freq_score = e.frequency / max_freq
        # Early mentions are more important
        first_mention = e.mentions[0]["timestamp"] if e.mentions else 0
        position_score = max(0, 1 - first_mention / 3600)  # Decay over 1 hour
        e.importance = 0.6 * freq_score + 0.4 * position_score

    entities.sort(key=lambda e: e.importance, reverse=True)
    return entities


def _add_entity(
    entities_map: dict[str, "Entity"],
    text: str,
    entity_type: str,
    timestamp: float,
    context: str,
):
    """Add or update an entity in the map."""
    key = text.lower().strip()
    if key in entities_map:
        entities_map[key].frequency += 1
        entities_map[key].mentions.append({
            "timestamp": timestamp,
            "context": context[:150],
        })
    else:
        entities_map[key] = Entity(
            text=text.strip(),
            entity_type=entity_type,
            mentions=[{"timestamp": timestamp, "context": context[:150]}],
            frequency=1,
        )


def _extract_entities_nlp(transcript_segments: list) -> Optional[list[Entity]]:
    """Try to extract entities using spaCy or HuggingFace NER."""
    # Try spaCy first
    try:
        import spacy
        nlp = spacy.load("en_core_web_sm")

        entities_map: dict[str, Entity] = {}
        type_map = {
            "PERSON": "person",
            "ORG": "organization",
            "DATE": "date",
            "GPE": "location",
            "LOC": "location",
            "MONEY": "metric",
            "PERCENT": "metric",
            "CARDINAL": "metric",
        }

        for seg in transcript_segments:
            doc = nlp(seg.text)
            for ent in doc.ents:
                etype = type_map.get(ent.label_, "topic")
                _add_entity(entities_map, ent.text, etype, seg.start, seg.text)

        entities = list(entities_map.values())
        max_freq = max((e.frequency for e in entities), default=1)
        for e in entities:
            e.importance = e.frequency / max_freq
        entities.sort(key=lambda e: e.importance, reverse=True)
        logger.info("spaCy NER extracted %d entities", len(entities))
        return entities

    except Exception as e:
        logger.debug("spaCy not available: %s", e)

    # Try HuggingFace NER
    try:
        from transformers import pipeline as hf_pipeline
        ner = hf_pipeline("ner", grouped_entities=True)

        entities_map = {}
        type_map = {
            "PER": "person",
            "ORG": "organization",
            "LOC": "location",
            "MISC": "topic",
        }

        for seg in transcript_segments:
            results = ner(seg.text[:512])
            for r in results:
                etype = type_map.get(r["entity_group"], "topic")
                _add_entity(entities_map, r["word"], etype, seg.start, seg.text)

        entities = list(entities_map.values())
        max_freq = max((e.frequency for e in entities), default=1)
        for e in entities:
            e.importance = e.frequency / max_freq
        entities.sort(key=lambda e: e.importance, reverse=True)
        logger.info("HuggingFace NER extracted %d entities", len(entities))
        return entities

    except Exception as e:
        logger.debug("HuggingFace NER not available: %s", e)

    return None


def extract_entities(transcript_segments: list) -> list[Entity]:
    """
    Extract named entities from transcript.

    Tries spaCy/HuggingFace first, falls back to regex-based extraction.
    """
    # Try NLP-powered extraction
    nlp_entities = _extract_entities_nlp(transcript_segments)
    if nlp_entities is not None:
        return nlp_entities

    # Fallback to regex
    logger.info("Using regex-based entity extraction")
    return _extract_entities_regex(transcript_segments)


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def build_search_index(
    transcript_segments: list,
    entities: list[Entity],
) -> dict:
    """
    Build an inverted index for text search.

    Returns: {word: [{"segment_idx": int, "timestamp": float, "text": str}]}
    """
    index: dict[str, list[dict]] = {}

    for i, seg in enumerate(transcript_segments):
        words = re.findall(r"[a-z]+", seg.text.lower())
        unique_words = set(words) - _STOP_WORDS
        for w in unique_words:
            if len(w) < 3:
                continue
            if w not in index:
                index[w] = []
            index[w].append({
                "segment_idx": i,
                "timestamp": seg.start,
                "text": seg.text[:150],
            })

    # Add entity text as index entries
    for entity in entities:
        key = entity.text.lower()
        if key not in index:
            index[key] = []
        for mention in entity.mentions:
            index[key].append({
                "segment_idx": -1,
                "timestamp": mention["timestamp"],
                "text": mention["context"],
            })

    logger.info("Search index built: %d terms", len(index))
    return index


def search_notes(
    query: str,
    search_index: dict,
    transcript_segments: list,
    top_k: int = 10,
) -> list[SearchResult]:
    """
    Search notes using TF-IDF-like text matching.

    Supports simple queries and AND boolean ("marketing AND budget").
    """
    # Parse query
    query_lower = query.lower().strip()
    if " and " in query_lower:
        terms = [t.strip() for t in query_lower.split(" and ")]
        require_all = True
    else:
        terms = re.findall(r"[a-z]+", query_lower)
        require_all = False

    terms = [t for t in terms if t not in _STOP_WORDS and len(t) >= 2]

    if not terms:
        return []

    # Score each segment
    segment_scores: dict[int, float] = {}
    segment_texts: dict[int, str] = {}
    segment_times: dict[int, float] = {}

    for term in terms:
        # Check exact match and prefix match
        matching_entries = []
        for key, entries in search_index.items():
            if key == term or key.startswith(term):
                matching_entries.extend(entries)

        for entry in matching_entries:
            idx = entry["segment_idx"]
            if idx not in segment_scores:
                segment_scores[idx] = 0.0
                segment_texts[idx] = entry["text"]
                segment_times[idx] = entry["timestamp"]
            segment_scores[idx] += 1.0

    # If AND mode, filter to segments matching all terms
    if require_all:
        required_count = len(terms)
        segment_scores = {
            k: v for k, v in segment_scores.items() if v >= required_count
        }

    # Sort by score
    ranked = sorted(segment_scores.items(), key=lambda x: x[1], reverse=True)

    results = []
    for idx, score in ranked[:top_k]:
        max_score = max(segment_scores.values()) if segment_scores else 1
        results.append(SearchResult(
            text=segment_texts.get(idx, ""),
            timestamp=segment_times.get(idx, 0),
            relevance=score / max_score,
            context=segment_texts.get(idx, ""),
        ))

    return results


def semantic_search(
    query: str,
    transcript_segments: list,
    top_k: int = 10,
) -> list[SearchResult]:
    """
    Embedding-based semantic search using sentence-transformers.

    Falls back to text search if sentence-transformers is unavailable.
    """
    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np

        logger.info("Running semantic search with sentence-transformers")
        model = SentenceTransformer("all-MiniLM-L6-v2")

        # Embed segments
        texts = [seg.text for seg in transcript_segments]
        embeddings = model.encode(texts)
        query_embedding = model.encode([query])[0]

        # Cosine similarity
        similarities = np.dot(embeddings, query_embedding) / (
            np.linalg.norm(embeddings, axis=1) * np.linalg.norm(query_embedding) + 1e-9
        )

        # Top k
        top_indices = np.argsort(similarities)[::-1][:top_k]

        results = []
        for idx in top_indices:
            results.append(SearchResult(
                text=transcript_segments[idx].text,
                timestamp=transcript_segments[idx].start,
                relevance=float(similarities[idx]),
                context=transcript_segments[idx].text[:200],
            ))

        return results

    except Exception as e:
        logger.info("sentence-transformers not available (%s), using text search", e)
        # Fallback: build a quick index and search
        index = build_search_index(transcript_segments, [])
        return search_notes(query, index, transcript_segments, top_k)


# ---------------------------------------------------------------------------
# Sentiment timeline
# ---------------------------------------------------------------------------

def analyze_sentiment_timeline(
    transcript_segments: list,
    window_seconds: float = 30.0,
) -> list[dict]:
    """
    Track sentiment over time through the meeting.

    Returns list of {timestamp, sentiment, score} where:
    - sentiment: "positive", "negative", or "neutral"
    - score: -1.0 to 1.0
    """
    if not transcript_segments:
        return []

    timeline = []
    window_start = 0.0
    window_text = ""
    last_end = transcript_segments[-1].end if transcript_segments else 0

    for seg in transcript_segments:
        window_text += " " + seg.text

        if seg.end - window_start >= window_seconds or seg == transcript_segments[-1]:
            score = _sentiment_score(window_text)
            if score > 0.1:
                sentiment = "positive"
            elif score < -0.1:
                sentiment = "negative"
            else:
                sentiment = "neutral"

            timeline.append({
                "timestamp": round(window_start + (seg.end - window_start) / 2, 1),
                "sentiment": sentiment,
                "score": round(score, 3),
            })

            window_start = seg.end
            window_text = ""

    return timeline


def _sentiment_score(text: str) -> float:
    """Calculate simple keyword-based sentiment score (-1 to 1)."""
    words = re.findall(r"[a-z]+", text.lower())
    if not words:
        return 0.0

    pos_count = sum(1 for w in words if w in _POSITIVE_WORDS)
    neg_count = sum(1 for w in words if w in _NEGATIVE_WORDS)
    total = pos_count + neg_count

    if total == 0:
        return 0.0

    return (pos_count - neg_count) / total


# ---------------------------------------------------------------------------
# Complexity scoring
# ---------------------------------------------------------------------------

def calculate_complexity(transcript_segments: list) -> float:
    """
    Calculate text complexity score (0-1).

    Uses simplified Flesch-Kincaid approach:
    - Average words per sentence
    - Average syllables per word
    """
    full_text = " ".join(seg.text for seg in transcript_segments)
    sentences = re.split(r'[.!?]+', full_text)
    sentences = [s.strip() for s in sentences if s.strip()]

    if not sentences:
        return 0.0

    words = re.findall(r"[a-zA-Z]+", full_text)
    if not words:
        return 0.0

    avg_sentence_length = len(words) / len(sentences)
    avg_syllables = sum(_count_syllables(w) for w in words) / len(words)

    # Simplified Flesch-Kincaid, normalized to 0-1
    # FK = 0.39 * ASL + 11.8 * ASW - 15.59
    fk = 0.39 * avg_sentence_length + 11.8 * avg_syllables - 15.59
    # Normalize: FK of 0 -> 0, FK of 20 -> 1
    normalized = max(0.0, min(1.0, fk / 20.0))

    return round(normalized, 2)


def _count_syllables(word: str) -> int:
    """Estimate syllable count for a word."""
    word = word.lower()
    if len(word) <= 3:
        return 1

    # Count vowel groups
    vowels = "aeiouy"
    count = 0
    prev_vowel = False

    for char in word:
        is_vowel = char in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel

    # Adjust for silent e
    if word.endswith("e") and count > 1:
        count -= 1

    return max(1, count)


# ---------------------------------------------------------------------------
# Word cloud data
# ---------------------------------------------------------------------------

def generate_word_cloud_data(
    transcript_segments: list,
    max_words: int = 50,
) -> dict[str, float]:
    """
    Generate TF-IDF weighted word frequencies for word cloud visualization.

    Returns {word: weight} dict.
    """
    # Count word frequencies across all segments
    doc_freq: dict[str, int] = {}  # How many segments contain this word
    total_freq: dict[str, int] = {}  # Total count across all text
    num_docs = len(transcript_segments)

    for seg in transcript_segments:
        words = re.findall(r"[a-z]+", seg.text.lower())
        unique_in_seg = set()

        for w in words:
            if w in _STOP_WORDS or len(w) < 3:
                continue
            total_freq[w] = total_freq.get(w, 0) + 1
            if w not in unique_in_seg:
                doc_freq[w] = doc_freq.get(w, 0) + 1
                unique_in_seg.add(w)

    if not total_freq:
        return {}

    # Calculate TF-IDF
    tfidf_scores: dict[str, float] = {}
    for word, tf in total_freq.items():
        df = doc_freq.get(word, 1)
        idf = math.log((num_docs + 1) / (df + 1)) + 1
        tfidf_scores[word] = tf * idf

    # Normalize to 0-1 and take top words
    max_score = max(tfidf_scores.values()) if tfidf_scores else 1
    ranked = sorted(tfidf_scores.items(), key=lambda x: x[1], reverse=True)

    result = {}
    for word, score in ranked[:max_words]:
        result[word] = round(score / max_score, 3)

    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def analyze_transcript(transcript_segments: list) -> NLPAnalysis:
    """
    Run complete NLP analysis on transcript.

    Returns NLPAnalysis with entities, sentiment, search index, etc.
    """
    logger.info("Running NLP analysis on %d transcript segments",
                len(transcript_segments))

    # Entity extraction
    entities = extract_entities(transcript_segments)
    logger.info("Extracted %d entities", len(entities))

    # Topic labels from entities
    topics = [e.text for e in entities if e.entity_type == "topic"][:10]

    # Sentiment timeline
    sentiment_timeline = analyze_sentiment_timeline(transcript_segments)

    # Word cloud
    word_cloud_data = generate_word_cloud_data(transcript_segments)

    # Complexity
    complexity_score = calculate_complexity(transcript_segments)

    # Search index
    search_index = build_search_index(transcript_segments, entities)

    analysis = NLPAnalysis(
        entities=entities,
        topics=topics,
        sentiment_timeline=sentiment_timeline,
        word_cloud_data=word_cloud_data,
        complexity_score=complexity_score,
        search_index=search_index,
    )

    logger.info(
        "NLP analysis complete: %d entities, %d sentiment points, complexity=%.2f",
        len(entities), len(sentiment_timeline), complexity_score,
    )

    return analysis
