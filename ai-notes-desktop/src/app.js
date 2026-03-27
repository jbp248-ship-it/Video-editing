/**
 * AI Note Taker — Desktop App
 *
 * Fixes from code review:
 *   - All HTML rendering uses textContent or escapeHtml() — no XSS
 *   - Network status detection (Web Speech API needs internet)
 *   - Single mic stream shared between recognition and level meter
 *   - Robust recognition restart with error reporting
 *   - Course rename/delete
 *   - Full-text search on transcripts
 *   - Close confirmation during recording
 *   - Keyboard shortcut Ctrl+R to start/stop
 */

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

// ══════════════════════════════════════════════════════════════════
//  DATA LAYER — localStorage (with size guard)
// ══════════════════════════════════════════════════════════════════

function loadData() {
  try {
    return JSON.parse(localStorage.getItem("ai-notes-data")) || { courses: [], notes: [] };
  } catch {
    return { courses: [], notes: [] };
  }
}

function saveData(d) {
  try {
    const json = JSON.stringify(d);
    // Warn if approaching localStorage limit (~5MB)
    if (json.length > 4 * 1024 * 1024) {
      console.warn(`[Storage] Data size: ${(json.length / 1024 / 1024).toFixed(1)} MB — approaching 5MB limit`);
    }
    localStorage.setItem("ai-notes-data", json);
  } catch (err) {
    console.error("[Storage] Save failed:", err);
    alert("Storage is full. Please export and delete old lectures to free space.");
  }
}

let data = loadData();

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════

let activeCourse = null;
let activeNote = null;
let recording = false;
let recognition = null;
let currentNoteId = null;
let recordingStartTime = 0;
let timerInterval = null;
let searchQuery = "";

// Single mic stream — shared between SpeechRecognition and level meter
let micStream = null;
let audioContext = null;
let analyser = null;
let levelAnimFrame = null;

// ══════════════════════════════════════════════════════════════════
//  UI REFERENCES
// ══════════════════════════════════════════════════════════════════

const courseListEl = document.getElementById("courseList");
const recordBtn = document.getElementById("recordBtn");
const timerEl = document.getElementById("timer");
const meterContainer = document.getElementById("meterContainer");
const meterFill = document.getElementById("meterFill");
const contentEl = document.getElementById("content");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalInput = document.getElementById("modalInput");
const modalCancel = document.getElementById("modalCancel");
const modalOk = document.getElementById("modalOk");

// Network status no longer needed — Whisper runs 100% offline

// ══════════════════════════════════════════════════════════════════
//  COURSE SIDEBAR
// ══════════════════════════════════════════════════════════════════

function renderCourses() {
  const notesByCourse = {};
  data.notes.forEach((n) => {
    notesByCourse[n.course] = (notesByCourse[n.course] || 0) + 1;
  });

  let html = `
    <div class="course-item ${activeCourse === null ? "active" : ""}" data-course="__all__">
      All Notes <span class="course-count">${data.notes.length}</span>
    </div>
  `;

  data.courses.forEach((c) => {
    const count = notesByCourse[c] || 0;
    html += `
      <div class="course-item ${activeCourse === c ? "active" : ""}" data-course="${escapeHtml(c)}">
        ${escapeHtml(c)} <span class="course-count">${count}</span>
        <span class="course-actions">
          <span class="course-action rename-course" data-name="${escapeHtml(c)}" title="Rename">&#9998;</span>
          <span class="course-action delete-course" data-name="${escapeHtml(c)}" title="Delete">&#10005;</span>
        </span>
      </div>
    `;
  });

  courseListEl.innerHTML = html;

  // Course click
  courseListEl.querySelectorAll(".course-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("course-action")) return;
      const course = el.dataset.course;
      activeCourse = course === "__all__" ? null : course;
      activeNote = null;
      renderCourses();
      renderContent();
    });
  });

  // Rename course
  courseListEl.querySelectorAll(".rename-course").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const oldName = el.dataset.name;
      showModal("Rename Course", oldName, (newName) => {
        if (newName && newName !== oldName) {
          const idx = data.courses.indexOf(oldName);
          if (idx !== -1) data.courses[idx] = newName;
          data.notes.forEach((n) => { if (n.course === oldName) n.course = newName; });
          if (activeCourse === oldName) activeCourse = newName;
          saveData(data);
          renderCourses();
          renderContent();
        }
      });
    });
  });

  // Delete course
  courseListEl.querySelectorAll(".delete-course").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = el.dataset.name;
      const count = notesByCourse[name] || 0;
      if (confirm(`Delete "${name}"? ${count} lecture(s) will be moved to "Uncategorized".`)) {
        data.courses = data.courses.filter((c) => c !== name);
        data.notes.forEach((n) => { if (n.course === name) n.course = "Uncategorized"; });
        if (!data.courses.includes("Uncategorized") && data.notes.some((n) => n.course === "Uncategorized")) {
          data.courses.push("Uncategorized");
        }
        if (activeCourse === name) activeCourse = null;
        saveData(data);
        renderCourses();
        renderContent();
      }
    });
  });
}

