"""
Captions module — generates styled, time-synced captions for each clip.

Features:
- Word-level timing from Whisper transcript
- TikTok-style large readable captions
- Keyword highlighting (optional)
- SRT export and ffmpeg drawtext filter generation
"""

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from config import PipelineConfig, CaptionConfig
from segmentation import TranscriptSegment, TranscriptWord

logger = logging.getLogger(__name__)


@dataclass
class CaptionLine:
    """A single caption line to display on screen."""
    text: str
    start: float      # Relative to clip start
    end: float         # Relative to clip start
    words: list[TranscriptWord]
    is_keyword_line: bool = False


def extract_clip_words(
    transcript_segments: list[TranscriptSegment],
    clip_start: float,
    clip_end: float,
) -> list[TranscriptWord]:
    """Get all words that fall within a clip's time range."""
    words = []
    for seg in transcript_segments:
        for word in seg.words:
            if word.start >= clip_start and word.end <= clip_end:
                words.append(TranscriptWord(
                    word=word.word,
                    start=word.start - clip_start,   # Make relative to clip
                    end=word.end - clip_start,
                ))
    return words


def group_words_into_lines(
    words: list[TranscriptWord],
    max_chars: int = 35,
) -> list[CaptionLine]:
    """
    Group words into display lines, respecting character limits.
    Each line shows for the duration of its words.
    """
    if not words:
        return []

    lines = []
    current_words = []
    current_chars = 0

    for word in words:
        word_len = len(word.word) + 1  # +1 for space

        if current_chars + word_len > max_chars and current_words:
            # Flush current line
            text = " ".join(w.word for w in current_words)
            lines.append(CaptionLine(
                text=text,
                start=current_words[0].start,
                end=current_words[-1].end,
                words=list(current_words),
            ))
            current_words = []
            current_chars = 0

        current_words.append(word)
        current_chars += word_len

    # Flush remaining
    if current_words:
        text = " ".join(w.word for w in current_words)
        lines.append(CaptionLine(
            text=text,
            start=current_words[0].start,
            end=current_words[-1].end,
            words=list(current_words),
        ))

    return lines


def identify_keywords(text: str, top_n: int = 5) -> set[str]:
    """
    Simple keyword extraction — words that are likely important.
    Uses word frequency + length + position heuristics.
    """
    # Common stop words to exclude
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "can", "shall", "to", "of",
        "in", "for", "on", "with", "at", "by", "from", "as", "into",
        "through", "during", "before", "after", "and", "but", "or",
        "not", "no", "so", "if", "then", "than", "that", "this",
        "it", "its", "i", "me", "my", "you", "your", "he", "she",
        "we", "they", "them", "what", "which", "who", "when", "where",
        "how", "all", "each", "every", "both", "few", "more", "most",
        "other", "some", "such", "just", "about", "up", "out", "like",
        "really", "very", "also", "well", "even", "still", "already",
        "got", "get", "going", "go", "know", "think", "thing", "right",
        "yeah", "okay", "oh", "um", "uh",
    }

    words = re.findall(r"[a-zA-Z']+", text.lower())
    # Score words
    word_scores = {}
    for i, w in enumerate(words):
        if w in stop_words or len(w) < 3:
            continue
        # Frequency
        word_scores[w] = word_scores.get(w, 0) + 1
        # Length bonus
        if len(w) > 6:
            word_scores[w] += 0.5
        # Early position bonus (hook words)
        if i < 10:
            word_scores[w] += 0.5

    sorted_words = sorted(word_scores.items(), key=lambda x: x[1], reverse=True)
    return {w for w, _ in sorted_words[:top_n]}


def generate_srt(
    lines: list[CaptionLine],
    output_path: str,
) -> str:
    """Export captions as SRT subtitle file."""
    srt_content = []

    for i, line in enumerate(lines, 1):
        start = _format_srt_time(line.start)
        end = _format_srt_time(line.end)
        srt_content.append(f"{i}")
        srt_content.append(f"{start} --> {end}")
        srt_content.append(line.text)
        srt_content.append("")

    content = "\n".join(srt_content)
    Path(output_path).write_text(content)
    logger.info(f"Wrote SRT: {output_path}")
    return output_path


def _format_srt_time(seconds: float) -> str:
    """Convert seconds to SRT timestamp format HH:MM:SS,mmm."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_caption_filter(
    lines: list[CaptionLine],
    config: CaptionConfig,
    keywords: set[str],
) -> str:
    """
    Build ffmpeg drawtext filter chain for burned-in captions.

    This creates a series of drawtext filters, one per caption line,
    each with enable='between(t,start,end)' to show at the right time.
    """
    filters = []
    font = config.font_path or "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    for line in lines:
        # Escape special characters for ffmpeg
        escaped_text = _escape_ffmpeg(line.text)

        f = (
            f"drawtext="
            f"text='{escaped_text}':"
            f"fontfile='{font}':"
            f"fontsize={config.font_size}:"
            f"fontcolor={config.font_color}:"
            f"borderw={config.outline_width}:"
            f"bordercolor={config.outline_color}:"
            f"x=(w-text_w)/2:"
            f"y={config.y_offset}:"
            f"enable='between(t,{line.start:.3f},{line.end:.3f})'"
        )
        filters.append(f)

        # Add keyword highlight overlay if enabled
        if config.highlight_keywords and keywords:
            highlighted = _highlight_text(line.text, keywords)
            if highlighted != line.text:
                escaped_hl = _escape_ffmpeg(highlighted)
                f_hl = (
                    f"drawtext="
                    f"text='{escaped_hl}':"
                    f"fontfile='{font}':"
                    f"fontsize={config.font_size}:"
                    f"fontcolor={config.highlight_color}:"
                    f"borderw={config.outline_width}:"
                    f"bordercolor={config.outline_color}:"
                    f"x=(w-text_w)/2:"
                    f"y={config.y_offset}:"
                    f"enable='between(t,{line.start:.3f},{line.end:.3f})'"
                )
                filters.append(f_hl)

    return ",".join(filters)


def _highlight_text(text: str, keywords: set[str]) -> str:
    """Replace non-keyword words with spaces to create a highlight-only layer."""
    words = text.split()
    result = []
    for w in words:
        clean = re.sub(r"[^a-zA-Z']", "", w).lower()
        if clean in keywords:
            result.append(w)
        else:
            result.append(" " * len(w))
    return " ".join(result)


def _escape_ffmpeg(text: str) -> str:
    """Escape text for ffmpeg drawtext filter."""
    # ffmpeg drawtext needs these escaped
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "'\\''")
    text = text.replace(":", "\\:")
    text = text.replace("%", "%%")
    return text


def generate_captions(
    clip_start: float,
    clip_end: float,
    transcript_segments: list[TranscriptSegment],
    config: PipelineConfig,
    srt_output_path: str,
) -> tuple[list[CaptionLine], str, set[str]]:
    """
    Main entry: generate captions for a clip.
    Returns (caption_lines, ffmpeg_filter_string, keywords).
    """
    # Extract words for this clip
    words = extract_clip_words(transcript_segments, clip_start, clip_end)

    # Group into display lines
    lines = group_words_into_lines(words, config.caption.max_chars_per_line)

    # Extract keywords for highlighting
    full_text = " ".join(w.word for w in words)
    keywords = identify_keywords(full_text) if config.caption.highlight_keywords else set()

    # Generate SRT file
    generate_srt(lines, srt_output_path)

    # Build ffmpeg filter
    filter_str = build_caption_filter(lines, config.caption, keywords)

    logger.info(f"Generated {len(lines)} caption lines, {len(keywords)} keywords")
    return lines, filter_str, keywords
