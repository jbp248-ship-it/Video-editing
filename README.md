# TikTok Video Clipper

Automatically converts long-form videos into multiple short-form TikTok clips optimized for virality.

## What It Does

1. **Ingests** a long video (10-120 min) in MP4/MOV/MKV format
2. **Segments** it into 60-120 second clips using content-aware analysis (not fixed intervals)
3. **Scores** each clip for viral potential using hook strength, emotional intensity, speech pace, completeness, and surprise
4. **Adds captions** — word-level timed, TikTok-styled, with keyword highlighting
5. **Adds headers** — auto-generated attention-grabbing text at the top
6. **Exports** vertical (9:16, 1080x1920) clips ready for TikTok upload

## Setup

### Prerequisites

- Python 3.10+
- ffmpeg installed and on PATH (`sudo apt install ffmpeg` or `brew install ffmpeg`)

### Install

```bash
pip install -r requirements.txt
```

For GPU-accelerated Whisper transcription, install PyTorch with CUDA support first:
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu118
```

## Usage

### Single Video

```bash
python pipeline.py video.mp4
```

### With Options

```bash
python pipeline.py video.mp4 \
  --max-clips 5 \
  --whisper-model small \
  --min-duration 45 \
  --max-duration 90 \
  --caption-size 56 \
  --preset fast \
  --output-dir my_clips
```

### Batch Processing

```bash
python pipeline.py input/ --batch
```

### All Options

| Flag | Default | Description |
|------|---------|-------------|
| `--max-clips` | 10 | Number of clips to generate |
| `--min-duration` | 60 | Minimum clip length (seconds) |
| `--max-duration` | 120 | Maximum clip length (seconds) |
| `--whisper-model` | base | Whisper model: tiny/base/small/medium/large |
| `--no-scene-detect` | false | Skip scene detection (faster) |
| `--caption-size` | 48 | Caption font size |
| `--caption-color` | white | Caption color |
| `--no-highlight` | false | Disable keyword highlighting |
| `--output-dir` | output | Where clips are saved |
| `--preset` | medium | ffmpeg speed: ultrafast/fast/medium/slow |
| `--fps` | 30 | Output framerate |
| `-v` | false | Verbose/debug logging |

## Output

```
output/
  my_video/
    clip_01_viral.mp4      # Highest scored clip
    clip_02_hook.mp4
    clip_03_story.mp4
    clip_04_shocking.mp4
    clip_05_emotional.mp4
    manifest.json           # Scores, timestamps, metadata
    tiktok_upload_specs.json # Ready-made TikTok metadata
    _work/
      clip_01.srt           # Caption files
      ...
```

Each clip includes:
- Vertical 9:16 formatting (1080x1920)
- Burned-in captions with keyword highlighting
- Auto-generated header text
- Optimized encoding for TikTok

## Architecture

```
pipeline.py          # Orchestrator — run this
├── config.py        # All tunable parameters
├── ingestion.py     # Video validation & audio extraction
├── segmentation.py  # Content-aware clip boundary detection
├── scoring.py       # Virality ranking algorithm
├── captions.py      # Caption generation & styling
├── rendering.py     # ffmpeg clip export with overlays
└── tiktok_upload.py # Upload prep & API placeholders
```

## How Virality Scoring Works

Each clip gets a 0-1 score from 6 weighted signals:

| Signal | Weight | What It Measures |
|--------|--------|------------------|
| Hook Strength | 25% | Do the first 3 seconds grab attention? |
| Emotional Intensity | 20% | Audio energy as proxy for passion/energy |
| Speech Pace | 10% | Is the pacing varied and engaging? |
| Completeness | 20% | Does the clip tell a complete idea? |
| Surprise Factor | 15% | Sudden energy spikes, scene changes |
| Brevity Bonus | 10% | Shorter = punchier = more rewatchable |

## TikTok Studio Integration

Direct upload API requires TikTok Developer approval. Currently the tool:
- Exports clips in exact TikTok-ready format
- Generates `tiktok_upload_specs.json` with suggested titles, descriptions, hashtags
- Includes placeholder code for the Content Posting API (implement when you have access)
- Can open TikTok Studio in browser for manual upload

## Tips

- Use `--whisper-model small` or `medium` for better transcription accuracy (slower)
- Use `--preset ultrafast` for quick previews, `--preset slow` for final quality
- For podcast/interview content, try `--min-duration 45 --max-duration 90`
- The `manifest.json` shows exactly why each clip was ranked the way it was
