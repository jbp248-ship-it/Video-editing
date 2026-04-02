"""
AI Note Taker — generates structured meeting notes from video transcripts.

Takes Whisper transcription output and produces:
- Topic-based sections with timestamps
- Executive summary
- Action items with assignees and priority
- Key decisions
- Key takeaways
- Searchable, timestamped notes

Works entirely offline. Uses HuggingFace transformers for summarization
when available, with extractive fallback.
"""

import logging
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from segmentation import TranscriptSegment

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ActionItem:
    """An extracted action item from the meeting."""
    text: str
    assignee: str          # Speaker label or "unassigned"
    timestamp: float       # When it was mentioned (seconds)
    priority: str          # "high", "medium", "low"
    context: str           # Surrounding sentence for context


@dataclass
class Decision:
    """A decision made during the meeting."""
    text: str
    timestamp: float
    context: str
    participants: list[str] = field(default_factory=list)


@dataclass
class TopicSection:
    """A coherent topic section within the meeting."""
    title: str
    start_time: float
    end_time: float
    summary: str
    key_points: list[str]
    transcript_text: str
    speaker_labels: dict = field(default_factory=dict)


@dataclass
class MeetingNotes:
    """Complete structured meeting notes."""
    title: str
    date: str
    duration: float
    executive_summary: str
    topics: list[TopicSection]
    action_items: list[ActionItem]
    decisions: list[Decision]
    key_takeaways: list[str]
    keywords: list[str]
    speakers: dict                   # speaker_id -> stats
    full_transcript: str
    search_index: dict = field(default_factory=dict)


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
}


# ---------------------------------------------------------------------------
# Topic detection
# ---------------------------------------------------------------------------

def _extract_keywords(text: str, top_n: int = 10) -> list[str]:
    """Extract top keywords from text using frequency + length scoring."""
    words = re.findall(r"[a-zA-Z']+", text.lower())
    scores: dict[str, float] = {}
    for i, w in enumerate(words):
        if w in _STOP_WORDS or len(w) < 3:
            continue
        scores[w] = scores.get(w, 0) + 1
        if len(w) > 6:
            scores[w] += 0.5
        if i < 20:
            scores[w] += 0.3
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [w for w, _ in ranked[:top_n]]


def _segment_similarity(text_a: str, text_b: str) -> float:
    """Simple word-overlap similarity between two text chunks."""
    words_a = set(re.findall(r"[a-z]+", text_a.lower())) - _STOP_WORDS
    words_b = set(re.findall(r"[a-z]+", text_b.lower())) - _STOP_WORDS
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union) if union else 0.0


