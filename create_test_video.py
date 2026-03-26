#!/usr/bin/env python3
"""
Creates a test video (~4 minutes) with synthetic speech-like audio to demo the pipeline.
Uses only ffmpeg — no internet required.

The audio uses sine wave tones at speech-like frequencies to simulate talking,
with varied amplitudes and pauses to give the segmentation algo real signals to work with.
"""

import subprocess
import os
from pathlib import Path


# Each segment has text (for visual), duration, and audio characteristics
SEGMENTS = [
    {
        "text": "You won't believe what happened",
        "duration": 20,
        "color": "0x1a1a2e",
        "freq": 180,       # Hz — simulated voice pitch
        "volume": 0.7,
    },
    {
        "text": "Nobody tells you about starting a business",
        "duration": 22,
        "color": "0x16213e",
        "freq": 200,
        "volume": 0.8,
    },
    {
        "text": "90 percent of people do this wrong",
        "duration": 20,
        "color": "0x0f3460",
        "freq": 170,
        "volume": 0.6,
    },
    {
        # Silence gap — natural break point for segmentation
        "text": "",
        "duration": 3,
        "color": "0x000000",
        "freq": 0,
        "volume": 0.0,
    },
    {
        "text": "The most important lesson I learned",
        "duration": 18,
        "color": "0x533483",
        "freq": 220,
        "volume": 0.9,  # Loud = emotional
    },
    {
        "text": "The biggest mistake I made in my twenties",
        "duration": 20,
        "color": "0xe94560",
        "freq": 190,
        "volume": 0.75,
    },
    {
        "text": "",
        "duration": 2,
        "color": "0x000000",
        "freq": 0,
        "volume": 0.0,
    },
    {
        "text": "How I did it - the truth",
        "duration": 20,
        "color": "0x1a1a2e",
        "freq": 210,
        "volume": 0.85,
    },
    {
        "text": "Imagine waking up excited about life",
        "duration": 18,
        "color": "0x16213e",
        "freq": 175,
        "volume": 0.65,
    },
    {
        "text": "The craziest part - nobody saw it coming",
        "duration": 18,
        "color": "0x0f3460",
        "freq": 230,
        "volume": 0.95,  # Peak energy = surprise
    },
    {
        "text": "",
        "duration": 3,
        "color": "0x000000",
        "freq": 0,
        "volume": 0.0,
    },
    {
        "text": "Let me break this down simply",
        "duration": 20,
        "color": "0x533483",
        "freq": 185,
        "volume": 0.7,
    },
    {
        "text": "What I wish someone told me 10 years ago",
        "duration": 22,
        "color": "0xe94560",
        "freq": 195,
        "volume": 0.8,
    },
    {
        "text": "This will blow your mind - productivity",
        "duration": 22,
        "color": "0x1a1a2e",
        "freq": 215,
        "volume": 0.9,
    },
    {
        "text": "And thats the whole story - go make it happen",
        "duration": 18,
        "color": "0x16213e",
        "freq": 180,
        "volume": 0.7,
    },
]


def create_test_video():
    work_dir = Path("input/_test_work")
    work_dir.mkdir(parents=True, exist_ok=True)
    output = Path("input/test_video.mp4")

    print("Creating test video segments...")

    video_files = []

    for i, seg in enumerate(SEGMENTS):
        dur = seg["duration"]
        video_path = work_dir / f"seg_{i:02d}.mp4"

        if seg["volume"] > 0:
            # Create speech-like audio: mix of base freq + harmonics + noise
            # This simulates speech patterns that Whisper and energy analysis can detect
            freq = seg["freq"]
            vol = seg["volume"]
            audio_filter = (
                f"sine=f={freq}:d={dur},"
                f"volume={vol * 0.3}[a1];"
                f"sine=f={freq * 2}:d={dur},"
                f"volume={vol * 0.15}[a2];"
                f"sine=f={freq * 3}:d={dur},"
                f"volume={vol * 0.05}[a3];"
                f"anoisesrc=d={dur}:c=pink:a={vol * 0.02}[a4];"
                f"[a1][a2][a3][a4]amix=inputs=4:duration=first,"
                # Add amplitude modulation to simulate speech rhythm
                f"tremolo=f=4:d=0.4,"
                f"highpass=f=80,lowpass=f=3000"
            )

            display_text = seg["text"].replace("'", "")
            # Create video with colored background + text + speech audio
            subprocess.run([
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c={seg['color']}:s=1920x1080:d={dur}:r=30",
                "-f", "lavfi", "-i", audio_filter,
                "-vf", (
                    f"drawtext=text='Part {i+1}':fontsize=80:fontcolor=white:"
                    f"x=(w-text_w)/2:y=(h/2)-80:"
                    f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf,"
                    f"drawtext=text='{display_text}':fontsize=36:fontcolor=0xcccccc:"
                    f"x=(w-text_w)/2:y=(h/2)+40:"
                    f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
                ),
                "-c:v", "libx264", "-preset", "ultrafast",
                "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                "-shortest",
                str(video_path),
            ], capture_output=True, check=True)
        else:
            # Silent segment — just black with silence
            subprocess.run([
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=black:s=1920x1080:d={dur}:r=30",
                "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo",
                "-c:v", "libx264", "-preset", "ultrafast",
                "-c:a", "aac", "-b:a", "128k",
                "-t", str(dur),
                str(video_path),
            ], capture_output=True, check=True)

        video_files.append(video_path)
        print(f"  Segment {i+1}/{len(SEGMENTS)} done ({dur}s)")

    # Concatenate all segments into one video
    concat_file = work_dir / "concat.txt"
    with open(concat_file, "w") as f:
        for vf in video_files:
            f.write(f"file '{vf.absolute()}'\n")

    print("  Joining all segments into one video...")
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(concat_file),
        "-c:v", "libx264", "-preset", "fast",
        "-c:a", "aac", "-b:a", "192k",
        str(output),
    ], capture_output=True, check=True)

    # Get final duration
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(output)],
        capture_output=True, text=True,
    )
    duration = float(result.stdout.strip())

    # Clean up temp files
    import shutil
    shutil.rmtree(work_dir)

    print()
    print(f"Test video created: {output}")
    print(f"Duration: {duration:.0f} seconds ({duration/60:.1f} minutes)")
    print(f"Size: {output.stat().st_size / (1024*1024):.1f} MB")

    return str(output)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    path = create_test_video()
    print(f"\nReady! Now run:")
    print(f"  python3 pipeline.py {path} --max-clips 3 --preset ultrafast")