// ── Modal helper (used only for rename) ──
function showModal(title, defaultValue, onOk) {
  modalTitle.textContent = title;
  modalInput.value = defaultValue || "";
  modal.style.display = "flex";
  // Delay focus to ensure the modal is visible first
  setTimeout(() => { modalInput.focus(); modalInput.select(); }, 50);

  modalOk.onclick = () => {
    const val = modalInput.value.trim();
    modal.style.display = "none";
    onOk(val);
  };
}

// ── Inline Add Course (no modal — directly in sidebar) ──
const addCourseBtn = document.getElementById("addCourseBtn");
const addCourseForm = document.getElementById("addCourseForm");
const addCourseInput = document.getElementById("addCourseInput");
const addCourseOk = document.getElementById("addCourseOk");

addCourseBtn.addEventListener("click", () => {
  addCourseBtn.style.display = "none";
  addCourseForm.classList.add("visible");
  addCourseInput.value = "";
  setTimeout(() => addCourseInput.focus(), 50);
});

function submitCourse() {
  const name = addCourseInput.value.trim();
  if (name && !data.courses.includes(name)) {
    data.courses.push(name);
    saveData(data);
    activeCourse = name;
    renderCourses();
    renderContent();
  }
  addCourseForm.classList.remove("visible");
  addCourseBtn.style.display = "block";
}

addCourseOk.addEventListener("click", submitCourse);
addCourseInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitCourse();
  if (e.key === "Escape") {
    addCourseForm.classList.remove("visible");
    addCourseBtn.style.display = "block";
  }
});

modalCancel.addEventListener("click", () => { modal.style.display = "none"; });
modalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") modalOk.click();
  if (e.key === "Escape") { modal.style.display = "none"; }
});
// Close modal when clicking overlay background
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

// ══════════════════════════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════════════════════════

const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    if (!recording) renderContent();
  });
}

// ══════════════════════════════════════════════════════════════════
//  CONTENT AREA
// ══════════════════════════════════════════════════════════════════

function renderContent() {
  if (recording) { renderLiveTranscript(); return; }
  if (activeNote) { renderNoteDetail(); return; }
  renderNotesList();
}

