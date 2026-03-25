"""
Scoring module — ranks clip segments by predicted virality.

The virality score is a weighted combination of signals:

1. Hook Strength (25%): Does the clip open with something that grabs attention?
   - Questions, bold claims, direct address, numbers
   - Measured by first-3-second transcript analysis

2. Emotional Intensity (20%): How energetic / emotional is the delivery?
   - High average audio energy = passionate delivery
   - Wide energy range = dynamic, not monotone

3. Speech Pace Variation (10%): Varied pacing keeps viewers engaged.
   - Monotone pace = boring; varied pace = interesting
   - Measured by comparing local pace to segment average

4. Completeness (20%): Does the clip contain a full idea?
   - Starts with a setup and ends with a conclusion
   - Penalize clips that cut mid-sentence

5. Surprise Factor (15%): Sudden changes signal interesting moments.
   - Audio energy spikes
   - Scene changes
   - Unusual speech patterns

6. Brevity Bonus (10%): Shorter, punchier clips often perform better.
   - Clips closer to 60s score higher than 120s clips
   - TikTok audience has short attention span
"""

import logging
import numpy as np
from dataclasses import dataclass

from config import PipelineConfig, ScoringConfig
from segmentation import Segment, TranscriptSegment

logger = logging.getLogger(__name__)


@dataclass
class ScoredSegment:
    """A segment with its virality score and component scores."""
    segment: Segment
    total_score: float
    hook_score: float
    emotion_score: float
    pace_score: float
    completeness_score: float
    surprise_score: float
    brevity_score: float
    label: str              # Short label like "hook", "story", "shocking"


def score_hook(segment: Segment, transcript_segments: list[TranscriptSegment]) -> float:
    """
    Score 0-1: How strong is the hook in the first 3 seconds?
    """
    score = 0.0

    # Basic hook detection
    if segment.has_hook:
        score += 0.5

    # Check first few words of transcript
    text = segment.transcript.lower().strip()
    if not text:
        return 0.1

    first_words = text[:80]  # Roughly first 3 seconds of speech

    # Question = great hook
    if "?" in first_words:
        score += 0.3

    # Numbers/stats create authority
    if any(c.isdigit() for c in first_words[:40]):
        score += 0.15

    # Strong opening words
    strong_openers = ["here's", "the", "this", "what", "how", "why",
                      "you", "never", "imagine", "so", "i"]
    first_word = first_words.split()[0] if first_words.split() else ""
    if first_word in strong_openers:
        score += 0.15

    # Penalize weak openings
    weak_openers = ["um", "uh", "like", "and", "but", "okay", "alright"]
    if first_word in weak_openers:
        score -= 0.3

    return max(0.0, min(1.0, score))


def score_emotion(segment: Segment) -> float:
    """
    Score 0-1: How emotionally intense is the delivery?

    Uses audio energy as a proxy for emotional intensity.
    Louder, more dynamic audio = more passion = more engaging.
    """
    # Normalize energy from dB range [-60, 0] to [0, 1]
    # Typical speech: -30 to -10 dB
    avg_normalized = (segment.avg_energy + 50) / 40  # Maps -50→0, -10→1
    avg_normalized = max(0.0, min(1.0, avg_normalized))

    # Dynamic range bonus: wide range = not monotone
    dynamic_range = segment.peak_energy - segment.avg_energy
    range_normalized = min(dynamic_range / 20.0, 1.0)  # 20dB range = max

    # Penalize too much silence
    silence_penalty = segment.silence_ratio * 0.5

    score = (avg_normalized * 0.6 + range_normalized * 0.4) - silence_penalty
    return max(0.0, min(1.0, score))


def score_pace(segment: Segment) -> float:
    """
    Score 0-1: How well-paced is the speech?

    Ideal pace for viral content: ~2.5-4 words/sec (conversational, energetic).
    Too slow = boring. Too fast = hard to follow.
    """
    pace = segment.speech_pace

    # Optimal range: 2.5-4.0 wps
    if 2.5 <= pace <= 4.0:
        score = 1.0
    elif 1.5 <= pace < 2.5:
        score = 0.5 + (pace - 1.5) * 0.5  # Linear ramp up
    elif 4.0 < pace <= 5.5:
        score = 1.0 - (pace - 4.0) * 0.33  # Linear ramp down
    elif pace < 1.5:
        score = max(0.1, pace / 1.5 * 0.5)  # Very slow
    else:
        score = max(0.1, 1.0 - (pace - 5.5) * 0.2)  # Very fast

    return max(0.0, min(1.0, score))