def detect_topics(
    transcript_segments: list[TranscriptSegment],
    max_topics: int = 20,
) -> list[TopicSection]:
    """
    Group transcript segments into coherent topic sections.

    Uses word-overlap similarity between adjacent segment groups.
    When similarity drops below a threshold, a new topic starts.
    """
    if not transcript_segments:
        return []

    # Group transcript segments into ~30-second chunks for topic analysis
    chunk_size_sec = 30.0
    chunks: list[dict] = []
    current_chunk = {"text": "", "start": 0.0, "end": 0.0, "segments": []}

    for seg in transcript_segments:
        if not current_chunk["segments"]:
            current_chunk["start"] = seg.start

        current_chunk["text"] += " " + seg.text
        current_chunk["end"] = seg.end
        current_chunk["segments"].append(seg)

        if (seg.end - current_chunk["start"]) >= chunk_size_sec:
            chunks.append(current_chunk)
            current_chunk = {"text": "", "start": 0.0, "end": 0.0, "segments": []}

    if current_chunk["segments"]:
        chunks.append(current_chunk)

    if not chunks:
        return []

    # Find topic boundaries via similarity drops
    threshold = 0.15
    boundaries = [0]  # First chunk always starts a topic

    for i in range(1, len(chunks)):
        sim = _segment_similarity(chunks[i - 1]["text"], chunks[i]["text"])
        if sim < threshold:
            boundaries.append(i)

    # Cap at max_topics
    if len(boundaries) > max_topics:
        # Keep evenly spaced boundaries
        step = len(boundaries) / max_topics
        boundaries = [boundaries[int(i * step)] for i in range(max_topics)]

    boundaries.append(len(chunks))

    # Build topic sections
    topics = []
    for i in range(len(boundaries) - 1):
        start_idx = boundaries[i]
        end_idx = boundaries[i + 1]
        topic_chunks = chunks[start_idx:end_idx]

        if not topic_chunks:
            continue

        full_text = " ".join(c["text"] for c in topic_chunks).strip()
        start_time = topic_chunks[0]["start"]
        end_time = topic_chunks[-1]["end"]

        # Generate topic title from keywords
        keywords = _extract_keywords(full_text, top_n=4)
        title = " ".join(w.capitalize() for w in keywords[:3]) if keywords else f"Topic {i + 1}"

        # Generate summary: first 2-3 sentences
        sentences = re.split(r'[.!?]+', full_text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 15]
        summary = ". ".join(sentences[:3]) + "." if sentences else full_text[:200]

        # Key points: extract the most meaningful sentences
        key_points = _extract_key_points(full_text, max_points=5)

        topics.append(TopicSection(
            title=title,
            start_time=start_time,
            end_time=end_time,
            summary=summary,
            key_points=key_points,
            transcript_text=full_text,
            speaker_labels={},
        ))

    logger.info("Detected %d topics", len(topics))
    return topics


def _extract_key_points(text: str, max_points: int = 5) -> list[str]:
    """Extract key point sentences from text based on keyword density."""
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]

    if not sentences:
        return []

    # Score sentences by keyword density
    all_keywords = set(_extract_keywords(text, top_n=20))
    scored = []
    for sent in sentences:
        words = set(re.findall(r"[a-z]+", sent.lower()))
        overlap = len(words & all_keywords)
        score = overlap / max(len(words), 1)
        scored.append((score, sent))

    scored.sort(reverse=True)
    # Take top sentences, maintaining original order
    top_sentences = set(s for _, s in scored[:max_points])
    return [s for s in sentences if s in top_sentences][:max_points]


# ---------------------------------------------------------------------------
# Action item extraction
# ---------------------------------------------------------------------------

# Patterns that signal action items
_ACTION_PATTERNS = [
    r"(?:we need to|we should|we must|we have to|we gotta)\s+(.{10,80})",
    r"(?:let's|lets)\s+(.{10,80})",
    r"(?:i'll|i will|i'm going to|i am going to)\s+(.{10,80})",
    r"(?:you should|you need to|you have to|you must)\s+(.{10,80})",
    r"(?:can you|could you|would you)\s+(.{10,80})",
    r"(?:action item|todo|to do|follow up|follow-up)[:\s]+(.{10,120})",
    r"(?:make sure|ensure|don't forget|remember to)\s+(.{10,80})",
    r"(?:next steps?)[:\s]+(.{10,120})",
    r"(?:deadline|due date|by friday|by monday|by next week|end of week|eow|eod)\s*[:\s]*(.{5,80})",
    r"(?:assigned to|owner is|responsible)\s+(.{5,60})",
]

_URGENCY_WORDS_HIGH = {
    "asap", "urgent", "immediately", "critical", "blocker", "priority",
    "right away", "today", "eod", "end of day", "now",
}

_URGENCY_WORDS_MEDIUM = {
    "soon", "this week", "by friday", "by monday", "next meeting",
    "follow up", "important", "by next week",
}


