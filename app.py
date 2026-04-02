"""
TikTok Video Clipper — Web App

A mobile-friendly web interface for the video clipper pipeline.
Upload a video, pick your settings, and download viral clips.

Usage:
    python3 app.py

Then open http://localhost:5000 on your phone or computer.
"""

import os
import json
import time
import re as _re
import uuid
import uuid as _uuid_mod
import threading
import logging
from pathlib import Path

from flask import (
    Flask, render_template_string, request, jsonify,
    send_file, redirect, url_for,
)
from werkzeug.utils import secure_filename

from config import PipelineConfig
# Heavy imports (pipeline, study_engine) are deferred to first use to speed up startup.
# pipeline imports whisper, torch, moviepy; study_engine imports transformers/BART.
from notes_store import get_note, update_note_cache, save_note, get_all_notes, get_dates_with_notes, get_notes_by_date
from study_templates import NOTES_PAGE_HTML, STUDY_UI_CSS
from version import __version__

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024  # 2GB max upload
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["VERSION"] = __version__

# Track processing jobs
jobs = {}

# Track async study jobs
_study_jobs: dict = {}  # job_id -> {"status": "pending"|"done"|"error", "result": ..., "error": ...}
_study_jobs_lock = threading.Lock()


def _validate_uuid(val):
    try:
        _uuid_mod.UUID(str(val), version=4)
        return True
    except ValueError:
        return False


def _get_study_func(name):
    """Lazy-import study_engine functions by name to avoid heavy imports at startup."""
    from study_engine import generate_structured_summary, generate_study_guide, generate_quiz, compile_notes
    mapping = {
        "generate_structured_summary": generate_structured_summary,
        "generate_study_guide": generate_study_guide,
        "generate_quiz": generate_quiz,
        "compile_notes": compile_notes,
    }
    return mapping[name]


def _run_study_job(job_id, func_name, note_id, field):
    try:
        func = _get_study_func(func_name)
        note = get_note(note_id)
        result = func(note["raw_content"])
        update_note_cache(note_id, field, result)
        with _study_jobs_lock:
            _study_jobs[job_id] = {"status": "done", "result": result}
    except Exception as e:
        with _study_jobs_lock:
            _study_jobs[job_id] = {"status": "error", "error": str(e)}


