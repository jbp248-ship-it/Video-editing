"""
Ingestion module — validates and preprocesses input videos.

Handles:
- Format validation
- Duration checking
- Audio extraction for analysis
- Metadata extraction
"""

import os
import json
import subprocess
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

from config import PipelineConfig

logger = logging.getLogger(__name__)


@dataclass
class VideoMetadata:
    """Extracted metadata from an input video."""
    path: str
    duration: float          # seconds
    width: int
    height: int
    fps: float
    has_audio: bool
    audio_sample_rate: int
    codec: str
    filesize_mb: float


def probe_video(video_path: str) -> dict:
    """Run ffprobe and return parsed JSON metadata."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def extract_metadata(video_path: str) -> VideoMetadata:
    """Extract key metadata from a video file."""
    probe = probe_video(video_path)

    # Find video stream
    video_stream = None
    audio_stream = None
    for stream in probe.get("streams", []):
        if stream["codec_type"] == "video" and video_stream is None:
            video_stream = stream
        elif stream["codec_type"] == "audio" and audio_stream is None:
            audio_stream = stream

    if video_stream is None:
        raise ValueError(f"No video stream found in {video_path}")

    fmt = probe.get("format", {})
    duration = float(fmt.get("duration", video_stream.get("duration", 0)))

    # Parse FPS from r_frame_rate (e.g., "30000/1001")
    fps_str = video_stream.get("r_frame_rate", "30/1")
    if "/" in fps_str:
        num, den = fps_str.split("/")
        fps = float(num) / float(den) if float(den) != 0 else 30.0
    else:
        fps = float(fps_str)

    return VideoMetadata(
        path=video_path,
        duration=duration,
        width=int(video_stream.get("width", 0)),
        height=int(video_stream.get("height", 0)),
        fps=fps,
        has_audio=audio_stream is not None,
        audio_sample_rate=int(audio_stream.get("sample_rate", 0)) if audio_stream else 0,
        codec=video_stream.get("codec_name", "unknown"),
        filesize_mb=os.path.getsize(video_path) / (1024 * 1024),
    )


def extract_audio(video_path: str, output_path: str, sample_rate: int = 16000) -> str:
    """
    Extract audio track from video as WAV for Whisper and analysis.
    Returns path to the extracted audio file.
    """
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",                          # No video
        "-acodec", "pcm_s16le",         # 16-bit PCM
        "-ar", str(sample_rate),        # Whisper expects 16kHz
        "-ac", "1",                     # Mono
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    logger.info(f"Extracted audio to {output_path}")
    return output_path


def validate_video(video_path: str, config: PipelineConfig) -> VideoMetadata:
    """
    Validate that the input video meets requirements.
    Returns metadata if valid, raises ValueError otherwise.
    """
    path = Path(video_path)

    if not path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    if path.suffix.lower() not in config.supported_formats:
        raise ValueError(
            f"Unsupported format '{path.suffix}'. "
            f"Supported: {config.supported_formats}"
        )

    meta = extract_metadata(video_path)

    if meta.duration < 120:
        logger.warning(
            f"Video is only {meta.duration:.0f}s — may produce very few clips"
        )

    if not meta.has_audio:
        raise ValueError("Video has no audio track — needed for transcription and analysis")

    logger.info(
        f"Validated: {path.name} | {meta.duration:.0f}s | "
        f"{meta.width}x{meta.height} | {meta.filesize_mb:.1f}MB"
    )
    return meta


def ingest(video_path: str, config: PipelineConfig) -> tuple[VideoMetadata, str]:
    """
    Full ingestion: validate video and extract audio.
    Returns (metadata, audio_path).
    """
    meta = validate_video(video_path, config)

    # Create temp dir for intermediary files
    work_dir = Path(config.output.output_dir) / "_work"
    work_dir.mkdir(parents=True, exist_ok=True)

    audio_path = str(work_dir / "source_audio.wav")
    extract_audio(video_path, audio_path)

    return meta, audio_path