def extract_action_items(
    transcript_segments: list[TranscriptSegment],
    speaker_segments: Optional[list] = None,
) -> list[ActionItem]:
    """Extract action items from transcript using pattern matching."""
    items: list[ActionItem] = []
    seen_texts: set[str] = set()

    for seg in transcript_segments:
        text_lower = seg.text.lower()

        for pattern in _ACTION_PATTERNS:
            matches = re.finditer(pattern, text_lower)
            for match in matches:
                action_text = match.group(1).strip().rstrip(".,;:!?")
                # Clean up
                action_text = re.sub(r'\s+', ' ', action_text)

                # Deduplicate
                if action_text in seen_texts or len(action_text) < 10:
                    continue
                seen_texts.add(action_text)

                # Determine priority
                priority = "medium"
                for word in _URGENCY_WORDS_HIGH:
                    if word in text_lower:
                        priority = "high"
                        break
                if priority == "medium":
                    for word in _URGENCY_WORDS_MEDIUM:
                        if word in text_lower:
                            priority = "medium"
                            break
                    else:
                        priority = "low"

                # Determine assignee from speaker segments if available
                assignee = "unassigned"
                if speaker_segments:
                    for spk_seg in speaker_segments:
                        if (spk_seg.start <= seg.start <= spk_seg.end):
                            assignee = spk_seg.speaker_id
                            break

                items.append(ActionItem(
                    text=action_text.capitalize(),
                    assignee=assignee,
                    timestamp=seg.start,
                    priority=priority,
                    context=seg.text[:200],
                ))

    logger.info("Extracted %d action items", len(items))
    return items


# ---------------------------------------------------------------------------
# Decision extraction
# ---------------------------------------------------------------------------

_DECISION_PATTERNS = [
    r"(?:we decided|we've decided|we have decided)\s+(?:to\s+)?(.{10,120})",
    r"(?:the decision is|decision is)\s+(?:to\s+)?(.{10,120})",
    r"(?:let's go with|we're going with|going with)\s+(.{10,100})",
    r"(?:the plan is|our plan is)\s+(?:to\s+)?(.{10,120})",
    r"(?:agreed|we all agree|everyone agrees)\s+(?:to\s+|that\s+)?(.{10,100})",
    r"(?:we're going to|we are going to|we will)\s+(.{10,100})",
    r"(?:final answer|final decision|bottom line)[:\s]+(.{10,120})",
    r"(?:so the approach|the approach is|approach will be)\s+(.{10,100})",
]


def extract_decisions(
    transcript_segments: list[TranscriptSegment],
    speaker_segments: Optional[list] = None,
) -> list[Decision]:
    """Detect decisions from transcript patterns."""
    decisions: list[Decision] = []
    seen: set[str] = set()

    for seg in transcript_segments:
        text_lower = seg.text.lower()

        for pattern in _DECISION_PATTERNS:
            matches = re.finditer(pattern, text_lower)
            for match in matches:
                dec_text = match.group(1).strip().rstrip(".,;:!?")
                dec_text = re.sub(r'\s+', ' ', dec_text)

                if dec_text in seen or len(dec_text) < 10:
                    continue
                seen.add(dec_text)

                # Find participants (speakers near this timestamp)
                participants = []
                if speaker_segments:
                    for spk_seg in speaker_segments:
                        if abs(spk_seg.start - seg.start) < 60:
                            if spk_seg.speaker_id not in participants:
                                participants.append(spk_seg.speaker_id)

                decisions.append(Decision(
                    text=dec_text.capitalize(),
                    timestamp=seg.start,
                    context=seg.text[:200],
                    participants=participants,
                ))

    logger.info("Extracted %d decisions", len(decisions))
    return decisions


# ---------------------------------------------------------------------------
# Summary generation
# ---------------------------------------------------------------------------

def _try_model_summary(text: str, max_length: int = 150) -> Optional[str]:
    """Try to generate a summary using HuggingFace transformers."""
    try:
        from transformers import pipeline as hf_pipeline

        summarizer = hf_pipeline(
            "summarization",
            model="facebook/bart-large-cnn",
            max_length=max_length,
            min_length=30,
            do_sample=False,
        )
        # Truncate input to model max length
        input_text = text[:1024]
        result = summarizer(input_text)
        return result[0]["summary_text"]
    except Exception as e:
        logger.debug("Model summarization unavailable: %s", e)
        return None


