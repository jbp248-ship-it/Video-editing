"""
Speaker diarization module — identifies who is speaking when.

Provides two approaches with automatic fallback:
1. Energy-based diarization (always available, numpy + ffmpeg only)
2. pyannote.audio diarization (optional, much more accurate)

The energy-based approach extracts audio features (RMS energy,
zero-crossing rate, spectral centroid) per window and clusters
them using k-means. It won't be perfect but works offline with
zero extra dependencies beyond numpy and ffmpeg.
"""

import logging
import subprocess
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from ffmpeg_utils import get_ffmpeg

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class SpeakerSegment:
    speaker_id: str       # "Speaker 1", "Speaker 2", etc.
    start: float          # Start time in seconds
    end: float            # End time in seconds
    text: str             # What they said
    confidence: float     # 0-1 confidence in speaker assignment


@dataclass
class SpeakerProfile:
    speaker_id: str
    total_talk_time: float     # Seconds
    word_count: int
    segment_count: int
    avg_energy: float          # Average audio energy when speaking
    talk_ratio: float          # Percentage of total talk time
    top_topics: list[str] = field(default_factory=list)


@dataclass
class DiarizationResult:
    segments: list[SpeakerSegment]
    speakers: dict[str, SpeakerProfile]   # speaker_id -> profile
    num_speakers: int
    timeline: list[dict]                  # Chronological [{speaker, start, end, text}]


# ---------------------------------------------------------------------------
# Audio feature extraction helpers
# ---------------------------------------------------------------------------

_SAMPLE_RATE = 16000


def _read_audio_samples(audio_path: str) -> np.ndarray:
    """Read raw 16-bit PCM samples from an audio file via ffmpeg."""
    cmd = [
        get_ffmpeg(), "-y", "-i", audio_path,
        "-f", "s16le", "-acodec", "pcm_s16le",
        "-ar", str(_SAMPLE_RATE), "-ac", "1",
        "-",
    ]
    result = subprocess.run(cmd, capture_output=True, check=True)
    samples = np.frombuffer(result.stdout, dtype=np.int16).astype(np.float32)
    return samples


def extract_audio_features(audio_path: str, window_size: float = 0.5) -> np.ndarray:
    """
    Extract per-window audio features for speaker clustering.

    For each window computes:
      - RMS energy
      - Zero-crossing rate
      - Spectral centroid (approximated via FFT)

    Returns feature matrix of shape (num_windows, 3).
    """
    samples = _read_audio_samples(audio_path)

    if len(samples) == 0:
        logger.warning("Audio file produced no samples")
        return np.empty((0, 3))

    window_samples = int(window_size * _SAMPLE_RATE)
    num_windows = len(samples) // window_samples

    if num_windows == 0:
        logger.warning("Audio too short for even a single feature window")
        return np.empty((0, 3))

    features = np.zeros((num_windows, 3), dtype=np.float64)

    for i in range(num_windows):
        chunk = samples[i * window_samples:(i + 1) * window_samples]

        # 1. RMS energy
        rms = np.sqrt(np.mean(chunk ** 2))
        features[i, 0] = rms

        # 2. Zero-crossing rate
        signs = np.sign(chunk)
        # Avoid counting zeros as crossings
        signs[signs == 0] = 1
        crossings = np.sum(np.abs(np.diff(signs)) > 0)
        features[i, 1] = crossings / len(chunk)

        # 3. Spectral centroid via FFT
        magnitude = np.abs(np.fft.rfft(chunk))
        freqs = np.fft.rfftfreq(len(chunk), d=1.0 / _SAMPLE_RATE)
        total_mag = np.sum(magnitude)
        if total_mag > 0:
            features[i, 2] = np.sum(freqs * magnitude) / total_mag
        else:
            features[i, 2] = 0.0

    return features


# ---------------------------------------------------------------------------
# Simple k-means (numpy only, no sklearn)
# ---------------------------------------------------------------------------


