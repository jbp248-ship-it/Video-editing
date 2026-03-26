"""
FFmpeg path resolver — finds ffmpeg/ffprobe automatically.

Checks in order:
1. System PATH (if user installed ffmpeg globally)
2. imageio_ffmpeg bundled binary (installed via pip)
3. Common Windows install locations

This ensures the app works even without a global ffmpeg install.
"""

import shutil
import subprocess
import sys
import os
import logging

logger = logging.getLogger(__name__)

_ffmpeg_path = None
_ffprobe_path = None


def get_ffmpeg() -> str:
    """Get the path to a working ffmpeg binary."""
    global _ffmpeg_path
    if _ffmpeg_path:
        return _ffmpeg_path

    # 1. Check system PATH
    path = shutil.which("ffmpeg")
    if path:
        _ffmpeg_path = path
        logger.info(f"Using system ffmpeg: {path}")
        return path

    # 2. Check imageio_ffmpeg (bundled with pip install)
    try:
        import imageio_ffmpeg
        path = imageio_ffmpeg.get_ffmpeg_exe()
        if path and os.path.isfile(path):
            _ffmpeg_path = path
            logger.info(f"Using imageio_ffmpeg bundled binary: {path}")
            return path
    except ImportError:
        pass

    # 3. Check common Windows locations
    if sys.platform == "win32":
        common_paths = [
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\ffmpeg\bin\ffmpeg.exe"),
            os.path.expandvars(r"%ProgramFiles%\ffmpeg\bin\ffmpeg.exe"),
            r"C:\ffmpeg\bin\ffmpeg.exe",
        ]
        for p in common_paths:
            if os.path.isfile(p):
                _ffmpeg_path = p
                logger.info(f"Using ffmpeg at: {p}")
                return p

    raise FileNotFoundError(
        "ffmpeg not found! Install it by running:\n"
        "  pip install imageio-ffmpeg\n"
        "Or download from https://ffmpeg.org/download.html"
    )


def get_ffprobe() -> str:
    """Get the path to a working ffprobe binary."""
    global _ffprobe_path
    if _ffprobe_path:
        return _ffprobe_path

    # 1. Check system PATH
    path = shutil.which("ffprobe")
    if path:
        _ffprobe_path = path
        return path

    # 2. Derive from ffmpeg path (ffprobe is usually next to ffmpeg)
    try:
        ffmpeg = get_ffmpeg()
        ffmpeg_dir = os.path.dirname(ffmpeg)

        if sys.platform == "win32":
            probe = os.path.join(ffmpeg_dir, "ffprobe.exe")
        else:
            probe = os.path.join(ffmpeg_dir, "ffprobe")

        if os.path.isfile(probe):
            _ffprobe_path = probe
            return probe
    except FileNotFoundError:
        pass

    # 3. imageio_ffmpeg doesn't bundle ffprobe, so use ffmpeg -i as fallback
    # Return None and callers should use ffmpeg-based probing
    return None


def probe_duration(video_path: str) -> float:
    """Get video duration using whatever tools are available."""
    ffprobe = get_ffprobe()

    if ffprobe:
        cmd = [
            ffprobe, "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0", video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())

    # Fallback: use ffmpeg -i (works without ffprobe)
    ffmpeg = get_ffmpeg()
    cmd = [ffmpeg, "-i", video_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # Parse duration from stderr (ffmpeg prints info to stderr)
    import re
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)", result.stderr)
    if match:
        h, m, s, cs = match.groups()
        return int(h) * 3600 + int(m) * 60 + int(s) + int(cs) / 100
    raise RuntimeError(f"Could not determine duration of {video_path}")


def probe_video_full(video_path: str) -> dict:
    """Get full video metadata. Uses ffprobe if available, else parses ffmpeg output."""
    ffprobe = get_ffprobe()

    if ffprobe:
        import json as json_mod
        cmd = [
            ffprobe, "-v", "quiet",
            "-print_format", "json",
            "-show_format", "-show_streams",
            video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return json_mod.loads(result.stdout)

    # Fallback: parse ffmpeg -i output
    ffmpeg = get_ffmpeg()
    cmd = [ffmpeg, "-i", video_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    stderr = result.stderr

    import re

    # Parse duration
    dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)", stderr)
    duration = 0.0
    if dur_match:
        h, m, s, cs = dur_match.groups()
        duration = int(h) * 3600 + int(m) * 60 + int(s) + int(cs) / 100

    # Parse video stream
    vid_match = re.search(r"Stream.*Video:\s*(\w+).*?(\d{2,5})x(\d{2,5}).*?(\d+(?:\.\d+)?)\s*fps", stderr)
    width, height, fps, codec = 1920, 1080, 30.0, "h264"
    if vid_match:
        codec = vid_match.group(1)
        width = int(vid_match.group(2))
        height = int(vid_match.group(3))
        fps = float(vid_match.group(4))

    # Check for audio
    has_audio = "Audio:" in stderr
    audio_rate = 0
    audio_match = re.search(r"Audio:.*?(\d+)\s*Hz", stderr)
    if audio_match:
        audio_rate = int(audio_match.group(1))

    # Build a structure compatible with ffprobe JSON output
    return {
        "format": {"duration": str(duration)},
        "streams": [
            {
                "codec_type": "video",
                "codec_name": codec,
                "width": width,
                "height": height,
                "r_frame_rate": f"{fps}/1",
            },
        ] + ([{
            "codec_type": "audio",
            "sample_rate": str(audio_rate),
        }] if has_audio else []),
    }