def generate_executive_summary(
    topics: list[TopicSection],
    action_items: list[ActionItem],
    decisions: list[Decision],
) -> str:
    """
    Generate a 3-5 sentence executive summary.

    Tries transformer summarization first, falls back to extractive approach.
    """
    # Combine all topic summaries for source material
    source_text = " ".join(t.summary for t in topics if t.summary)

    if not source_text:
        return "No content available for summary."

    # Try model-based summary
    model_summary = _try_model_summary(source_text)
    if model_summary:
        # Append action/decision counts
        parts = [model_summary.rstrip(".") + "."]
        if action_items:
            parts.append(f"{len(action_items)} action items were identified.")
        if decisions:
            parts.append(f"{len(decisions)} key decisions were made.")
        return " ".join(parts)

    # Extractive fallback: pick the best sentences
    all_sentences = []
    for topic in topics:
        sents = re.split(r'[.!?]+', topic.summary)
        all_sentences.extend(s.strip() for s in sents if len(s.strip()) > 20)

    # Take first 3 unique sentences
    seen = set()
    summary_parts = []
    for s in all_sentences:
        if s not in seen and len(summary_parts) < 3:
            seen.add(s)
            summary_parts.append(s)

    summary = ". ".join(summary_parts) + "." if summary_parts else source_text[:300]

    if action_items:
        summary += f" {len(action_items)} action items were identified."
    if decisions:
        summary += f" {len(decisions)} key decisions were made."

    return summary


def generate_key_takeaways(
    topics: list[TopicSection],
    action_items: list[ActionItem],
    decisions: list[Decision],
    max_items: int = 7,
) -> list[str]:
    """Distill the most important points from the meeting."""
    takeaways = []

    # Top key point from each topic (up to 4)
    for topic in topics[:4]:
        if topic.key_points:
            takeaways.append(topic.key_points[0])

    # High-priority action items
    high_actions = [a for a in action_items if a.priority == "high"]
    for a in high_actions[:2]:
        takeaways.append(f"Action required: {a.text}")

    # Key decisions
    for d in decisions[:2]:
        takeaways.append(f"Decision: {d.text}")

    return takeaways[:max_items]


def generate_meeting_title(transcript_segments: list[TranscriptSegment]) -> str:
    """Auto-generate a meeting title from transcript content."""
    if not transcript_segments:
        return "Meeting Notes"

    # Combine first ~60 seconds of transcript
    early_text = ""
    for seg in transcript_segments:
        early_text += " " + seg.text
        if seg.end > 60:
            break

    keywords = _extract_keywords(early_text, top_n=4)
    if keywords:
        title = " ".join(w.capitalize() for w in keywords[:3])
        return f"{title} — Meeting Notes"

    return "Meeting Notes"


# ---------------------------------------------------------------------------
# Search index
# ---------------------------------------------------------------------------

def build_search_index(
    topics: list[TopicSection],
    transcript_segments: list[TranscriptSegment],
) -> dict:
    """
    Build a simple inverted index for text search over notes.

    Returns: {normalized_word: [{"segment_idx": int, "timestamp": float, "text": str}]}
    """
    index: dict[str, list[dict]] = {}

    for i, seg in enumerate(transcript_segments):
        words = set(re.findall(r"[a-z]+", seg.text.lower())) - _STOP_WORDS
        for w in words:
            if len(w) < 3:
                continue
            if w not in index:
                index[w] = []
            index[w].append({
                "segment_idx": i,
                "timestamp": seg.start,
                "text": seg.text[:150],
            })

    logger.info("Built search index with %d terms", len(index))
    return index


# ---------------------------------------------------------------------------
# Transcript formatting
# ---------------------------------------------------------------------------