# ── HTML Template (single-page mobile-friendly app) ─────────────────────
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>TikTok Video Clipper</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #ffffff;
            min-height: 100vh;
            padding: 20px;
            padding-bottom: 100px;
        }

        .container {
            max-width: 500px;
            margin: 0 auto;
        }

        /* Header */
        .logo {
            text-align: center;
            padding: 30px 0 20px;
        }
        .logo h1 {
            font-size: 28px;
            background: linear-gradient(135deg, #fe2c55, #25f4ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .logo p {
            color: #888;
            font-size: 14px;
            margin-top: 8px;
        }

        /* Upload area */
        .upload-area {
            border: 2px dashed #333;
            border-radius: 16px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            margin: 20px 0;
            background: #111;
        }
        .upload-area:hover, .upload-area.dragover {
            border-color: #fe2c55;
            background: #1a1a1a;
        }
        .upload-area.has-file {
            border-color: #25f4ee;
            background: #0d1f1e;
        }
        .upload-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }
        .upload-text {
            font-size: 16px;
            color: #ccc;
        }
        .upload-hint {
            font-size: 12px;
            color: #666;
            margin-top: 8px;
        }
        .file-name {
            font-size: 14px;
            color: #25f4ee;
            margin-top: 8px;
            word-break: break-all;
        }
        #file-input { display: none; }

        /* Settings */
        .settings {
            background: #111;
            border-radius: 16px;
            padding: 20px;
            margin: 20px 0;
        }
        .settings h3 {
            font-size: 16px;
            margin-bottom: 16px;
            color: #ccc;
        }
        .setting-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #222;
        }
        .setting-row:last-child { border-bottom: none; }
        .setting-label {
            font-size: 14px;
            color: #aaa;
        }
        .setting-label small {
            display: block;
            font-size: 11px;
            color: #666;
            margin-top: 2px;
        }
        select, input[type="number"] {
            background: #222;
            color: white;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 14px;
            width: 120px;
            text-align: center;
        }

        /* Big action button */
        .btn-main {
            display: block;
            width: 100%;
            padding: 18px;
            border: none;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s;
            margin: 24px 0;
        }
        .btn-start {
            background: linear-gradient(135deg, #fe2c55, #ff6b81);
            color: white;
        }
        .btn-start:hover { transform: scale(1.02); }
        .btn-start:disabled {
            background: #333;
            color: #666;
            cursor: not-allowed;
            transform: none;
        }

        /* Progress */
        .progress-section {
            display: none;
            text-align: center;
            padding: 30px 0;
        }
        .progress-section.active { display: block; }

        .spinner {
            width: 60px;
            height: 60px;
            border: 4px solid #222;
            border-top-color: #fe2c55;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .progress-text {
            font-size: 16px;
            color: #ccc;
        }
        .progress-stage {
            font-size: 13px;
            color: #888;
            margin-top: 8px;
        }
        .progress-bar-container {
            background: #222;
            border-radius: 8px;
            height: 8px;
            margin: 20px 0;
            overflow: hidden;
        }
        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #fe2c55, #25f4ee);
            border-radius: 8px;
            transition: width 0.5s ease;
            width: 0%;
        }

        /* Results */
        .results-section {
            display: none;
        }
        .results-section.active { display: block; }

        .results-header {
            text-align: center;
            padding: 20px 0;
        }
        .results-header h2 {
            font-size: 24px;
            color: #25f4ee;
        }
        .results-header p {
            color: #888;
            font-size: 14px;
            margin-top: 4px;
        }

        .clip-card {
            background: #111;
            border-radius: 12px;
            padding: 16px;
            margin: 12px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .clip-info h4 {
            font-size: 16px;
            color: #fff;
        }
        .clip-info p {
            font-size: 12px;
            color: #888;
            margin-top: 4px;
        }
        .clip-score {
            font-size: 11px;
            color: #25f4ee;
            margin-top: 2px;
        }
        .btn-download {
            background: #25f4ee;
            color: #000;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            white-space: nowrap;
        }
        .btn-download:hover { background: #1ad4c8; }

        .btn-new {
            display: block;
            width: 100%;
            padding: 14px;
            background: #222;
            color: #ccc;
            border: 1px solid #333;
            border-radius: 12px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
            text-align: center;
        }

        .notes-card {
            background: linear-gradient(135deg, #0d1f1e 0%, #111 100%);
            border: 1px solid #25f4ee;
            border-radius: 12px;
            padding: 20px;
            margin: 16px 0;
            text-align: center;
        }
        .notes-card h4 {
            font-size: 18px;
            color: #25f4ee;
            margin-bottom: 6px;
        }
        .notes-card p {
            font-size: 13px;
            color: #888;
            margin-bottom: 14px;
        }
        .notes-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .notes-buttons .btn-download {
            font-size: 13px;
            padding: 8px 16px;
        }

        .error-msg {
            background: #2a0a0a;
            border: 1px solid #fe2c55;
            border-radius: 8px;
            padding: 12px;
            color: #ff6b81;
            font-size: 14px;
            margin: 12px 0;
            display: none;
        }
    </style>
</head>
<body>
<div class="container">

    <!-- HEADER -->
    <div class="logo">
        <h1>TikTok Video Clipper</h1>
        <p>Upload a long video, get viral clips back</p>
        <a href="/notes" style="display:inline-block;margin-top:10px;padding:8px 20px;background:#111;border:1px solid #333;border-radius:8px;color:#25f4ee;font-size:13px;text-decoration:none;">My Notes &amp; Study Tools</a>
    </div>

    <!-- UPLOAD SECTION -->
    <div id="upload-section">

        <div class="upload-area" id="upload-area" onclick="document.getElementById('file-input').click()">
            <div class="upload-icon">&#127916;</div>
            <div class="upload-text">Tap to select your video</div>
            <div class="upload-hint">MP4, MOV, or MKV &bull; up to 2GB</div>
            <div class="file-name" id="file-name"></div>
        </div>
        <input type="file" id="file-input" accept="video/*,.mp4,.mov,.mkv,.avi,.webm">

        <div class="settings">
            <h3>Settings</h3>

            <div class="setting-row">
                <div class="setting-label">
                    Number of clips
                    <small>How many clips to generate</small>
                </div>
                <input type="number" id="max-clips" value="5" min="1" max="20">
            </div>

            <div class="setting-row">
                <div class="setting-label">
                    Clip length
                    <small>How long each clip should be</small>
                </div>
                <select id="clip-length">
                    <option value="short">Short (30-60s)</option>
                    <option value="medium" selected>Medium (60-90s)</option>
                    <option value="long">Long (60-120s)</option>
                </select>
            </div>

            <div class="setting-row">
                <div class="setting-label">
                    Quality
                    <small>Higher = better but slower</small>
                </div>
                <select id="quality">
                    <option value="fast">Fast preview</option>
                    <option value="medium" selected>Balanced</option>
                    <option value="high">Best quality</option>
                </select>
            </div>

            <div class="setting-row">
                <div class="setting-label">
                    AI Notes
                    <small>Generate smart meeting notes</small>
                </div>
                <select id="notes-mode">
                    <option value="detailed" selected>Detailed notes</option>
                    <option value="concise">Concise summary</option>
                    <option value="action">Action items only</option>
                    <option value="off">No notes</option>
                </select>
            </div>
        </div>

        <div class="error-msg" id="error-msg"></div>

        <button class="btn-main btn-start" id="btn-start" disabled onclick="startProcessing()">
            Select a video first
        </button>
    </div>

    <!-- PROGRESS SECTION -->
    <div class="progress-section" id="progress-section">
        <div class="spinner"></div>
        <div class="progress-text" id="progress-text">Uploading video...</div>
        <div class="progress-stage" id="progress-stage"></div>
        <div class="progress-bar-container">
            <div class="progress-bar" id="progress-bar"></div>
        </div>
    </div>

    <!-- RESULTS SECTION -->
    <div class="results-section" id="results-section">
        <div class="results-header">
            <h2>Your clips are ready!</h2>
            <p id="results-summary"></p>
        </div>
        <div class="notes-card" id="notes-card" style="display:none">
            <h4>AI Meeting Notes</h4>
            <p>Structured notes with topics, action items, and key takeaways</p>
            <div class="notes-buttons">
                <a href="" class="btn-download" id="btn-notes-md">Markdown</a>
                <a href="" class="btn-download" id="btn-notes-json">JSON</a>
            </div>
        </div>
        <div id="clips-list"></div>
        <button class="btn-new" onclick="location.reload()">
            Process another video
        </button>
    </div>

</div>

<script>
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.getElementById('upload-area');
    const fileName = document.getElementById('file-name');
    const btnStart = document.getElementById('btn-start');
    let selectedFile = null;

    // File selection
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            selectedFile = this.files[0];
            fileName.textContent = selectedFile.name + ' (' + formatSize(selectedFile.size) + ')';
            uploadArea.classList.add('has-file');
            btnStart.disabled = false;
            btnStart.textContent = 'Create clips!';
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', function() {
        this.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            selectedFile = e.dataTransfer.files[0];
            fileInput.files = e.dataTransfer.files;
            fileName.textContent = selectedFile.name + ' (' + formatSize(selectedFile.size) + ')';
            uploadArea.classList.add('has-file');
            btnStart.disabled = false;
            btnStart.textContent = 'Create clips!';
        }
    });

    function formatSize(bytes) {
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function startProcessing() {
        if (!selectedFile) return;

        const errorMsg = document.getElementById('error-msg');
        errorMsg.style.display = 'none';

        // Show progress
        document.getElementById('upload-section').style.display = 'none';
        document.getElementById('progress-section').classList.add('active');

        // Get settings
        const maxClips = document.getElementById('max-clips').value;
        const clipLength = document.getElementById('clip-length').value;
        const quality = document.getElementById('quality').value;
        const notesMode = document.getElementById('notes-mode').value;

        // Upload file
        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('max_clips', maxClips);
        formData.append('clip_length', clipLength);
        formData.append('quality', quality);
        formData.append('notes_mode', notesMode);

        updateProgress('Uploading video...', '', 10);

        fetch('/upload', { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    showError(data.error);
                    return;
                }
                updateProgress('Processing started...', 'This may take a few minutes', 20);
                pollStatus(data.job_id);
            })
            .catch(err => showError('Upload failed: ' + err.message));
    }

    function pollStatus(jobId) {
        const poll = setInterval(() => {
            fetch('/status/' + jobId)
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'processing') {
                        const stages = {
                            'ingestion': ['Analyzing video...', 20],
                            'segmentation': ['Finding the best moments...', 40],
                            'scoring': ['Ranking clips by virality...', 55],
                            'rendering': ['Creating your clips...', 70],
                            'notes': ['Generating AI meeting notes...', 90],
                        };
                        const info = stages[data.stage] || ['Working...', 50];
                        updateProgress(info[0], data.detail || '', info[1]);
                    }
                    else if (data.status === 'done') {
                        clearInterval(poll);
                        updateProgress('Done!', '', 100);
                        setTimeout(() => showResults(data), 500);
                    }
                    else if (data.status === 'error') {
                        clearInterval(poll);
                        showError(data.error);
                    }
                })
                .catch(() => {});
        }, 2000);
    }

    function updateProgress(text, stage, percent) {
        document.getElementById('progress-text').textContent = text;
        document.getElementById('progress-stage').textContent = stage;
        document.getElementById('progress-bar').style.width = percent + '%';
    }

    function showResults(data) {
        document.getElementById('progress-section').classList.remove('active');
        document.getElementById('results-section').classList.add('active');
        document.getElementById('results-summary').textContent =
            data.clips.length + ' clips created from your video';

        // Show notes card if notes were generated
        if (data.note_files && data.note_files.length > 0) {
            const notesCard = document.getElementById('notes-card');
            notesCard.style.display = 'block';
            const btnMd = document.getElementById('btn-notes-md');
            const btnJson = document.getElementById('btn-notes-json');
            // Find markdown and json files among note_files
            const mdFile = data.note_files.find(f => f.endsWith('.md'));
            const jsonFile = data.note_files.find(f => f.endsWith('.json'));
            if (mdFile) {
                btnMd.href = '/download/' + data.job_id + '/notes/' + mdFile.split('/').pop();
                btnMd.style.display = 'inline-block';
            } else {
                btnMd.style.display = 'none';
            }
            if (jsonFile) {
                btnJson.href = '/download/' + data.job_id + '/notes/' + jsonFile.split('/').pop();
                btnJson.style.display = 'inline-block';
            } else {
                btnJson.style.display = 'none';
            }
        }

        const list = document.getElementById('clips-list');
        list.innerHTML = '';

        data.clips.forEach(clip => {
            const card = document.createElement('div');
            card.className = 'clip-card';
            card.innerHTML = `
                <div class="clip-info">
                    <h4>#${clip.rank} ${clip.label}</h4>
                    <p>${clip.duration}s &bull; ${clip.size_mb} MB</p>
                    <div class="clip-score">Virality: ${(clip.score * 100).toFixed(0)}%</div>
                </div>
                <a href="/download/${data.job_id}/${clip.filename}" class="btn-download">
                    Download
                </a>
            `;
            list.appendChild(card);
        });
    }

    function showError(message) {
        document.getElementById('progress-section').classList.remove('active');
        document.getElementById('upload-section').style.display = 'block';
        const errorMsg = document.getElementById('error-msg');
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
    }
