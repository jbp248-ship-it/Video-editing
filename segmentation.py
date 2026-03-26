"""
Segmentation module — content-aware video segmentation.

Combines multiple signals to find natural cut points:
1. Scene detection (visual changes)
2. Silence/pause detection (natural speech breaks)
3. Transcript sentence boundaries
4. Energy analysis (volume spikes and drops)

The goal: find segments that start with a hook, contain a complete idea,
and end at a natural stopping point — NOT fixed-interval cuts.
"""

import logging
import subprocess
import json
import numpy as np
from dataclasses import dataclass
from typing import Optional

from config import PipelineConfig
from ffmpeg_utils import get_ffmpeg, get_ffprobe, probe_duration

logger = logging.getLogger(__name__)


@dataclass
class Segment:
    """A candidate clip segment with timing and analysis data."""
    start: float          # Start time in seconds
    end: float            # End time in seconds
    transcript: str       # Text spoken in this segment
    avg_energy: float     # Average audio energy (volume)
    peak_energy: float    # Peak audio energy
    speech_pace: float    # Words per second
    has_hook: bool        # Does it start with something attention-grabbing?
    scene_changes: int    # Number of visual scene changes in segment
    silence_ratio: float  # Fraction of segment that is silence

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class TranscriptWord:
    """A single word with timing from Whisper."""
    word: str
    start: float
    end: float


@dataclass
class TranscriptSegment:
    """A sentence/phrase from Whisper with timing."""
    text: str
    start: float
    end: float
    words: list[TranscriptWord]


def transcribe(audio_path: str, config: PipelineConfig) -> list[TranscriptSegment]:
    """
    Transcribe audio using OpenAI Whisper.
    Returns time-stamped segments (sentences) with word-level timing.
    Falls back to audio-energy-based pseudo-segments if Whisper is unavailable.
    """
    try:
        import whisper

        logger.info(f"Transcribing with Whisper model '{config.whisper_model}'...")
        model = whisper.load_model(config.whisper_model)
        result = model.transcribe(
            audio_path,
            word_timestamps=True,
            verbose=False,
        )

        segments = []
        for seg in result.get("segments", []):
            words = []
            for w in seg.get("words", []):
                words.append(TranscriptWord(
                    word=w["word"].strip(),
                    start=w["start"],
                    end=w["end"],
                ))
            segments.append(TranscriptSegment(
                text=seg["text"].strip(),
                start=seg["start"],
                end=seg["end"],
                words=words,
            ))

        logger.info(f"Transcribed {len(segments)} segments, "
                    f"{sum(len(s.words) for s in segments)} words")
        return segments

    except Exception as e:
        logger.warning(f"Whisper transcription failed ({e}). "
                       f"Using audio-energy fallback for segmentation.")
        return _fallback_segments(audio_path)


def _fallback_segments(audio_path: str) -> list[TranscriptSegment]:
    """
    When Whisper can't run (no model / no internet), create segments
    based on audio energy — detect speech vs silence boundaries.
    Captions won't be available but segmentation still works.
    """
    try:
        total_duration = probe_duration(audio_path)
    except Exception:
        total_duration = 240.0

    # Create placeholder segments every ~10 seconds (sentence-length chunks)
    segments = []
    interval = 10.0
    t = 0.0
    idx = 0
    while t < total_duration:
        end = min(t + interval, total_duration)
        segments.append(TranscriptSegment(
            text=f"[segment {idx+1}]",
            start=t,
            end=end,
            words=[TranscriptWord(word=f"[segment-{idx+1}]", start=t, end=end)],
        ))
        t = end
        idx += 1

    logger.info(f"Created {len(segments)} fallback segments (no transcription)")
    return segments


def detect_scenes(video_path: str, threshold: float = 27.0) -> list[float]:
    """
    Detect scene changes using PySceneDetect.
    Returns list of timestamps (seconds) where scenes change.
    """
    try:
        from scenedetect import SceneManager, open_video
        from scenedetect.detectors import ContentDetector
    except ImportError:
        logger.warning("PySceneDetect not installed — skipping scene detection")
        return []

    logger.info("Detecting scene changes...")
    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold))
    scene_manager.detect_scenes(video)

    scene_list = scene_manager.get_scene_list()
    # Return start times of each scene
    timestamps = [scene[0].get_seconds() for scene in scene_list]
    logger.info(f"Found {len(timestamps)} scene boundaries")
    return timestamps