def _kmeans(X: np.ndarray, k: int, max_iter: int = 100,
            seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    """
    Basic k-means clustering.

    Returns (labels, centroids).
    """
    rng = np.random.RandomState(seed)
    n = X.shape[0]

    # k-means++ initialisation
    centroids = np.empty((k, X.shape[1]))
    idx = rng.randint(n)
    centroids[0] = X[idx]

    for c in range(1, k):
        dists = np.min(
            np.sum((X[:, None, :] - centroids[None, :c, :]) ** 2, axis=2),
            axis=1,
        )
        probs = dists / (dists.sum() + 1e-12)
        idx = rng.choice(n, p=probs)
        centroids[c] = X[idx]

    labels = np.zeros(n, dtype=int)

    for _ in range(max_iter):
        # Assignment
        dists = np.sum((X[:, None, :] - centroids[None, :, :]) ** 2, axis=2)
        new_labels = np.argmin(dists, axis=1)

        if np.array_equal(new_labels, labels):
            break
        labels = new_labels

        # Update centroids
        for c in range(k):
            mask = labels == c
            if np.any(mask):
                centroids[c] = X[mask].mean(axis=0)

    return labels, centroids


def _silhouette_score(X: np.ndarray, labels: np.ndarray) -> float:
    """
    Compute mean silhouette score (simplified, numpy-only).
    """
    n = X.shape[0]
    unique_labels = np.unique(labels)
    if len(unique_labels) < 2:
        return -1.0

    # For large arrays, subsample to avoid O(n^2) blowup
    if n > 4000:
        rng = np.random.RandomState(0)
        idx = rng.choice(n, 4000, replace=False)
        X = X[idx]
        labels = labels[idx]
        n = 4000

    # Pairwise distance matrix
    diff = X[:, None, :] - X[None, :, :]
    dist = np.sqrt(np.sum(diff ** 2, axis=2))

    sil = np.zeros(n)
    for i in range(n):
        own = labels[i]
        own_mask = labels == own
        own_count = own_mask.sum()

        # mean intra-cluster distance
        if own_count > 1:
            a_i = dist[i, own_mask].sum() / (own_count - 1)
        else:
            a_i = 0.0

        # mean nearest-cluster distance
        b_i = np.inf
        for lbl in unique_labels:
            if lbl == own:
                continue
            other_mask = labels == lbl
            b_candidate = dist[i, other_mask].mean()
            if b_candidate < b_i:
                b_i = b_candidate

        denom = max(a_i, b_i)
        sil[i] = (b_i - a_i) / denom if denom > 0 else 0.0

    return float(np.mean(sil))


def cluster_speakers(features: np.ndarray,
                     num_speakers: Optional[int] = None) -> np.ndarray:
    """
    Cluster feature windows by speaker using k-means.

    If *num_speakers* is None, tries k=2..4 and picks the k with the
    best silhouette score.

    Returns an array of cluster labels (one per window).
    """
    if features.shape[0] == 0:
        return np.array([], dtype=int)

    # Normalise features to zero-mean, unit-variance per column
    std = features.std(axis=0)
    std[std == 0] = 1.0
    X = (features - features.mean(axis=0)) / std

    if num_speakers is not None:
        k = max(1, min(num_speakers, features.shape[0]))
        labels, _ = _kmeans(X, k)
        return labels

    # Auto-detect: try k=2..4
    best_score = -2.0
    best_labels = np.zeros(X.shape[0], dtype=int)
    max_k = min(4, X.shape[0])

    for k in range(2, max_k + 1):
        labels, _ = _kmeans(X, k)
        score = _silhouette_score(X, labels)
        logger.debug("k=%d  silhouette=%.3f", k, score)
        if score > best_score:
            best_score = score
            best_labels = labels.copy()

    # If even k=2 is bad, fall back to single speaker
    if best_score < 0.10:
        logger.info("Silhouette scores all low (%.3f); treating as single speaker",
                     best_score)
        return np.zeros(X.shape[0], dtype=int)

    num_found = len(np.unique(best_labels))
    logger.info("Auto-detected %d speakers (silhouette=%.3f)", num_found, best_score)
    return best_labels


# ---------------------------------------------------------------------------
# Diarization backends
# ---------------------------------------------------------------------------

def _diarize_energy(audio_path: str,
                    num_speakers: Optional[int],
                    window_size: float = 0.5) -> list[dict]:
    """
    Energy-based diarization (zero extra deps).

    Returns a list of raw diarization segments:
      [{"speaker": int, "start": float, "end": float}, ...]
    """
    logger.info("Running energy-based speaker diarization")
    features = extract_audio_features(audio_path, window_size=window_size)

    if features.shape[0] == 0:
        return []

    labels = cluster_speakers(features, num_speakers=num_speakers)

    # Convert per-window labels into contiguous speaker segments
    segments: list[dict] = []
    current_speaker = int(labels[0])
    seg_start = 0.0

    for i in range(1, len(labels)):
        if int(labels[i]) != current_speaker:
            segments.append({
                "speaker": current_speaker,
                "start": seg_start,
                "end": i * window_size,
            })
            current_speaker = int(labels[i])
            seg_start = i * window_size

    # Final segment
    segments.append({
        "speaker": current_speaker,
        "start": seg_start,
        "end": len(labels) * window_size,
    })

    return segments


def _diarize_pyannote(audio_path: str,
                      num_speakers: Optional[int]) -> list[dict]:
    """
    pyannote.audio-based diarization (much more accurate).

    Returns the same format as _diarize_energy.
    """
    from pyannote.audio import Pipeline as PyannotePipeline  # type: ignore

    logger.info("Running pyannote.audio speaker diarization")
    pipeline = PyannotePipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
    )

    params = {}
    if num_speakers is not None:
        params["num_speakers"] = num_speakers

    diarization = pipeline(audio_path, **params)

    segments: list[dict] = []
    speaker_map: dict[str, int] = {}

    for turn, _, speaker in diarization.itertracks(yield_label=True):
        if speaker not in speaker_map:
            speaker_map[speaker] = len(speaker_map)
        segments.append({
            "speaker": speaker_map[speaker],
            "start": turn.start,
            "end": turn.end,
        })

    return segments