function renderNotesList() {
  let notes = data.notes.filter((n) => !activeCourse || n.course === activeCourse);
  if (searchQuery) {
    notes = notes.filter((n) =>
      n.transcript.toLowerCase().includes(searchQuery) ||
      n.title.toLowerCase().includes(searchQuery)
    );
  }
  notes.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (notes.length === 0) {
    const title = searchQuery ? `No results for "${escapeHtml(searchQuery)}"` : (activeCourse || "All Notes");
    contentEl.innerHTML = `<div class="empty-state"><h2>${escapeHtml(title)}</h2><p>${searchQuery ? "Try a different search term." : "Add a course and start recording!"}</p></div>`;
    return;
  }

  let html = "";
  notes.forEach((note) => {
    const date = new Date(note.date).toLocaleDateString();
    const duration = formatTime(note.duration || 0);
    const preview = note.transcript.slice(0, 150) + (note.transcript.length > 150 ? "..." : "");
    const source = note.source === "extension" ? ' <span class="source-badge">Browser</span>' : "";

    html += `
      <div class="note-card" data-id="${escapeHtml(note.id)}">
        <div class="note-card-top">
          <h3>${escapeHtml(note.title)}${source}</h3>
          <button class="delete-btn" data-id="${escapeHtml(note.id)}" title="Delete">&#10005;</button>
        </div>
        <div class="meta">
          <span>${escapeHtml(date)}</span>
          <span>${duration}</span>
          <span>${escapeHtml(note.course)}</span>
        </div>
        <div class="preview">${escapeHtml(preview) || "No transcript"}</div>
      </div>
    `;
  });

  contentEl.innerHTML = html;

  // Open note on card click
  contentEl.querySelectorAll(".note-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn")) return;
      activeNote = data.notes.find((n) => n.id === el.dataset.id);
      renderContent();
    });
  });

  // Delete buttons on each card
  contentEl.querySelectorAll(".delete-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const note = data.notes.find((n) => n.id === id);
      if (note && confirm(`Delete "${note.title}"?`)) {
        data.notes = data.notes.filter((n) => n.id !== id);
        saveData(data);
        renderCourses();
        renderContent();
      }
    });
  });
}

function renderNoteDetail() {
  const note = activeNote;
  const date = new Date(note.date).toLocaleDateString();
  const duration = formatTime(note.duration || 0);

  let transcriptHtml = "";
  if (note.chunks && note.chunks.length > 0) {
    note.chunks.forEach((c) => {
      transcriptHtml += `<span class="ts">[${formatTime(c.time)}]</span> ${escapeHtml(c.text)}\n`;
    });
  } else {
    transcriptHtml = escapeHtml(note.transcript) || "No transcript";
  }

  contentEl.innerHTML = `
    <div class="note-detail-header">
      <div>
        <h2>${escapeHtml(note.title)}</h2>
        <div class="meta" style="margin-top:4px">
          <span>${escapeHtml(date)}</span><span>${duration}</span><span>${escapeHtml(note.course)}</span>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn" id="backBtn">&larr; Back</button>
        <button class="btn" id="exportBtn">Export .md</button>
        <button class="btn danger" id="deleteBtn">Delete</button>
      </div>
    </div>
    <div class="full-transcript">${transcriptHtml}</div>
  `;

  document.getElementById("backBtn").onclick = () => { activeNote = null; renderContent(); };
  document.getElementById("exportBtn").onclick = () => exportNote(note);
  document.getElementById("deleteBtn").onclick = () => {
    if (confirm("Delete this lecture? This cannot be undone.")) {
      data.notes = data.notes.filter((n) => n.id !== note.id);
      saveData(data);
      activeNote = null;
      renderCourses();
      renderContent();
    }
  };
}

// ══════════════════════════════════════════════════════════════════
//  LIVE TRANSCRIPT
// ══════════════════════════════════════════════════════════════════

let liveLines = [];
let interimText = "";

function renderLiveTranscript() {
  let html = "";
  liveLines.forEach((line) => {
    html += `<div class="transcript-line"><span class="ts">[${formatTime(line.time)}]</span> ${escapeHtml(line.text)}</div>`;
  });

  if (interimText) {
    html += `<div class="transcript-line interim">${escapeHtml(interimText)}</div>`;
  }

  if (!html) {
    html = `<div class="transcript-line interim">${online ? "Listening... start speaking." : "Offline — transcription unavailable. Recording audio only."}</div>`;
  }

  contentEl.innerHTML = html;
  contentEl.scrollTop = contentEl.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════
//  WHISPER MODEL STATUS
// ══════════════════════════════════════════════════════════════════

let modelReady = false;
let modelProgress = 0;

if (window.electronAPI) {
  window.electronAPI.onWhisperMessage((msg) => {
    if (msg.type === "progress") {
      modelProgress = msg.progress || 0;
      updateModelStatus();
    }
    if (msg.type === "loaded") {
      modelReady = true;
      updateModelStatus();
    }
    if (msg.type === "error") {
      console.error("[Whisper]", msg.error);
      updateModelStatus();
    }
    if (msg.type === "result") {
      onTranscriptionResult(msg);
    }
  });
}

function updateModelStatus() {
  const el = document.getElementById("modelStatus");
  if (!el) return;
  if (modelReady) {
    el.innerHTML = '<span class="net-dot online"></span> Whisper ready (offline)';
  } else {
    el.textContent = `Loading Whisper model... ${modelProgress}%`;
  }
}

// ══════════════════════════════════════════════════════════════════
//  RECORDING — Local Whisper via Worker Thread
//
//  Audio pipeline:
//    Mic → AudioContext → ScriptProcessor (downsample to 16kHz)
//      → 3-second buffer → IPC → Worker Thread → Whisper → result
//
//  100% offline. No Google servers. No network dependency.
// ══════════════════════════════════════════════════════════════════

const TARGET_SR = 16000;
const CHUNK_SEC = 3;
const CHUNK_FRAMES = TARGET_SR * CHUNK_SEC;

let chunkBuffer = [];
let chunkId = 0;

recordBtn.addEventListener("click", toggleRecording);

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "r") {
    e.preventDefault();
    toggleRecording();
  }
});