</script>
</body>
</html>
"""


# ── Health & Preload Routes ────────────────────────────────────────────


@app.route("/health")
def health():
    """Health check endpoint for Electron wrapper to know Flask is ready."""
    return jsonify({"status": "ok"})


@app.route("/api/preload-models", methods=["POST"])
def preload_models():
    """Trigger background loading of AI models so they're ready when needed."""
    def _preload():
        try:
            from pipeline import process_video  # triggers whisper, moviepy imports
            from study_engine import _get_pipeline  # triggers BART model load
        except Exception as e:
            logger.warning("Model preload failed: %s", e)
    threading.Thread(target=_preload, daemon=True).start()
    return jsonify({"status": "preloading"})


# ── Update Routes ────────────────────────────────────────────────────────


@app.route("/api/version")
def api_version():
    """Return current app version and build info."""
    from version import __version__, __build_date__
    from updater import get_current_info
    info = get_current_info()
    return jsonify({
        "version": __version__,
        "build_date": __build_date__,
        **info,
    })


@app.route("/api/check-update")
def api_check_update():
    """Check if a newer version is available on GitHub."""
    from updater import check_for_updates
    result = check_for_updates()
    return jsonify(result)


@app.route("/api/changelog")
def api_changelog():
    """Get list of new commits available."""
    from updater import get_changelog
    return jsonify({"commits": get_changelog()})