# ---------------------------------------------------------------------------
# Core public functions
# ---------------------------------------------------------------------------

def assign_speakers_to_transcript(
    diarization_segments: list[dict],
    transcript_segments: list,
) -> list[SpeakerSegment]:
    """
    Map diarization results onto Whisper TranscriptSegment objects.

    For each transcript segment, finds which speaker has the most timing
    overlap and assigns them. Handles overlapping speech by choosing the
    dominant speaker.

    *transcript_segments* should have .text, .start, .end attributes
    (TranscriptSegment from segmentation.py).
    """
    if not diarization_segments:
        # No diarization data -- assign everything to Speaker 1
        return [
            SpeakerSegment(
                speaker_id="Speaker 1",
                start=ts.start,
                end=ts.end,
                text=ts.text,
                confidence=0.0,
            )
            for ts in transcript_segments
        ]

    results: list[SpeakerSegment] = []

    for ts in transcript_segments:
        # Calculate overlap with each diarization segment
        overlap_by_speaker: dict[int, float] = {}
        total_overlap = 0.0

        for ds in diarization_segments:
            ov_start = max(ts.start, ds["start"])
            ov_end = min(ts.end, ds["end"])
            overlap = max(0.0, ov_end - ov_start)

            if overlap > 0:
                spk = ds["speaker"]
                overlap_by_speaker[spk] = overlap_by_speaker.get(spk, 0.0) + overlap
                total_overlap += overlap

        if overlap_by_speaker:
            dominant = max(overlap_by_speaker, key=overlap_by_speaker.get)  # type: ignore[arg-type]
            dominant_overlap = overlap_by_speaker[dominant]
            confidence = dominant_overlap / max(total_overlap, 1e-9)
        else:
            dominant = 0
            confidence = 0.0

        results.append(SpeakerSegment(
            speaker_id=f"Speaker {dominant + 1}",
            start=ts.start,
            end=ts.end,
            text=ts.text,
            confidence=confidence,
        ))

    return results


