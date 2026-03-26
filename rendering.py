"""
Rendering module — exports final clips with captions, headers, and vertical formatting.

Handles:
- Extracting clip segments from source video
- Vertical (9:16) reframing with center-crop or letterbox
- Caption overlay (burned in)
- Header text overlay
- Final encoding to TikTok-ready specs
"""

import logging
import os
import subprocess
from pathlib import Path

from config import PipelineConfig
from ffmpeg_utils import get_ffmpeg

logger = logging.getLogger(__name__)


def generate_header_text(transcript: str, config: PipelineConfig) -> str:
    """
    Generate a short, attention-grabbing header from the clip transcript.

    Uses a simple extractive approach (first meaningful phrase) with fallback
    to transformer-based summarization if available.
    """
    max_words = config.header.max_words

    # Try transformer summarization first
    try:
        return _summarize_with_model(transcript, max_words, config)
    except Exception as e:
        logger.debug(f"Model summarization unavailable ({e}), using extractive fallback")

    # Extractive fallback: pick the most hook-like sentence
    return _extractive_header(transcript, max_words)


def _summarize_with_model(transcript: str, max_words: int, config: PipelineConfig) -> str:
    """Use a HuggingFace summarization model to generate a header."""
    from transformers import pipeline as hf_pipeline

    summarizer = hf_pipeline(
        "summarization",
        model=config.summarization_model,
        max_length=max_words * 2,  # tokens ≈ words roughly
        min_length=3,
        do_sample=False,
    )

    # Truncate input to model's max length
    input_text = transcript[:1024]
    result = summarizer(input_text)
    summary = result[0]["summary_text"]

    # Trim to max words
    words = summary.split()[:max_words]
    header = " ".join(words).rstrip(".,;:!?")

    # Make it punchy — add caps
    return header.upper()


def _extractive_header(transcript: str, max_words: int) -> str:
    """
    Fallback: extract a header from the transcript.
    Pick the first short sentence or the first N words.
    """
    if not transcript:
        return "WATCH THIS"

    # Split into sentences
    import re
    sentences = re.split(r'[.!?]+', transcript)
    sentences = [s.strip() for s in sentences if s.strip()]

    if not sentences:
        return "WATCH THIS"

    # Find shortest sentence that's at least 3 words
    candidates = [s for s in sentences if 3 <= len(s.split()) <= max_words]

    if candidates:
        # Pick the first one (usually the hook)
        header = candidates[0]
    else:
        # Just take first N words
        header = " ".join(transcript.split()[:max_words])

    return header.upper().rstrip(".,;:!?")


def build_reframe_filter(
    src_width: int,
    src_height: int,
    out_width: int = 1080,
    out_height: int = 1920,
) -> str:
    """
    Build ffmpeg filter to convert any aspect ratio to 9:16 vertical.

    Strategy: scale to fill width, then center-crop height.
    If source is already vertical, just scale.
    """
    src_aspect = src_width / src_height
    out_aspect = out_width / out_height  # 0.5625

    if src_aspect > out_aspect:
        # Source is wider (e.g., 16:9 landscape) — scale by height, crop width
        # Scale so height matches, then crop center
        scale_h = out_height
        scale_w = int(src_aspect * scale_h)
        # Ensure even dimensions
        scale_w = scale_w + (scale_w % 2)
        return f"scale={scale_w}:{scale_h},crop={out_width}:{out_height}"
    else:
        # Source is tall or square — scale by width, pad or crop height
        scale_w = out_width
        scale_h = int(scale_w / src_aspect)
        scale_h = scale_h + (scale_h % 2)
        if scale_h >= out_height:
            return f"scale={scale_w}:{scale_h},crop={out_width}:{out_height}"
        else:
            # Need padding (letterbox)
            pad_y = (out_height - scale_h) // 2
            return f"scale={scale_w}:{scale_h},pad={out_width}:{out_height}:0:{pad_y}:black"


