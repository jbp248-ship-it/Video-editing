"""
Pipeline orchestrator — ties all modules together.

Usage:
    python pipeline.py input/my_video.mp4
    python pipeline.py input/my_video.mp4 --max-clips 5 --whisper-model small
    python pipeline.py input/ --batch           # Process all videos in directory
"""

import argparse
import logging
import sys
import time
import json
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

from config import PipelineConfig
from ingestion import ingest
from segmentation import segment_video
from scoring import score_segments
from rendering import render_all_clips

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pipeline")


def process_video(video_path: str, config: PipelineConfig) -> list[str]:
    """
    Run the full pipeline on a single video.
    Returns list of output clip paths.
    """
    t_start = time.time()
    video_name = Path(video_path).stem

    # Set up output directory per video
    config.output.output_dir = str(Path(config.output.output_dir) / video_name)

    logger.info(f"{'='*60}")
    logger.info(f"Processing: {video_path}")
    logger.info(f"{'='*60}")

    # === STAGE 1: Ingestion ===
    logger.info("Stage 1/5: Ingestion & validation")
    meta, audio_path = ingest(video_path, config)

    # === STAGE 2: Segmentation ===
    logger.info("Stage 2/5: Content-aware segmentation")
    segments, transcript = segment_video(
        video_path, audio_path, meta.duration, config
    )
    logger.info(f"Found {len(segments)} candidate segments")

    if not segments:
        logger.warning("No valid segments found — video may be too short or silent")
        return []

    # === STAGE 3: Scoring ===
    logger.info("Stage 3/5: Virality scoring & ranking")
    scored = score_segments(segments, transcript, config)
    logger.info(f"Selected top {len(scored)} clips")

    # === STAGE 4: Rendering ===
    logger.info("Stage 4/5: Rendering clips with captions & headers")
    outputs = render_all_clips(
        video_path, scored, transcript,
        meta.width, meta.height, config,
    )

    # === STAGE 5: Note Generation ===
    note_files = []
    if config.note.generate_notes:
        logger.info("Stage 5/5: Generating AI meeting notes")
        try:
            from note_taker import generate_notes
            from speaker_id import diarize_audio
            from nlp_engine import analyze_transcript
            from note_export import export_all

            # Speaker diarization
            speaker_data = None
            if config.note.enable_speaker_id:
                speaker_data = diarize_audio(audio_path, config.note.num_speakers or None)

            # NLP analysis
            nlp_data = None
            if config.note.enable_nlp_analysis:
                nlp_data = analyze_transcript(transcript)

            # Generate notes
            notes = generate_notes(transcript, scored, config, speaker_data, nlp_data)

            # Export
            note_files = export_all(notes, config.output.output_dir, config.note.note_template)
            logger.info(f"Notes exported: {note_files}")
        except ImportError as e:
            logger.warning(f"Note generation modules not available: {e}")
        except Exception as e:
            logger.error(f"Note generation failed: {e}")
    else:
        logger.info("Stage 5/5: Note generation skipped (disabled)")

    # Save metadata
    _save_manifest(scored, config, note_files=note_files)

    elapsed = time.time() - t_start
    logger.info(f"Done! {len(outputs)} clips in {elapsed:.1f}s")
    logger.info(f"Output: {config.output.output_dir}/")

    return outputs


def _save_manifest(scored_segments: list, config: PipelineConfig, note_files: list = None):
    """Save a JSON manifest with clip metadata and scores."""
    manifest = {
        "clips": [],
        "config": {
            "whisper_model": config.whisper_model,
            "max_clips": config.clip.max_clips,
            "clip_duration_range": [config.clip.min_duration, config.clip.max_duration],
        },
        "notes": {
            "enabled": config.note.generate_notes,
            "template": config.note.note_template,
            "files": [str(f) for f in (note_files or [])],
            "speaker_id_enabled": config.note.enable_speaker_id,
            "nlp_analysis_enabled": config.note.enable_nlp_analysis,
        },
    }

    for i, s in enumerate(scored_segments):
        manifest["clips"].append({
            "rank": i + 1,
            "label": s.label,
            "filename": f"clip_{i+1:02d}_{s.label}.{config.output.format}",
            "start": round(s.segment.start, 2),
            "end": round(s.segment.end, 2),
            "duration": round(s.segment.duration, 2),
            "scores": {
                "total": round(s.total_score, 4),
                "hook": round(s.hook_score, 4),
                "emotion": round(s.emotion_score, 4),
                "pace": round(s.pace_score, 4),
                "completeness": round(s.completeness_score, 4),
                "surprise": round(s.surprise_score, 4),
                "brevity": round(s.brevity_score, 4),
            },
            "transcript_preview": s.segment.transcript[:200],
        })

    manifest_path = Path(config.output.output_dir) / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    logger.info(f"Saved manifest: {manifest_path}")