def _extract_top_topics(text: str, top_n: int = 5) -> list[str]:
    """
    Lightweight keyword extraction: takes the most frequent non-stopword
    tokens (>= 4 chars) from *text*.
    """
    _STOP = {
        "this", "that", "with", "from", "have", "been", "were", "will",
        "would", "could", "should", "they", "them", "their", "there",
        "then", "than", "what", "when", "where", "which", "while",
        "about", "some", "into", "your", "also", "just", "like",
        "more", "very", "much", "only", "other", "over", "such",
        "does", "doing", "done", "each", "even", "going", "make",
        "know", "think", "really", "thing", "things", "well", "want",
        "because", "yeah", "okay", "right",
    }
    words = re.findall(r"[a-z]{4,}", text.lower())
    counts = Counter(w for w in words if w not in _STOP)
    return [w for w, _ in counts.most_common(top_n)]


def build_speaker_profiles(
    speaker_segments: list[SpeakerSegment],
    audio_path: Optional[str] = None,
) -> dict[str, SpeakerProfile]:
    """
    Calculate per-speaker statistics from diarized segments.

    Optionally reads audio energy from *audio_path* to compute
    average energy per speaker.
    """
    # Aggregate text / timing per speaker
    talk_times: dict[str, float] = {}
    word_counts: dict[str, int] = {}
    seg_counts: dict[str, int] = {}
    texts: dict[str, list[str]] = {}

    for seg in speaker_segments:
        sid = seg.speaker_id
        dur = seg.end - seg.start
        wc = len(seg.text.split()) if seg.text.strip() else 0

        talk_times[sid] = talk_times.get(sid, 0.0) + dur
        word_counts[sid] = word_counts.get(sid, 0) + wc
        seg_counts[sid] = seg_counts.get(sid, 0) + 1
        texts.setdefault(sid, []).append(seg.text)

    total_talk = sum(talk_times.values()) or 1.0

    # Optionally compute per-speaker energy from audio
    speaker_energy: dict[str, float] = {}
    if audio_path is not None:
        try:
            samples = _read_audio_samples(audio_path)
            for sid in talk_times:
                energy_values: list[float] = []
                for seg in speaker_segments:
                    if seg.speaker_id != sid:
                        continue
                    s_idx = int(seg.start * _SAMPLE_RATE)
                    e_idx = int(seg.end * _SAMPLE_RATE)
                    chunk = samples[s_idx:e_idx]
                    if len(chunk) > 0:
                        energy_values.append(float(np.sqrt(np.mean(chunk ** 2))))
                if energy_values:
                    speaker_energy[sid] = float(np.mean(energy_values))
        except Exception as exc:
            logger.warning("Could not compute speaker energy: %s", exc)

    profiles: dict[str, SpeakerProfile] = {}
    for sid in sorted(talk_times):
        profiles[sid] = SpeakerProfile(
            speaker_id=sid,
            total_talk_time=round(talk_times[sid], 2),
            word_count=word_counts[sid],
            segment_count=seg_counts[sid],
            avg_energy=round(speaker_energy.get(sid, 0.0), 2),
            talk_ratio=round(talk_times[sid] / total_talk * 100, 1),
            top_topics=_extract_top_topics(" ".join(texts.get(sid, []))),
        )

    return profiles