def _get_default_font() -> str:
    """Find a usable font on any OS."""
    import sys
    candidates = []
    if sys.platform == "win32":
        windir = os.environ.get("WINDIR", r"C:\Windows")
        candidates = [
            os.path.join(windir, "Fonts", "arialbd.ttf"),
            os.path.join(windir, "Fonts", "arial.ttf"),
            os.path.join(windir, "Fonts", "segoeui.ttf"),
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    for f in candidates:
        if os.path.isfile(f):
            # ffmpeg on Windows needs forward slashes and escaped colons
            return f.replace("\\", "/").replace("C:/", "C\\\\:/")
    return "Arial"  # ffmpeg can sometimes find system fonts by name


def build_header_filter(header_text: str, config: PipelineConfig) -> str:
    """Build ffmpeg drawtext filter for the header overlay with background box."""
    hdr = config.header
    font = hdr.font_path or _get_default_font()

    # Escape for ffmpeg
    escaped = header_text.replace("\\", "\\\\").replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")

    return (
        f"drawbox="
        f"x=0:y={hdr.y_position - hdr.padding}:"
        f"w=iw:h={hdr.font_size + hdr.padding * 2}:"
        f"color={hdr.bg_color}:t=fill,"
        f"drawtext="
        f"text='{escaped}':"
        f"fontfile='{font}':"
        f"fontsize={hdr.font_size}:"
        f"fontcolor={hdr.font_color}:"
        f"x=(w-text_w)/2:"
        f"y={hdr.y_position}:"
        f"enable='between(t,0,999)'"
    )


def render_clip(
    source_video: str,
    clip_start: float,
    clip_end: float,
    caption_filter: str,
    header_text: str,
    output_path: str,
    src_width: int,
    src_height: int,
    config: PipelineConfig,
) -> str:
    """
    Render a single clip with all overlays.

    Pipeline:
    1. Extract segment from source
    2. Reframe to 9:16 vertical
    3. Add header overlay
    4. Add caption overlay
    5. Encode to final output
    """
    out = config.output
    duration = clip_end - clip_start

    # Build filter chain
    reframe = build_reframe_filter(src_width, src_height, out.width, out.height)
    header = build_header_filter(header_text, config)

    # Combine all video filters
    filter_parts = [reframe, header]
    if caption_filter:
        filter_parts.append(caption_filter)

    video_filter = ",".join(filter_parts)

    # Build ffmpeg command
    cmd = [
        get_ffmpeg(), "-y",
        "-ss", f"{clip_start:.3f}",
        "-i", source_video,
        "-t", f"{duration:.3f}",
        "-vf", video_filter,
        "-c:v", out.video_codec,
        "-b:v", out.video_bitrate,
        "-preset", out.preset,
        "-c:a", out.audio_codec,
        "-b:a", out.audio_bitrate,
        "-r", str(out.fps),
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        output_path,
    ]

    logger.info(f"Rendering: {output_path} ({duration:.0f}s)")
    logger.debug(f"Filter: {video_filter[:200]}...")

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"ffmpeg error: {result.stderr[-500:]}")
        raise RuntimeError(f"Render failed for {output_path}: {result.stderr[-200:]}")

    # Verify output exists and has size
    out_path = Path(output_path)
    if not out_path.exists() or out_path.stat().st_size < 1000:
        raise RuntimeError(f"Render produced empty/missing file: {output_path}")

    size_mb = out_path.stat().st_size / (1024 * 1024)
    logger.info(f"Rendered: {output_path} ({size_mb:.1f}MB)")
    return output_path


def render_all_clips(
    source_video: str,
    scored_segments: list,
    transcript_segments: list,
    src_width: int,
    src_height: int,
    config: PipelineConfig,
) -> list[str]:
    """
    Render all scored clips with captions and headers.
    Returns list of output file paths.
    """
    from captions import generate_captions

    output_dir = Path(config.output.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    work_dir = output_dir / "_work"
    work_dir.mkdir(exist_ok=True)

    output_paths = []

    for i, scored in enumerate(scored_segments):
        seg = scored.segment
        rank = i + 1

        # Output filename: clip_01_hook.mp4
        filename = f"clip_{rank:02d}_{scored.label}.{config.output.format}"
        output_path = str(output_dir / filename)

        # Generate captions
        srt_path = str(work_dir / f"clip_{rank:02d}.srt")
        _, caption_filter, _ = generate_captions(
            seg.start, seg.end,
            transcript_segments, config, srt_path,
        )

        # Generate header
        header_text = generate_header_text(seg.transcript, config)
        logger.info(f"Clip #{rank} header: \"{header_text}\"")

        # Render
        try:
            path = render_clip(
                source_video, seg.start, seg.end,
                caption_filter, header_text, output_path,
                src_width, src_height, config,
            )
            output_paths.append(path)
        except RuntimeError as e:
            logger.error(f"Failed to render clip #{rank}: {e}")
            continue

    return output_paths
