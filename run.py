#!/usr/bin/env python3
"""
Simple launcher — drag-and-drop style interface for beginners.
Run this file and follow the prompts!

Usage:
    python run.py
"""

import os
import sys
from pathlib import Path


def main():
    print()
    print("=" * 50)
    print("  TicketOps")
    print("  Turn long videos into viral clips!")
    print("=" * 50)
    print()

    # Step 1: Get video path
    if len(sys.argv) > 1:
        video_path = sys.argv[1]
    else:
        print("Enter the path to your video file")
        print("  (drag and drop the file here, or type the path)")
        print()
        video_path = input("Video path: ").strip().strip("'\"")

    if not video_path:
        print("No video path provided. Exiting.")
        sys.exit(1)

    if not os.path.isfile(video_path):
        print(f"File not found: {video_path}")
        sys.exit(1)

    print(f"\nVideo: {video_path}")

    # Step 2: How many clips?
    print("\nHow many clips do you want? (default: 5)")
    clips_input = input("Number of clips [5]: ").strip()
    max_clips = int(clips_input) if clips_input.isdigit() else 5

    # Step 3: Speed vs quality
    print("\nProcessing speed:")
    print("  1 = Fast    (lower quality, good for previews)")
    print("  2 = Normal  (balanced)")
    print("  3 = High    (best quality, slower)")
    speed_input = input("Choose [2]: ").strip()

    speed_map = {"1": "ultrafast", "2": "medium", "3": "slow"}
    whisper_map = {"1": "tiny", "2": "base", "3": "small"}
    preset = speed_map.get(speed_input, "medium")
    whisper = whisper_map.get(speed_input, "base")

    # Step 4: Clip length preference
    print("\nClip length:")
    print("  1 = Short  (30-60 seconds)")
    print("  2 = Medium (60-90 seconds)")
    print("  3 = Long   (60-120 seconds)")
    length_input = input("Choose [2]: ").strip()

    length_map = {
        "1": (30, 60),
        "2": (60, 90),
        "3": (60, 120),
    }
    min_dur, max_dur = length_map.get(length_input, (60, 90))

    # Build command
    cmd = (
        f"python3 pipeline.py \"{video_path}\" "
        f"--max-clips {max_clips} "
        f"--min-duration {min_dur} "
        f"--max-duration {max_dur} "
        f"--whisper-model {whisper} "
        f"--preset {preset}"
    )

    print()
    print("=" * 50)
    print("Starting! This may take a few minutes...")
    print(f"Settings: {max_clips} clips, {min_dur}-{max_dur}s each, {preset} quality")
    print("=" * 50)
    print()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    exit_code = os.system(cmd)

    if exit_code == 0:
        # Find output
        video_name = Path(video_path).stem
        output_dir = Path("output") / video_name

        print()
        print("=" * 50)
        print("  DONE!")
        print("=" * 50)
        print()
        print(f"Your clips are in: {output_dir.absolute()}/")
        print()

        if output_dir.exists():
            clips = sorted(output_dir.glob("clip_*.mp4"))
            for clip in clips:
                size_mb = clip.stat().st_size / (1024 * 1024)
                print(f"  {clip.name}  ({size_mb:.1f} MB)")

        print()
        print("Next steps:")
        print("  1. Open the output folder and preview your clips")
        print("  2. Go to https://www.tiktok.com/creator#/upload")
        print("  3. Upload your clips!")
        print()
    else:
        print("\nSomething went wrong. Try running with -v for details:")
        print(f"  {cmd} -v")


if __name__ == "__main__":
    main()
