# TicketOps

Desktop app for video clipping, AI note-taking, and study tools — all in one.

## What It Does

- **Video Clipper** — Converts long videos into short-form TikTok clips with captions, headers, and virality scoring
- **AI Note Taker** — Generates structured meeting notes with speaker identification, action items, and decisions
- **Study Tools** — Creates summaries, study guides, and quizzes from your notes

## Setup

### Prerequisites

- Python 3.10+
- ffmpeg installed and on PATH (`sudo apt install ffmpeg` or `brew install ffmpeg`)

### Install

```bash
pip install -r requirements.txt
```

On Linux, for the desktop app you also need:
```bash
sudo apt install python3-gi gir1.2-webkit2-4.1
```

For GPU-accelerated Whisper transcription, install PyTorch with CUDA support first:
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu118
```

## Usage

### Desktop App (recommended)

```bash
python desktop.py
```

Options: `--debug`, `--fullscreen`, `--width 1440`, `--height 900`

### Web Mode (browser)

```bash
python app.py
```

Then open http://localhost:5000

### CLI — Single Video

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
desktop.py           # Desktop app launcher (pywebview)
app.py               # Flask web server (all routes & UI)
pipeline.py          # Video processing orchestrator
├── config.py        # All tunable parameters
├── ingestion.py     # Video validation & audio extraction
├── segmentation.py  # Content-aware clip boundary detection
├── scoring.py       # Virality ranking algorithm
├── captions.py      # Caption generation & styling
├── rendering.py     # ffmpeg clip export with overlays
├── tiktok_upload.py # Upload prep & API placeholders
├── note_taker.py    # AI meeting notes engine
├── speaker_id.py    # Speaker diarization
├── nlp_engine.py    # NLP analysis & entity extraction
├── note_export.py   # Multi-format export
├── notes_store.py   # Notes persistence
├── study_engine.py  # Summary, guide, quiz generation
└── study_templates.py # Study UI templates
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
