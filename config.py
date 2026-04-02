"""
Configuration for the TikTok Video Clipper pipeline.
All tunable parameters live here so you can adjust behavior without touching code.
"""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ClipConfig:
    """Controls how clips are segmented from the source video."""
    min_duration: float = 60.0        # Minimum clip length in seconds
    max_duration: float = 120.0       # Maximum clip length in seconds
    target_duration: float = 90.0     # Ideal clip length
    hook_window: float = 3.0          # First N seconds must grab attention
    max_clips: int = 10               # Maximum number of clips to output
    silence_threshold_db: float = -40.0  # Below this dB is considered silence
    silence_min_duration: float = 0.5    # Minimum silence gap to detect (seconds)
    min_speech_ratio: float = 0.3     # Clips must have at least 30% speech


@dataclass
class CaptionConfig:
    """Controls caption appearance and generation."""
    font_size: int = 48
    font_color: str = "white"
    outline_color: str = "black"
    outline_width: int = 3
    position: str = "center"          # "center", "bottom", "top"
    y_offset: int = 800               # Vertical pixel offset from top (for 1920h)
    max_chars_per_line: int = 35
    highlight_keywords: bool = True
    highlight_color: str = "#00f7ff"  # Cyan highlight for key words
    font_path: Optional[str] = None   # Path to .ttf font, None = default


@dataclass
class HeaderConfig:
    """Controls the header overlay at the top of each clip."""
    font_size: int = 56
    font_color: str = "white"
    bg_color: str = "#000000CC"       # Semi-transparent black
    max_words: int = 8
    y_position: int = 80              # Pixels from top
    padding: int = 20
    font_path: Optional[str] = None


@dataclass
class OutputConfig:
    """Controls export settings."""
    width: int = 1080
    height: int = 1920
    fps: int = 30
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    audio_bitrate: str = "192k"
    video_bitrate: str = "8M"
    preset: str = "medium"            # ffmpeg preset: ultrafast -> veryslow
    output_dir: str = "output"
    format: str = "mp4"


@dataclass
class ScoringConfig:
    """Weights for the virality scoring algorithm."""
    weight_hook_strength: float = 0.25     # How strong the opening 3s are
    weight_emotional_intensity: float = 0.20
    weight_speech_pace_variation: float = 0.10
    weight_completeness: float = 0.20      # Does the clip tell a complete idea?
    weight_surprise_factor: float = 0.15   # Sudden changes / unexpected moments
    weight_brevity_bonus: float = 0.10     # Shorter, punchier clips score higher


@dataclass
class NoteConfig:
    """Controls AI note generation."""
    generate_notes: bool = True
    note_template: str = "detailed"      # "detailed", "concise", "action-focused"
    extract_action_items: bool = True
    extract_decisions: bool = True
    enable_speaker_id: bool = True
    enable_nlp_analysis: bool = True
    enable_semantic_search: bool = False  # Requires sentence-transformers
    max_topics: int = 20
    max_key_takeaways: int = 7
    include_timestamps: bool = True
    include_full_transcript: bool = True
    export_formats: tuple = ("markdown", "json")  # Options: markdown, json, obsidian, notion, csv
    summary_model: str = "facebook/bart-large-cnn"
    num_speakers: int = 0                 # 0 = auto-detect


@dataclass
class PipelineConfig:
    """Top-level config aggregating all sub-configs."""
    clip: ClipConfig = field(default_factory=ClipConfig)
    caption: CaptionConfig = field(default_factory=CaptionConfig)
    header: HeaderConfig = field(default_factory=HeaderConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    scoring: ScoringConfig = field(default_factory=ScoringConfig)
    note: NoteConfig = field(default_factory=NoteConfig)

    # Whisper model size: "tiny", "base", "small", "medium", "large"
    whisper_model: str = "base"

    # Summarization model for header generation
    summarization_model: str = "facebook/bart-large-cnn"

    # Enable scene detection for smarter cuts
    use_scene_detection: bool = True
    scene_threshold: float = 27.0  # PySceneDetect threshold

    # Enable face detection for auto-reframing
    use_face_reframing: bool = False

    # Number of parallel workers for batch processing
    num_workers: int = 2

    # Supported input formats
    supported_formats: tuple = (".mp4", ".mov", ".mkv", ".avi", ".webm")

    input_dir: str = "input"