def _format_timestamp(seconds: float) -> str:
    """Format seconds as HH:MM:SS or MM:SS."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def build_full_transcript(
    transcript_segments: list[TranscriptSegment],
    speaker_segments: Optional[list] = None,
) -> str:
    """Build a formatted full transcript with timestamps and optional speaker labels."""
    lines = []

    if speaker_segments:
        # Use speaker-labeled transcript
        for spk_seg in speaker_segments:
            ts = _format_timestamp(spk_seg.start)
            lines.append(f"[{ts}] {spk_seg.speaker_id}: {spk_seg.text}")
    else:
        # Plain timestamped transcript
        for seg in transcript_segments:
            ts = _format_timestamp(seg.start)
            lines.append(f"[{ts}] {seg.text}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def generate_notes(
    transcript_segments: list[TranscriptSegment],
    scored_segments: Optional[list] = None,
    config=None,
    speaker_data=None,
    nlp_data=None,
) -> MeetingNotes:
    """
    Main entry point: generate complete meeting notes from transcript.

    Args:
        transcript_segments: Whisper transcription output.
        scored_segments: Optional virality-scored segments from pipeline.
        config: PipelineConfig (optional, for tuning).
        speaker_data: DiarizationResult from speaker_id module (optional).
        nlp_data: NLPAnalysis from nlp_engine module (optional).

    Returns:
        Complete MeetingNotes object.
    """
    logger.info("Generating AI meeting notes...")

    # Configuration
    max_topics = 20
    max_takeaways = 7
    if config and hasattr(config, "note"):
        max_topics = getattr(config.note, "max_topics", 20)
        max_takeaways = getattr(config.note, "max_key_takeaways", 7)

    # Duration
    duration = 0.0
    if transcript_segments:
        duration = transcript_segments[-1].end

    # Speaker segments (from diarization)
    speaker_segments = None
    speakers_dict = {}
    if speaker_data:
        speaker_segments = speaker_data.segments
        speakers_dict = {
            sid: {
                "total_talk_time": prof.total_talk_time,
                "word_count": prof.word_count,
                "talk_ratio": prof.talk_ratio,
            }
            for sid, prof in speaker_data.speakers.items()
        }

    # Step 1: Detect topics
    topics = detect_topics(transcript_segments, max_topics=max_topics)

    # Enrich topics with speaker labels
    if speaker_segments:
        for topic in topics:
            labels: dict[str, list[str]] = {}
            for spk_seg in speaker_segments:
                if spk_seg.start >= topic.start_time and spk_seg.end <= topic.end_time:
                    sid = spk_seg.speaker_id
                    if sid not in labels:
                        labels[sid] = []
                    labels[sid].append(spk_seg.text)
            topic.speaker_labels = labels

    # Step 2: Extract action items
    action_items = extract_action_items(transcript_segments, speaker_segments)

    # Step 3: Extract decisions
    decisions = extract_decisions(transcript_segments, speaker_segments)

    # Step 4: Generate summaries
    executive_summary = generate_executive_summary(topics, action_items, decisions)
    key_takeaways = generate_key_takeaways(
        topics, action_items, decisions, max_items=max_takeaways
    )

    # Step 5: Keywords (from NLP engine if available, otherwise extract)
    if nlp_data and hasattr(nlp_data, "entities"):
        keywords = [e.text for e in nlp_data.entities[:15]]
    else:
        full_text = " ".join(seg.text for seg in transcript_segments)
        keywords = _extract_keywords(full_text, top_n=15)

    # Step 6: Build full transcript
    full_transcript = build_full_transcript(transcript_segments, speaker_segments)

    # Step 7: Build search index
    search_index = build_search_index(topics, transcript_segments)

    # Step 8: Generate title
    title = generate_meeting_title(transcript_segments)

    notes = MeetingNotes(
        title=title,
        date=date.today().isoformat(),
        duration=duration,
        executive_summary=executive_summary,
        topics=topics,
        action_items=action_items,
        decisions=decisions,
        key_takeaways=key_takeaways,
        keywords=keywords,
        speakers=speakers_dict,
        full_transcript=full_transcript,
        search_index=search_index,
    )

    logger.info(
        "Notes generated: %d topics, %d action items, %d decisions, %d takeaways",
        len(topics), len(action_items), len(decisions), len(key_takeaways),
    )

    return notes