def generate_speaker_timeline(
    speaker_segments: list[SpeakerSegment],
) -> list[dict]:
    """
    Create a chronological timeline of speaker turns.

    Consecutive segments from the same speaker are merged into a
    single entry.

    Returns:
        [{"speaker": "Speaker 1", "start": 0.0, "end": 15.5, "text": "..."},
         ...]
    """
    if not speaker_segments:
        return []

    # Sort by start time
    ordered = sorted(speaker_segments, key=lambda s: s.start)

    timeline: list[dict] = []
    current = {
        "speaker": ordered[0].speaker_id,
        "start": ordered[0].start,
        "end": ordered[0].end,
        "text": ordered[0].text,
    }

    for seg in ordered[1:]:
        if seg.speaker_id == current["speaker"]:
            # Merge: extend current turn
            current["end"] = seg.end
            if seg.text:
                current["text"] += " " + seg.text
        else:
            timeline.append(current)
            current = {
                "speaker": seg.speaker_id,
                "start": seg.start,
                "end": seg.end,
                "text": seg.text,
            }

    timeline.append(current)
    return timeline


def format_speaker_transcript(speaker_segments: list[SpeakerSegment]) -> str:
    """
    Format the diarized transcript with speaker labels and timestamps.

    Example output::

        [00:00:15] Speaker 1: So today we're going to talk about...
        [00:00:32] Speaker 2: Right, and I think the key issue is...
    """
    timeline = generate_speaker_timeline(speaker_segments)
    lines: list[str] = []

    for entry in timeline:
        t = entry["start"]
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)

        if h > 0:
            ts = f"{h:02d}:{m:02d}:{s:02d}"
        else:
            ts = f"{m:02d}:{s:02d}"

        text = entry["text"].strip()
        lines.append(f"[{ts}] {entry['speaker']}: {text}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def diarize_audio(
    audio_path: str,
    num_speakers: Optional[int] = None,
    transcript_segments: Optional[list] = None,
) -> DiarizationResult:
    """
    Main entry point for speaker diarization.

    Attempts pyannote.audio first (if installed). Falls back to the
    energy-based approach which requires only numpy and ffmpeg.

    Args:
        audio_path: Path to a WAV file (16 kHz mono expected).
        num_speakers: Expected number of speakers. If None the system
            will try to detect automatically (2-4 range).
        transcript_segments: Optional list of TranscriptSegment objects
            from Whisper. If provided the diarization labels are mapped
            onto the transcript; otherwise synthetic segments are
            created from the raw diarization windows.

    Returns:
        A DiarizationResult with segments, speaker profiles, and timeline.
    """
    # --- pick backend ---
    raw_segments: list[dict] = []

    try:
        raw_segments = _diarize_pyannote(audio_path, num_speakers)
        logger.info("pyannote.audio diarization produced %d raw segments",
                     len(raw_segments))
    except Exception as exc:
        logger.info("pyannote.audio not available (%s); using energy-based fallback",
                     exc)
        raw_segments = _diarize_energy(audio_path, num_speakers)
        logger.info("Energy-based diarization produced %d raw segments",
                     len(raw_segments))

    # --- map onto transcript (if available) ---
    if transcript_segments:
        speaker_segs = assign_speakers_to_transcript(
            raw_segments, transcript_segments,
        )
    else:
        # Build SpeakerSegments directly from raw diarization output
        speaker_segs = []
        for ds in raw_segments:
            speaker_segs.append(SpeakerSegment(
                speaker_id=f"Speaker {ds['speaker'] + 1}",
                start=ds["start"],
                end=ds["end"],
                text="",
                confidence=1.0,
            ))

    # Handle edge case: no segments at all
    if not speaker_segs:
        logger.warning("Diarization produced no segments")
        return DiarizationResult(
            segments=[],
            speakers={},
            num_speakers=0,
            timeline=[],
        )

    # --- build profiles and timeline ---
    profiles = build_speaker_profiles(speaker_segs, audio_path=audio_path)
    timeline = generate_speaker_timeline(speaker_segs)

    unique_speakers = set(s.speaker_id for s in speaker_segs)

    result = DiarizationResult(
        segments=speaker_segs,
        speakers=profiles,
        num_speakers=len(unique_speakers),
        timeline=timeline,
    )

    logger.info(
        "Diarization complete: %d speakers, %d segments",
        result.num_speakers,
        len(result.segments),
    )

    return result