function toggleRecording() {
  if (recording) stopRecording();
  else startRecording();
}

async function startRecording() {
  if (!activeCourse) {
    alert("Please select or add a course first.");
    return;
  }

  if (!modelReady) {
    alert("Whisper model is still loading. Please wait for it to finish.");
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert("Microphone access denied.");
    return;
  }

  // Create note
  const noteId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const now = new Date();
  const title = `${activeCourse} — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  data.notes.push({
    id: noteId, course: activeCourse, title, date: now.toISOString(),
    transcript: "", chunks: [], duration: 0,
  });
  saveData(data);
  currentNoteId = noteId;
  liveLines = [];
  interimText = "Listening...";
  chunkBuffer = [];

  recordingStartTime = Date.now();
  recording = true;
  window.electronAPI?.setRecordingState?.(true);

  // Audio capture + downsampling
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(micStream);

  // Analyser for level meter
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  // ScriptProcessor for audio capture (simpler than AudioWorklet in Electron)
  const bufferSize = 4096;
  const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
  const ratio = audioContext.sampleRate / TARGET_SR;

  source.connect(processor);
  processor.connect(audioContext.destination);

  processor.onaudioprocess = (e) => {
    if (!recording) return;
    const input = e.inputBuffer.getChannelData(0);

    // Downsample to 16kHz via linear interpolation
    const outputLen = Math.floor(input.length / ratio);
    for (let i = 0; i < outputLen; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = input[idx] || 0;
      const s1 = input[idx + 1] || s0;
      chunkBuffer.push(s0 + frac * (s1 - s0));
    }

    // Ship chunk when we have enough
    if (chunkBuffer.length >= CHUNK_FRAMES) {
      const audio = chunkBuffer.splice(0, CHUNK_FRAMES);
      const id = chunkId++;
      interimText = "Transcribing...";
      renderLiveTranscript();

      window.electronAPI?.whisperTranscribe({
        type: "transcribe",
        id,
        audio, // plain Array — worker converts to Float32Array
      });
    }
  };

  // Level meter animation
  const buf = new Uint8Array(analyser.frequencyBinCount);
  function tick() {
    if (!recording) return;
    analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    meterFill.style.width = `${Math.min(100, (sum / (buf.length * 255)) * 400)}%`;
    levelAnimFrame = requestAnimationFrame(tick);
  }
  tick();

  // UI
  recordBtn.textContent = "Stop Recording (Ctrl+R)";
  recordBtn.classList.remove("start");
  recordBtn.classList.add("stop");
  timerEl.style.display = "inline";
  meterContainer.style.display = "block";

  timerInterval = setInterval(() => {
    timerEl.textContent = formatTime((Date.now() - recordingStartTime) / 1000);
  }, 1000);

  renderContent();
}

function onTranscriptionResult(msg) {
  if (!msg.text || !currentNoteId) return;

  const elapsed = (Date.now() - recordingStartTime) / 1000;
  liveLines.push({ text: msg.text, time: elapsed });
  interimText = "";

  const note = data.notes.find((n) => n.id === currentNoteId);
  if (note) {
    note.transcript += (note.transcript ? " " : "") + msg.text;
    note.chunks.push({ text: msg.text, time: elapsed });
    note.duration = Math.round(elapsed);
    saveData(data);
  }

  renderLiveTranscript();
}

function stopRecording() {
  recording = false;
  window.electronAPI?.setRecordingState?.(false);

  // Flush remaining audio
  if (chunkBuffer.length > 0 && window.electronAPI) {
    window.electronAPI.whisperTranscribe({
      type: "transcribe",
      id: chunkId++,
      audio: chunkBuffer.splice(0),
    });
  }

  // Teardown
  if (levelAnimFrame) cancelAnimationFrame(levelAnimFrame);
  if (audioContext) audioContext.close().catch(() => {});
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  audioContext = null;
  analyser = null;
  micStream = null;
  clearInterval(timerInterval);
  meterFill.style.width = "0%";

  const note = data.notes.find((n) => n.id === currentNoteId);
  if (note) {
    note.duration = Math.round((Date.now() - recordingStartTime) / 1000);
    saveData(data);
  }

  recordBtn.textContent = "Start Recording (Ctrl+R)";
  recordBtn.classList.remove("stop");
  recordBtn.classList.add("start");
  timerEl.style.display = "none";
  meterContainer.style.display = "none";

  currentNoteId = null;
  renderCourses();
  renderContent();
}

// ══════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════

function exportNote(note) {
  const date = new Date(note.date).toISOString().split("T")[0];
  const lines = [
    `# ${note.title}`, "",
    "| Field | Value |", "|-------|-------|",
    `| **Date** | ${date} |`,
    `| **Course** | ${note.course} |`,
    `| **Duration** | ${formatTime(note.duration)} |`,
    "", "---", "", "## Transcript", "",
  ];

  if (note.chunks?.length > 0) {
    note.chunks.forEach((c) => lines.push(`\`[${formatTime(c.time)}]\` ${c.text}`, ""));
  } else {
    lines.push(note.transcript || "_No transcript_", "");
  }

  const md = lines.join("\n");
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${date}-${note.course.replace(/[^a-zA-Z0-9]+/g, "-")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════════
//  CHROME EXTENSION BRIDGE
// ══════════════════════════════════════════════════════════════════

let extensionNoteId = null;

if (window.electronAPI) {
  window.electronAPI.onExtensionConnected((connected) => {
    const el = document.getElementById("extStatus");
    if (connected) {
      el.innerHTML = '<span class="ext-dot connected"></span> Extension: connected';
    } else {
      el.innerHTML = '<span class="ext-dot disconnected"></span> Extension: not connected';
    }
  });

  window.electronAPI.onExtensionMessage((msg) => {
    // Sanitize all incoming string fields
    const sanitize = (s) => (typeof s === "string" ? s : "");

    switch (msg.type) {
      case "start-session": {
        const course = sanitize(msg.course) || "Browser Recordings";
        if (!data.courses.includes(course)) data.courses.push(course);

        const noteId = "ext-" + Date.now().toString(36);
        const now = new Date();
        extensionNoteId = noteId;

        data.notes.push({
          id: noteId, course,
          title: sanitize(msg.title) || `${course} — ${now.toLocaleDateString()}`,
          date: now.toISOString(), transcript: "", chunks: [], duration: 0,
          source: "extension",
        });
        saveData(data);
        renderCourses();
        if (!recording) renderContent();
        break;
      }

      case "transcript-chunk": {
        if (!extensionNoteId) break;
        const note = data.notes.find((n) => n.id === extensionNoteId);
        if (!note) break;

        const text = sanitize(msg.text);
        if (!text) break;

        note.transcript += (note.transcript ? " " : "") + text;
        note.chunks.push({ text, time: Number(msg.offsetSec) || 0 });
        note.duration = Math.round(Number(msg.offsetSec) || note.duration);
        saveData(data);
        if (!activeNote && !recording) renderContent();
        break;
      }

      case "stop-session": {
        extensionNoteId = null;
        renderCourses();
        if (!recording) renderContent();
        break;
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

renderCourses();
renderContent();
updateModelStatus();