def process_batch(input_dir: str, config: PipelineConfig) -> dict[str, list[str]]:
    """Process all videos in a directory."""
    input_path = Path(input_dir)
    video_files = []

    for ext in config.supported_formats:
        video_files.extend(input_path.glob(f"*{ext}"))

    if not video_files:
        logger.error(f"No video files found in {input_dir}")
        return {}

    logger.info(f"Batch processing {len(video_files)} videos")

    results = {}
    # Process sequentially (each video already uses significant resources)
    for vf in sorted(video_files):
        try:
            # Use a fresh config copy per video so output dirs don't collide
            vid_config = PipelineConfig(
                clip=config.clip,
                caption=config.caption,
                header=config.header,
                output=config.output,
                scoring=config.scoring,
                note=config.note,
                whisper_model=config.whisper_model,
                use_scene_detection=config.use_scene_detection,
                scene_threshold=config.scene_threshold,
            )
            vid_config.output.output_dir = config.output.output_dir
            outputs = process_video(str(vf), vid_config)
            results[str(vf)] = outputs
        except Exception as e:
            logger.error(f"Failed to process {vf}: {e}")
            results[str(vf)] = []

    total_clips = sum(len(v) for v in results.values())
    logger.info(f"Batch complete: {total_clips} clips from {len(video_files)} videos")
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="TikTok Video Clipper — turn long videos into viral clips",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pipeline.py video.mp4
  python pipeline.py video.mp4 --max-clips 5 --whisper-model small
  python pipeline.py input/ --batch --output-dir my_output
  python pipeline.py video.mp4 --no-scene-detect --caption-size 56
        """,
    )

    parser.add_argument("input", help="Video file or directory (with --batch)")
    parser.add_argument("--batch", action="store_true",
                        help="Process all videos in the input directory")

    # Clip settings
    parser.add_argument("--max-clips", type=int, default=10,
                        help="Maximum number of clips to generate (default: 10)")
    parser.add_argument("--min-duration", type=float, default=60,
                        help="Minimum clip duration in seconds (default: 60)")
    parser.add_argument("--max-duration", type=float, default=120,
                        help="Maximum clip duration in seconds (default: 120)")

    # Model settings
    parser.add_argument("--whisper-model", default="base",
                        choices=["tiny", "base", "small", "medium", "large"],
                        help="Whisper model size (default: base)")
    parser.add_argument("--no-scene-detect", action="store_true",
                        help="Disable scene detection (faster)")

    # Caption settings
    parser.add_argument("--caption-size", type=int, default=48,
                        help="Caption font size (default: 48)")
    parser.add_argument("--caption-color", default="white",
                        help="Caption font color (default: white)")
    parser.add_argument("--no-highlight", action="store_true",
                        help="Disable keyword highlighting in captions")

    # Output settings
    parser.add_argument("--output-dir", default="output",
                        help="Output directory (default: output)")
    parser.add_argument("--preset", default="medium",
                        choices=["ultrafast", "fast", "medium", "slow"],
                        help="ffmpeg encoding preset (default: medium)")
    parser.add_argument("--fps", type=int, default=30,
                        help="Output FPS (default: 30)")

    # Note generation settings
    notes_group = parser.add_mutually_exclusive_group()
    notes_group.add_argument("--notes", action="store_true", default=True,
                             help="Enable AI note generation (default: on)")
    notes_group.add_argument("--no-notes", action="store_true",
                             help="Disable AI note generation")
    parser.add_argument("--note-template", default="detailed",
                        choices=["detailed", "concise", "action-focused"],
                        help="Note template style (default: detailed)")
    parser.add_argument("--speakers", type=int, default=0,
                        help="Number of speakers (0 = auto-detect, default: 0)")
    parser.add_argument("--export-formats", default="markdown,json",
                        help="Comma-separated note export formats: markdown, json, obsidian, notion, csv (default: markdown,json)")

    # Verbosity
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Enable debug logging")

    return parser.parse_args()


def main():
    args = parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Build config from CLI args
    config = PipelineConfig()
    config.clip.max_clips = args.max_clips
    config.clip.min_duration = args.min_duration
    config.clip.max_duration = args.max_duration
    config.whisper_model = args.whisper_model
    config.use_scene_detection = not args.no_scene_detect
    config.caption.font_size = args.caption_size
    config.caption.font_color = args.caption_color
    config.caption.highlight_keywords = not args.no_highlight
    config.output.output_dir = args.output_dir
    config.output.preset = args.preset
    config.output.fps = args.fps

    # Note generation settings
    config.note.generate_notes = not args.no_notes
    config.note.note_template = args.note_template
    config.note.num_speakers = args.speakers
    config.note.export_formats = tuple(f.strip() for f in args.export_formats.split(","))

    input_path = Path(args.input)

    if args.batch:
        if not input_path.is_dir():
            logger.error(f"--batch requires a directory, got: {args.input}")
            sys.exit(1)
        process_batch(args.input, config)
    else:
        if not input_path.is_file():
            logger.error(f"File not found: {args.input}")
            sys.exit(1)
        process_video(args.input, config)


if __name__ == "__main__":
    main()
