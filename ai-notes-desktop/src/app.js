/**
 * AI Note Taker — Desktop App
 *
 * Uses the Web Speech API (SpeechRecognition) for INSTANT real-time
 * transcription. No Whisper, no WASM, no 10-second delay.
 *
 * Data is stored in localStorage (persists across restarts).
 */

// ══════════════════════════════════════════════════════════════════
//  DATA LAYER — localStorage
// ══════════════════════════════════════════════════════════════════

function loadData() {
  try {
    return JSON.parse(localStorage.getItem("ai-notes-data")) || { courses: [], notes: [] };
  } catch {
    return { courses: [], notes: [] };
  }
}

function saveData(data) {
  localStorage.setItem("ai-notes-data", JSON.stringify(data));
}

let data = loadData();

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════

let activeCourse = null; // course name or null (show all)
let activeNote = null;   // note object or null
let recording = false;
let recognition = null;
let currentNoteId = null;
let recordingStartTime = 0;
let timerInterval = null;

// Audio level monitoring
let audioContext = null;
let analyser = null;
let micStream = null;
let levelAnimFrame = null;

// ══════════════════════════════════════════════════════════════════
//  UI REFERENCES
// ══════════════════════════════════════════════════════════════════

const courseListEl = document.getElementById("courseList");
const addCourseBtn = document.getElementById("addCourseBtn");
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

// ══════════════════════════════════════════════════════════════════
//  COURSE SIDEBAR
// ══════════════════════════════════════════════════════════════════

function renderCourses() {
  const notesByCoourse = {};
  data.notes.forEach((n) => {
    notesByCoourse[n.course] = (notesByCoourse[n.course] || 0) + 1;
  });

  let html = `
    <div class="course-item ${activeCourse === null ? "active" : ""}" data-course="__all__">
      All Notes <span class="course-count">${data.notes.length}</span>
    </div>
  `;

  data.courses.forEach((c) => {
    const count = notesByCoourse[c] || 0;
    html += `
      <div class="course-item ${activeCourse === c ? "active" : ""}" data-course="${c}">
        ${c} <span class="course-count">${count}</span>
      </div>
    `;
  });

  courseListEl.innerHTML = html;

  // Click handlers
  courseListEl.querySelectorAll(".course-item").forEach((el) => {
    el.addEventListener("click", () => {
      const course = el.dataset.course;
      activeCourse = course === "__all__" ? null : course;
      activeNote = null;
      renderCourses();
      renderContent();
    });
  });
}

addCourseBtn.addEventListener("click", () => {
  modalTitle.textContent = "Add Course";
  modalInput.value = "";
  modalInput.placeholder = "e.g. CS101 — Intro to Computer Science";
  modal.style.display = "flex";
  modalInput.focus();

  modalOk.onclick = () => {
    const name = modalInput.value.trim();
    if (name && !data.courses.includes(name)) {
      data.courses.push(name);
      saveData(data);
      activeCourse = name;
      renderCourses();
      renderContent();
    }
    modal.style.display = "none";
  };
});

modalCancel.addEventListener("click", () => { modal.style.display = "none"; });
modalInput.addEventListener("keydown", (e) => { if (e.key === "Enter") modalOk.click(); });

// ══════════════════════════════════════════════════════════════════
//  CONTENT AREA
// ══════════════════════════════════════════════════════════════════

function renderContent() {
  if (recording) {
    renderLiveTranscript();
    return;
  }

  if (activeNote) {
    renderNoteDetail();
    return;
  }

  renderNotesList();
}