def score_completeness(segment: Segment) -> float:
    """
    Score 0-1: Does the clip contain a complete idea?

    A complete clip:
    - Doesn't start mid-sentence
    - Doesn't end mid-sentence
    - Has enough content (not just a few words)
    """
    text = segment.transcript.strip()

    if not text:
        return 0.1

    score = 0.5  # Base score

    # Bonus: ends with sentence-ending punctuation
    if text[-1] in ".!?\"'":
        score += 0.2

    # Bonus: starts with capital letter (sentence start)
    if text[0].isupper():
        score += 0.1

    # Bonus: has multiple sentences (more complete idea)
    sentence_count = text.count(".") + text.count("!") + text.count("?")
    if sentence_count >= 2:
        score += 0.1
    if sentence_count >= 4:
        score += 0.1

    # Penalty: too few words (fragment)
    word_count = len(text.split())
    if word_count < 20:
        score -= 0.3
    elif word_count < 50:
        score -= 0.1

    # Penalty: very high silence ratio = not much content
    if segment.silence_ratio > 0.5:
        score -= 0.2

    return max(0.0, min(1.0, score))


def score_surprise(segment: Segment) -> float:
    """
    Score 0-1: Does the clip contain surprising/unexpected moments?

    Proxied by:
    - High peak energy (someone yelling/exclaiming)
    - Scene changes (visual variety)
    - Large gap between avg and peak (sudden changes)
    """
    score = 0.0

    # Energy spike: big difference between average and peak
    spike = segment.peak_energy - segment.avg_energy
    if spike > 15:
        score += 0.4
    elif spike > 10:
        score += 0.25
    elif spike > 5:
        score += 0.1

    # Scene changes = visual variety / surprise
    if segment.scene_changes >= 3:
        score += 0.3
    elif segment.scene_changes >= 1:
        score += 0.15

    # High peak energy = emphatic moment
    if segment.peak_energy > -10:
        score += 0.3
    elif segment.peak_energy > -15:
        score += 0.15

    return max(0.0, min(1.0, score))


def score_brevity(segment: Segment, config: PipelineConfig) -> float:
    """
    Score 0-1: Shorter, punchier clips score higher.
    60s is ideal, 120s is acceptable, beyond that drops off.
    """
    duration = segment.duration
    min_d = config.clip.min_duration
    max_d = config.clip.max_duration

    if duration <= min_d:
        return 1.0
    elif duration <= (min_d + max_d) / 2:
        # Linear drop from 1.0 to 0.6
        ratio = (duration - min_d) / ((max_d - min_d) / 2)
        return 1.0 - ratio * 0.4
    elif duration <= max_d:
        # Linear drop from 0.6 to 0.3
        ratio = (duration - (min_d + max_d) / 2) / ((max_d - min_d) / 2)
        return 0.6 - ratio * 0.3
    else:
        return 0.2


def assign_label(scored: ScoredSegment) -> str:
    """
    Assign a human-readable label based on the dominant scoring signal.
    Used for filename generation.
    """
    scores = {
        "hook": scored.hook_score,
        "emotional": scored.emotion_score,
        "story": scored.completeness_score,
        "dynamic": scored.pace_score,
        "shocking": scored.surprise_score,
        "punchy": scored.brevity_score,
    }

    # Pick the highest signal
    label = max(scores, key=scores.get)

    # Special cases
    if scored.hook_score > 0.7 and scored.surprise_score > 0.6:
        label = "viral"
    elif scored.completeness_score > 0.8 and scored.hook_score > 0.5:
        label = "story"
    elif scored.surprise_score > 0.8:
        label = "shocking"

    return label


def score_segments(
    segments: list[Segment],
    transcript_segments: list[TranscriptSegment],
    config: PipelineConfig,
) -> list[ScoredSegment]:
    """
    Score all segments and return them ranked by virality score (highest first).
    Only returns top N clips as configured.
    """
    weights = config.scoring
    scored = []

    for seg in segments:
        hook = score_hook(seg, transcript_segments)
        emotion = score_emotion(seg)
        pace = score_pace(seg)
        completeness = score_completeness(seg)
        surprise = score_surprise(seg)
        brevity = score_brevity(seg, config)

        total = (
            hook * weights.weight_hook_strength +
            emotion * weights.weight_emotional_intensity +
            pace * weights.weight_speech_pace_variation +
            completeness * weights.weight_completeness +
            surprise * weights.weight_surprise_factor +
            brevity * weights.weight_brevity_bonus
        )

        ss = ScoredSegment(
            segment=seg,
            total_score=total,
            hook_score=hook,
            emotion_score=emotion,
            pace_score=pace,
            completeness_score=completeness,
            surprise_score=surprise,
            brevity_score=brevity,
            label="",
        )
        ss.label = assign_label(ss)
        scored.append(ss)

    # Sort by total score, highest first
    scored.sort(key=lambda s: s.total_score, reverse=True)

    # Take top N
    top = scored[:config.clip.max_clips]

    for i, s in enumerate(top):
        logger.info(
            f"  #{i+1} [{s.label}] {s.segment.start:.1f}-{s.segment.end:.1f}s "
            f"({s.segment.duration:.0f}s) score={s.total_score:.3f} "
            f"hook={s.hook_score:.2f} emotion={s.emotion_score:.2f} "
            f"complete={s.completeness_score:.2f} surprise={s.surprise_score:.2f}"
        )

    return top