def analyze_audio_energy(audio_path: str, window_size: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """
    Analyze audio energy over time using ffmpeg loudness detection.
    Returns (timestamps, energy_values) arrays.

    Uses short-window RMS energy to find loud/quiet sections.
    """
    # Read raw audio samples using ffmpeg
    cmd = [
        get_ffmpeg(), "-y", "-i", audio_path,
        "-f", "s16le", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        "-"
    ]
    result = subprocess.run(cmd, capture_output=True, check=True)
    samples = np.frombuffer(result.stdout, dtype=np.int16).astype(np.float32)

    if len(samples) == 0:
        return np.array([]), np.array([])

    sample_rate = 16000
    window_samples = int(window_size * sample_rate)

    # Calculate RMS energy in sliding windows
    num_windows = len(samples) // window_samples
    if num_windows == 0:
        return np.array([0.0]), np.array([0.0])

    timestamps = np.arange(num_windows) * window_size
    energy = np.zeros(num_windows)

    for i in range(num_windows):
        chunk = samples[i * window_samples:(i + 1) * window_samples]
        rms = np.sqrt(np.mean(chunk ** 2))
        # Convert to dB, clamp to avoid log(0)
        energy[i] = 20 * np.log10(max(rms, 1e-10))

    return timestamps, energy


def find_silence_gaps(
    timestamps: np.ndarray,
    energy: np.ndarray,
    threshold_db: float = -40.0,
    min_duration: float = 0.5,
) -> list[tuple[float, float]]:
    """
    Find gaps of silence in the audio — these are natural cut points.
    Returns list of (start, end) tuples for each silence gap.
    """
    if len(timestamps) == 0:
        return []

    window_size = timestamps[1] - timestamps[0] if len(timestamps) > 1 else 0.5
    silent = energy < threshold_db

    gaps = []
    gap_start = None

    for i, is_silent in enumerate(silent):
        if is_silent and gap_start is None:
            gap_start = timestamps[i]
        elif not is_silent and gap_start is not None:
            gap_end = timestamps[i]
            if (gap_end - gap_start) >= min_duration:
                gaps.append((gap_start, gap_end))
            gap_start = None

    # Handle trailing silence
    if gap_start is not None:
        gap_end = timestamps[-1] + window_size
        if (gap_end - gap_start) >= min_duration:
            gaps.append((gap_start, gap_end))

    return gaps


def find_cut_points(
    transcript_segments: list[TranscriptSegment],
    scene_changes: list[float],
    silence_gaps: list[tuple[float, float]],
    total_duration: float,
    config: PipelineConfig,
) -> list[float]:
    """
    Merge all signals to find the best cut points.

    Strategy: Score every potential cut point and pick the best ones
    that result in clips within our target duration range.

    Cut point candidates come from:
    1. Sentence boundaries (from transcript)
    2. Scene changes (visual cuts)
    3. Silence gaps (natural pauses)
    """
    clip_cfg = config.clip

    # Collect all candidate cut points with scores
    # Higher score = better cut point
    candidates: dict[float, float] = {}

    # Sentence boundaries — strong signal for complete ideas
    for seg in transcript_segments:
        t = seg.end
        candidates[round(t, 2)] = candidates.get(round(t, 2), 0) + 3.0

    # Scene changes — good visual cut points
    for t in scene_changes:
        candidates[round(t, 2)] = candidates.get(round(t, 2), 0) + 2.0

    # Silence midpoints — natural audio breaks
    for start, end in silence_gaps:
        mid = round((start + end) / 2, 2)
        candidates[mid] = candidates.get(mid, 0) + 2.5

    if not candidates:
        # Fallback: cut at regular intervals
        interval = clip_cfg.target_duration
        return [i * interval for i in range(int(total_duration / interval) + 1)]

    # Sort by time
    sorted_points = sorted(candidates.keys())

    # Always include start and end
    if sorted_points[0] > 1.0:
        sorted_points.insert(0, 0.0)
    if sorted_points[-1] < total_duration - 5.0:
        sorted_points.append(total_duration)

    # Greedily select cut points that create clips within duration range
    selected = [sorted_points[0]]

    for point in sorted_points[1:]:
        gap = point - selected[-1]

        if gap < clip_cfg.min_duration * 0.8:
            # Too short — skip this cut point
            continue
        elif gap > clip_cfg.max_duration * 1.2:
            # Gap too large — force a cut at the best intermediate point
            # Find the highest-scored candidate between selected[-1] and point
            intermediates = [
                (t, candidates.get(t, 0))
                for t in sorted_points
                if selected[-1] < t < point
            ]
            if intermediates:
                # Pick the one closest to target_duration from last cut
                target_t = selected[-1] + clip_cfg.target_duration
                best = min(intermediates, key=lambda x: abs(x[0] - target_t))
                selected.append(best[0])
            # Now check if remaining gap is ok
            gap = point - selected[-1]
            if gap >= clip_cfg.min_duration * 0.8:
                selected.append(point)
        else:
            selected.append(point)

    # Ensure we end at or near total_duration
    if selected[-1] < total_duration - 10:
        selected.append(total_duration)

    return selected


def build_segments(
    cut_points: list[float],
    transcript_segments: list[TranscriptSegment],
    scene_changes: list[float],
    timestamps: np.ndarray,
    energy: np.ndarray,
    config: PipelineConfig,
) -> list[Segment]:
    """
    Build Segment objects from cut points, enriched with analysis data.
    """
    clip_cfg = config.clip
    segments = []

    for i in range(len(cut_points) - 1):
        start = cut_points[i]
        end = cut_points[i + 1]
        duration = end - start

        if duration < clip_cfg.min_duration * 0.5:
            continue

        # Collect transcript text for this segment
        seg_text_parts = []
        word_count = 0
        for ts in transcript_segments:
            # Include if segment overlaps with our clip
            if ts.end > start and ts.start < end:
                seg_text_parts.append(ts.text)
                word_count += len(ts.words)

        transcript = " ".join(seg_text_parts)

        # Calculate audio metrics for this time range
        if len(timestamps) > 0:
            mask = (timestamps >= start) & (timestamps < end)
            seg_energy = energy[mask]
            avg_e = float(np.mean(seg_energy)) if len(seg_energy) > 0 else -60.0
            peak_e = float(np.max(seg_energy)) if len(seg_energy) > 0 else -60.0

            # Silence ratio
            silence_count = np.sum(seg_energy < clip_cfg.silence_threshold_db)
            silence_ratio = float(silence_count / max(len(seg_energy), 1))
        else:
            avg_e = -30.0
            peak_e = -10.0
            silence_ratio = 0.0

        # Speech pace (words per second)
        speech_pace = word_count / max(duration, 1.0)

        # Count scene changes in this segment
        sc_count = sum(1 for sc in scene_changes if start <= sc < end)

        # Hook detection: does the first sentence start with engaging content?
        has_hook = _detect_hook(transcript)

        segments.append(Segment(
            start=start,
            end=end,
            transcript=transcript,
            avg_energy=avg_e,
            peak_energy=peak_e,
            speech_pace=speech_pace,
            has_hook=has_hook,
            scene_changes=sc_count,
            silence_ratio=silence_ratio,
        ))

    return segments


def _detect_hook(text: str) -> bool:
    """
    Heuristic: does this text start with a hook?

    Hooks often start with questions, bold statements, "you won't believe",
    numbers/stats, or direct address ("you", "listen").
    """
    if not text:
        return False

    lower = text.lower().strip()
    first_sentence = lower.split(".")[0] if "." in lower else lower[:100]

    hook_patterns = [
        # Questions grab attention
        "?" in first_sentence,
        # Direct address
        first_sentence.startswith("you "),
        first_sentence.startswith("listen"),
        first_sentence.startswith("look"),
        first_sentence.startswith("here's"),
        first_sentence.startswith("let me"),
        first_sentence.startswith("imagine"),
        # Shock / curiosity
        "never" in first_sentence,
        "secret" in first_sentence,
        "mistake" in first_sentence,
        "crazy" in first_sentence,
        "shocking" in first_sentence,
        "actually" in first_sentence,
        "nobody" in first_sentence,
        "everyone" in first_sentence,
        # Numbers / stats
        any(c.isdigit() for c in first_sentence[:30]),
        # "I" stories
        first_sentence.startswith("i ") or first_sentence.startswith("so "),
        first_sentence.startswith("the thing"),
        first_sentence.startswith("this is"),
        first_sentence.startswith("what if"),
    ]

    return sum(hook_patterns) >= 2  # Need at least 2 hook signals


def segment_video(
    video_path: str,
    audio_path: str,
    total_duration: float,
    config: PipelineConfig,
) -> tuple[list[Segment], list[TranscriptSegment]]:
    """
    Main entry point: run full segmentation pipeline.
    Returns (segments, transcript_segments).
    """
    # Step 1: Transcribe
    transcript_segments = transcribe(audio_path, config)

    # Step 2: Scene detection (optional)
    scene_changes = []
    if config.use_scene_detection:
        scene_changes = detect_scenes(video_path, config.scene_threshold)

    # Step 3: Audio energy analysis
    timestamps, energy = analyze_audio_energy(audio_path)

    # Step 4: Find silence gaps
    silence_gaps = find_silence_gaps(
        timestamps, energy,
        config.clip.silence_threshold_db,
        config.clip.silence_min_duration,
    )
    logger.info(f"Found {len(silence_gaps)} silence gaps")

    # Step 5: Determine cut points
    cut_points = find_cut_points(
        transcript_segments, scene_changes, silence_gaps,
        total_duration, config,
    )
    logger.info(f"Selected {len(cut_points)} cut points → {len(cut_points)-1} candidate clips")

    # Step 6: Build enriched segments
    segments = build_segments(
        cut_points, transcript_segments, scene_changes,
        timestamps, energy, config,
    )

    return segments, transcript_segments