function renderNotesList() {
  let notes = data.notes.filter((n) => !activeCourse || n.course === activeCourse);
  notes.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (notes.length === 0) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <h2>${activeCourse || "All Notes"}</h2>
        <p>${activeCourse ? "No lectures recorded for this course yet." : "Add a course and start recording!"}</p>
      </div>
    `;
    return;
  }

  let html = "";
  notes.forEach((note) => {
    const date = new Date(note.date).toLocaleDateString();
    const duration = formatTime(note.duration || 0);
    const preview = note.transcript.slice(0, 150) + (note.transcript.length > 150 ? "..." : "");

    html += `
      <div class="note-card" data-id="${note.id}">
        <h3>${note.title}</h3>
        <div class="meta">
          <span>${date}</span>
          <span>${duration}</span>
          <span>${note.course}</span>
        </div>
        <div class="preview">${preview || "No transcript"}</div>
      </div>
    `;
  });

  contentEl.innerHTML = html;

  contentEl.querySelectorAll(".note-card").forEach((el) => {
    el.addEventListener("click", () => {
      activeNote = data.notes.find((n) => n.id === el.dataset.id);
      renderContent();
    });
  });
}

function renderNoteDetail() {
  const note = activeNote;
  const date = new Date(note.date).toLocaleDateString();
  const duration = formatTime(note.duration || 0);

  // Build timestamped transcript
  let transcriptHtml = "";
  if (note.chunks && note.chunks.length > 0) {
    note.chunks.forEach((c) => {
      transcriptHtml += `<span class="ts">[${formatTime(c.time)}]</span> ${c.text}\n`;
    });
  } else {
    transcriptHtml = note.transcript || "No transcript";
  }

  contentEl.innerHTML = `
    <div class="note-detail-header">
      <div>
        <h2>${note.title}</h2>
        <div class="meta" style="margin-top:4px">
          <span>${date}</span><span>${duration}</span><span>${note.course}</span>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn" id="backBtn">← Back</button>
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
//  LIVE TRANSCRIPT (during recording)
// ══════════════════════════════════════════════════════════════════

let liveLines = [];
let interimText = "";

function renderLiveTranscript() {
  let html = "";
  liveLines.forEach((line) => {
    html += `<div class="transcript-line"><span class="ts">[${formatTime(line.time)}]</span> ${line.text}</div>`;
  });

  if (interimText) {
    html += `<div class="transcript-line interim">${interimText}</div>`;
  }

  if (!html) {
    html = `<div class="transcript-line interim">Listening... start speaking.</div>`;
  }

  contentEl.innerHTML = html;
  contentEl.scrollTop = contentEl.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════
//  RECORDING — Web Speech API (INSTANT transcription)
// ══════════════════════════════════════════════════════════════════

recordBtn.addEventListener("click", () => {
  if (recording) {
    stopRecording();
  } else {
    startRecording();
  }
});

function startRecording() {
  if (!activeCourse) {
    alert("Please select or add a course first.");
    return;
  }

  // Check Speech Recognition support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition is not supported in this browser.");
    return;
  }

  // Create a new note
  const noteId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const now = new Date();
  const title = `${activeCourse} — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const newNote = {
    id: noteId,
    course: activeCourse,
    title,
    date: now.toISOString(),
    transcript: "",
    chunks: [],
    duration: 0,
  };

  data.notes.push(newNote);
  saveData(data);
  currentNoteId = noteId;
  liveLines = [];
  interimText = "";

  // Start speech recognition
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  recordingStartTime = Date.now();

  recognition.onresult = (event) => {
    const elapsed = (Date.now() - recordingStartTime) / 1000;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();

      if (result.isFinal) {
        // Final result — add to transcript
        liveLines.push({ text, time: elapsed });
        interimText = "";

        // Save to note
        const note = data.notes.find((n) => n.id === currentNoteId);
        if (note) {
          note.transcript += (note.transcript ? " " : "") + text;
          note.chunks.push({ text, time: elapsed });
          note.duration = Math.round(elapsed);
          saveData(data);
        }
      } else {
        // Interim result — show as preview (updates in real-time as you speak)
        interimText = text;
      }
    }

    renderLiveTranscript();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (event.error === "not-allowed") {
      alert("Microphone access denied. Please allow microphone access in your system settings.");
      stopRecording();
    }
  };

  // Restart recognition if it stops (Chrome stops after ~60s of silence)
  recognition.onend = () => {
    if (recording) {
      try { recognition.start(); } catch {}
    }
  };

  recognition.start();
  recording = true;

  // Start audio level meter
  startAudioMeter();

  // UI updates
  recordBtn.textContent = "Stop Recording";
  recordBtn.classList.remove("start");
  recordBtn.classList.add("stop");
  timerEl.style.display = "inline";
  meterContainer.style.display = "block";

  // Timer
  timerInterval = setInterval(() => {
    timerEl.textContent = formatTime((Date.now() - recordingStartTime) / 1000);
  }, 1000);

  renderContent();
}

function stopRecording() {
  recording = false;

  if (recognition) {
    recognition.onend = null;
    recognition.stop();
    recognition = null;
  }

  stopAudioMeter();

  clearInterval(timerInterval);

  // Update note duration
  const note = data.notes.find((n) => n.id === currentNoteId);
  if (note) {
    note.duration = Math.round((Date.now() - recordingStartTime) / 1000);
    saveData(data);
  }

  // UI updates
  recordBtn.textContent = "Start Recording";
  recordBtn.classList.remove("stop");
  recordBtn.classList.add("start");
  timerEl.style.display = "none";
  meterContainer.style.display = "none";

  currentNoteId = null;
  renderCourses();
  renderContent();
}

// ══════════════════════════════════════════════════════════════════
//  AUDIO LEVEL METER
// ══════════════════════════════════════════════════════════════════

async function startAudioMeter() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(micStream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function tick() {
      if (!recording) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const level = sum / (bufferLength * 255);
      meterFill.style.width = `${Math.min(100, level * 400)}%`;
      levelAnimFrame = requestAnimationFrame(tick);
    }
    tick();
  } catch (err) {
    console.error("Audio meter error:", err);
  }
}

function stopAudioMeter() {
  if (levelAnimFrame) cancelAnimationFrame(levelAnimFrame);
  if (audioContext) audioContext.close().catch(() => {});
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  audioContext = null;
  analyser = null;
  micStream = null;
  meterFill.style.width = "0%";
}

// ══════════════════════════════════════════════════════════════════
//  EXPORT TO MARKDOWN
// ══════════════════════════════════════════════════════════════════

function exportNote(note) {
  const date = new Date(note.date).toISOString().split("T")[0];
  const lines = [
    `# ${note.title}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Date** | ${date} |`,
    `| **Course** | ${note.course} |`,
    `| **Duration** | ${formatTime(note.duration)} |`,
    "",
    "---",
    "",
    "## Transcript",
    "",
  ];

  if (note.chunks && note.chunks.length > 0) {
    note.chunks.forEach((c) => {
      lines.push(`\`[${formatTime(c.time)}]\` ${c.text}`, "");
    });
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
//  HELPERS
// ══════════════════════════════════════════════════════════════════

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

renderCourses();
renderContent();