@app.route("/api/update", methods=["POST"])
def api_apply_update():
    """Pull the latest code from GitHub."""
    from updater import apply_update
    result = apply_update()
    return jsonify(result)


@app.route("/api/restart", methods=["POST"])
def api_restart():
    """Restart the Flask server to apply updates."""
    import sys
    def _restart():
        import time
        time.sleep(1)
        os.execv(sys.executable, [sys.executable] + sys.argv)
    threading.Thread(target=_restart, daemon=True).start()
    return jsonify({"status": "restarting"})


# ── Routes ──────────────────────────────────────────────────────────────


@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route("/upload", methods=["POST"])
def upload():
    """Handle video upload and start processing."""
    if "video" not in request.files:
        return jsonify({"error": "No video file uploaded"}), 400

    file = request.files["video"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    # Create job
    job_id = str(uuid.uuid4())[:8]
    upload_dir = Path(app.config["UPLOAD_FOLDER"]) / job_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    filename = secure_filename(file.filename)
    video_path = str(upload_dir / filename)
    file.save(video_path)

    # Parse settings
    max_clips = int(request.form.get("max_clips", 5))
    clip_length = request.form.get("clip_length", "medium")
    quality = request.form.get("quality", "medium")

    length_map = {
        "short": (30, 60),
        "medium": (60, 90),
        "long": (60, 120),
    }
    min_dur, max_dur = length_map.get(clip_length, (60, 90))

    preset_map = {"fast": "ultrafast", "medium": "medium", "high": "slow"}
    whisper_map = {"fast": "tiny", "medium": "base", "high": "small"}

    # Parse notes settings
    notes_mode = request.form.get("notes_mode", "detailed")

    # Build config
    config = PipelineConfig()
    config.clip.max_clips = max_clips
    config.clip.min_duration = min_dur
    config.clip.max_duration = max_dur
    config.output.preset = preset_map.get(quality, "medium")
    config.whisper_model = whisper_map.get(quality, "base")
    config.output.output_dir = f"output/{job_id}"

    # Note generation config
    if notes_mode != "off":
        config.note.generate_notes = True
        config.note.note_template = notes_mode
    else:
        config.note.generate_notes = False

    # Track job
    jobs[job_id] = {
        "status": "processing",
        "stage": "ingestion",
        "detail": "",
        "video_path": video_path,
        "config": config,
        "clips": [],
        "error": None,
    }

    # Run pipeline in background thread
    thread = threading.Thread(target=_run_pipeline, args=(job_id,))
    thread.daemon = True
    thread.start()

    logger.info(f"Job {job_id} started for {filename}")
    return jsonify({"job_id": job_id})


def _run_pipeline(job_id: str):
    """Run the pipeline in a background thread, updating job status."""
    job = jobs[job_id]
    video_path = job["video_path"]
    config = job["config"]

    try:
        # Patch logger to capture stage updates
        import pipeline as pipeline_mod
        original_info = pipeline_mod.logger.info

        def tracking_info(msg, *args):
            original_info(msg, *args)
            msg_lower = str(msg).lower()
            if "stage 1" in msg_lower or "ingestion" in msg_lower:
                job["stage"] = "ingestion"
                job["detail"] = "Validating and extracting audio"
            elif "stage 2" in msg_lower or "segmentation" in msg_lower:
                job["stage"] = "segmentation"
                job["detail"] = "Analyzing speech, scenes, and audio"
            elif "stage 3" in msg_lower or "scoring" in msg_lower:
                job["stage"] = "scoring"
                job["detail"] = "Ranking clips by viral potential"
            elif "stage 4" in msg_lower or "rendering" in msg_lower:
                job["stage"] = "rendering"
                job["detail"] = "Exporting vertical clips with captions"
            elif "stage 5" in msg_lower or "note" in msg_lower:
                job["stage"] = "notes"
                job["detail"] = "Generating AI meeting notes"

        pipeline_mod.logger.info = tracking_info

        # Run it (lazy import — process_video triggers heavy whisper/torch/moviepy loads)
        from pipeline import process_video
        output_paths = process_video(video_path, config)

        # Gather results
        clips = []
        manifest_path = Path(config.output.output_dir) / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            for clip_info in manifest.get("clips", []):
                clip_path = Path(config.output.output_dir) / clip_info["filename"]
                size_mb = clip_path.stat().st_size / (1024 * 1024) if clip_path.exists() else 0
                clips.append({
                    "rank": clip_info["rank"],
                    "label": clip_info["label"].capitalize(),
                    "filename": clip_info["filename"],
                    "duration": int(clip_info["duration"]),
                    "score": clip_info["scores"]["total"],
                    "size_mb": f"{size_mb:.1f}",
                })

        # Gather note files from manifest
        note_files = []
        if manifest_path.exists():
            note_files = manifest.get("notes", {}).get("files", [])

        # Auto-save notes to the notes store
        try:
            from pathlib import Path as _Path
            manifest_data = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
            # Get full transcript from manifest or build from clips
            raw_content = manifest_data.get("transcript", "")
            if not raw_content:
                for clip in manifest_data.get("clips", []):
                    raw_content += (clip.get("transcript") or clip.get("text") or clip.get("transcript_preview", "")) + "\n"
            if raw_content.strip():
                video_stem = _Path(video_path).stem
                save_note(
                    title=video_stem,
                    raw_content=raw_content,
                    job_id=job_id,
                )
                logger.info(f"Auto-saved note for job {job_id}")
        except Exception as _e:
            logger.warning(f"Could not auto-save note: {_e}")

        job["status"] = "done"
        job["clips"] = clips
        job["note_files"] = note_files
        pipeline_mod.logger.info = original_info
        logger.info(f"Job {job_id} complete: {len(clips)} clips")

    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        logger.error(f"Job {job_id} failed: {e}")


@app.route("/status/<job_id>")
def status(job_id):
    """Poll endpoint for job status."""
    if job_id not in jobs:
        return jsonify({"status": "error", "error": "Job not found"}), 404

    job = jobs[job_id]
    return jsonify({
        "status": job["status"],
        "stage": job.get("stage", ""),
        "detail": job.get("detail", ""),
        "clips": job.get("clips", []),
        "note_files": job.get("note_files", []),
        "error": job.get("error"),
        "job_id": job_id,
    })


@app.route("/download/<job_id>/<filename>")
def download(job_id, filename):
    """Download a generated clip."""
    safe_filename = secure_filename(filename)
    file_path = Path(f"output/{job_id}") / safe_filename

    # Check subdirectories too (output is nested by video name)
    if not file_path.exists():
        for subdir in Path(f"output/{job_id}").iterdir():
            if subdir.is_dir():
                candidate = subdir / safe_filename
                if candidate.exists():
                    file_path = candidate
                    break

    if not file_path.exists():
        return "File not found", 404

    return send_file(str(file_path.absolute()), as_attachment=True)


@app.route("/download/<job_id>/notes/<filename>")
def download_notes(job_id, filename):
    """Download a generated note file from the notes subdirectory."""
    safe_filename = secure_filename(filename)
    output_base = Path(f"output/{job_id}")

    # Notes may be at the top level or inside a video-name subdirectory
    candidates = [output_base / safe_filename]
    if output_base.exists():
        for subdir in output_base.iterdir():
            if subdir.is_dir():
                candidates.append(subdir / safe_filename)

    for candidate in candidates:
        if candidate.exists():
            return send_file(str(candidate.absolute()), as_attachment=True)

    return "Note file not found", 404


# ── Study Feature Routes ─────────────────────────────────────────────────

@app.route("/notes")
def notes_page():
    """Show all saved notes with study features."""
    try:
        notes = get_all_notes()
        dates = get_dates_with_notes()
    except Exception:
        notes = []
        dates = []
    return render_template_string(NOTES_PAGE_HTML, notes=notes, dates=dates, css=STUDY_UI_CSS)


@app.route("/api/summarize/<note_id>")
def api_summarize(note_id):
    """Generate or return cached structured summary for a note."""
    if not _validate_uuid(note_id):
        return jsonify({"error": "Invalid note ID"}), 400
    try:
        note = get_note(note_id)
        if not note:
            return jsonify({"error": "Note not found"}), 404
        # Return cache if available
        if note.get("summary"):
            return jsonify({"summary": note["summary"], "cached": True})
        # Start background job
        job_id = str(uuid.uuid4())
        with _study_jobs_lock:
            _study_jobs[job_id] = {"status": "pending"}
        t = threading.Thread(target=_run_study_job, args=(job_id, "generate_structured_summary", note_id, "summary"))
        t.daemon = True
        t.start()
        return jsonify({"job_id": job_id, "status": "pending"})
    except Exception as e:
        logger.error(f"Summarize error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/study-guide/<note_id>")
def api_study_guide(note_id):
    """Generate or return cached study guide for a note."""
    if not _validate_uuid(note_id):
        return jsonify({"error": "Invalid note ID"}), 400
    try:
        note = get_note(note_id)
        if not note:
            return jsonify({"error": "Note not found"}), 404
        if note.get("study_guide"):
            return jsonify({"study_guide": note["study_guide"], "cached": True})
        # Start background job
        job_id = str(uuid.uuid4())
        with _study_jobs_lock:
            _study_jobs[job_id] = {"status": "pending"}
        t = threading.Thread(target=_run_study_job, args=(job_id, "generate_study_guide", note_id, "study_guide"))
        t.daemon = True
        t.start()
        return jsonify({"job_id": job_id, "status": "pending"})
    except Exception as e:
        logger.error(f"Study guide error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/quiz/<note_id>")
def api_quiz(note_id):
    """Generate or return cached quiz for a note."""
    if not _validate_uuid(note_id):
        return jsonify({"error": "Invalid note ID"}), 400
    try:
        note = get_note(note_id)
        if not note:
            return jsonify({"error": "Note not found"}), 404
        if note.get("quiz"):
            return jsonify({"quiz": note["quiz"], "cached": True})
        # Start background job
        job_id = str(uuid.uuid4())
        with _study_jobs_lock:
            _study_jobs[job_id] = {"status": "pending"}
        t = threading.Thread(target=_run_study_job, args=(job_id, "generate_quiz", note_id, "quiz"))
        t.daemon = True
        t.start()
        return jsonify({"job_id": job_id, "status": "pending"})
    except Exception as e:
        logger.error(f"Quiz error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/job/<job_id>")
def api_job_status(job_id):
    """Return the status and result of an async study job."""
    with _study_jobs_lock:
        job = _study_jobs.get(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/compile", methods=["POST"])
def api_compile():
    """Compile notes from multiple dates into one cohesive document."""
    try:
        data = request.get_json()
        dates = data.get("dates", [])
        if not isinstance(dates, list) or len(dates) > 30:
            return jsonify({"error": "Select between 1 and 30 dates"}), 400
        if not dates:
            return jsonify({"error": "No dates selected"}), 400
        for d in dates:
            if not _re.match(r'^\d{4}-\d{2}-\d{2}$', str(d)):
                return jsonify({"error": f"Invalid date format: {d}"}), 400
        # Gather notes for selected dates
        notes_list = []
        for d in dates:
            day_notes = get_notes_by_date(d)
            for n in day_notes:
                notes_list.append({"date": d, "content": n["raw_content"], "title": n.get("title", "")})
        if not notes_list:
            return jsonify({"error": "No notes found for selected dates"}), 404
        from study_engine import compile_notes
        compiled = compile_notes(notes_list)
        return jsonify({"compiled": compiled})
    except Exception as e:
        logger.error(f"Compile error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/save-note", methods=["POST"])
def api_save_note():
    """Save a note manually (from text input)."""
    try:
        data = request.get_json()
        title = data.get("title", "Untitled Note")
        content = data.get("content", "")
        date = data.get("date")
        if not content:
            return jsonify({"error": "Content is required"}), 400
        note = save_note(title, content, date=date)
        return jsonify({"note": note})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Main ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    import webbrowser

    parser = argparse.ArgumentParser(description="TikTok Video Clipper web server")
    parser.add_argument("--port", type=int,
                        default=int(os.environ.get("PORT", os.environ.get("FLASK_PORT", 5000))),
                        help="Port to listen on (default: 5000, or PORT/FLASK_PORT env var)")
    parser.add_argument("--no-browser", action="store_true",
                        help="Don't auto-open the browser (used by Electron wrapper)")
    args = parser.parse_args()

    Path(app.config["UPLOAD_FOLDER"]).mkdir(exist_ok=True)
    Path("output").mkdir(exist_ok=True)

    print()
    print("=" * 50)
    print("  TikTok Video Clipper")
    print("=" * 50)
    print()
    print("  Open this on your phone or computer:")
    print()
    print(f"  http://localhost:{args.port}")
    print()
    print("  On your phone (same WiFi network):")
    print(f"  http://<your-computer-ip>:{args.port}")
    print()
    print("  Press Ctrl+C to stop")
    print("=" * 50)
    print()

    if not args.no_browser:
        # Open browser after a short delay so the server has time to start
        threading.Timer(1.5, webbrowser.open, args=[f"http://localhost:{args.port}"]).start()

    app.run(host="0.0.0.0", port=args.port, debug=False, threaded=True)
