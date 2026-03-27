// ══════════════════════════════════════════════════════════════════
//  AI Note Taker v3
//
//  - IndexedDB storage (unlimited, not 5MB localStorage)
//  - Notes grouped by day (newest first, collapsible)
//  - Auto-summary titles from transcript content
//  - Instant transcription via Chrome Speech API
//  - PWA installable
//  - AI summary (window.ai or extractive fallback)
// ══════════════════════════════════════════════════════════════════

const esc = s => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(v => String(v).padStart(2,"0")).join(":"); };
const $ = id => document.getElementById(id);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

// ══════════════════════════════════════════════════════════════════
//  IndexedDB — unlimited storage
// ══════════════════════════════════════════════════════════════════

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ai-notes", 2);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("notes")) {
        const s = d.createObjectStore("notes", { keyPath: "id" });
        s.createIndex("by-course", "course");
        s.createIndex("by-date", "date");
      }
      if (!d.objectStoreNames.contains("courses")) {
        d.createObjectStore("courses", { keyPath: "name" });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

// ── DB helpers ──
async function dbGetAll(store) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    tx.objectStore(store).getAll().onsuccess = e => res(e.target.result);
    tx.onerror = e => rej(e.target.error);
  });
}
async function dbPut(store, val) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(val).onsuccess = () => res();
    tx.onerror = e => rej(e.target.error);
  });
}
async function dbDel(store, key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key).onsuccess = () => res();
    tx.onerror = e => rej(e.target.error);
  });
}

// ── Migrate from localStorage if exists ──
async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem("notes-v3");
    if (!raw) return;
    const old = JSON.parse(raw);
    if (old.courses) for (const c of old.courses) await dbPut("courses", { name: c });
    if (old.notes) for (const n of old.notes) await dbPut("notes", n);
    localStorage.removeItem("notes-v3");
    console.log("[DB] Migrated from localStorage to IndexedDB");
  } catch {}
}

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════

let courses = [], notes = [];
let course = null, viewNote = null, rec = false, noteId = null, startT = 0;
let lines = [], interim = "", query = "", wordCount = 0;
let collapsedDays = new Set(); // tracks which day groups are collapsed
let saveDebounce = null;

const ct = $("content"), recBtn = $("recBtn"), tmr = $("timer"), mtr = $("meter"), mtrF = $("meterFill"), wcEl = $("wordCount");

// ══════════════════════════════════════════════════════════════════
//  COURSES SIDEBAR
// ══════════════════════════════════════════════════════════════════

async function loadCourses() {
  courses = (await dbGetAll("courses")).map(c => c.name);
}

async function loadNotes() {
  notes = await dbGetAll("notes");
  notes.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderCourses() {
  const cnt = {};
  notes.forEach(n => cnt[n.course] = (cnt[n.course] || 0) + 1);

  let h = `<div class="ci ${course === null ? "on" : ""}" data-c="__all__">
    <span class="ci-icon">&#128210;</span> All Notes <span class="cc">${notes.length}</span></div>`;

  courses.forEach(c => {
    h += `<div class="ci ${course === c ? "on" : ""}" data-c="${esc(c)}">
      <span class="ci-icon">&#128218;</span> ${esc(c)} <span class="cc">${cnt[c] || 0}</span>
      <span class="ca"><span class="cx" data-act="del" data-n="${esc(c)}">&#10005;</span></span></div>`;
  });

  $("courses").innerHTML = h;
  $("courses").querySelectorAll(".ci").forEach(el => el.addEventListener("click", async e => {
    if (e.target.dataset.act === "del") {
      const name = e.target.dataset.n;
      if (!confirm(`Delete "${name}"?`)) return;
      await dbDel("courses", name);
      // Move notes to Uncategorized
      for (const n of notes) {
        if (n.course === name) { n.course = "Uncategorized"; await dbPut("notes", n); }
      }
      if (!courses.includes("Uncategorized") && notes.some(n => n.course === "Uncategorized")) {
        await dbPut("courses", { name: "Uncategorized" });
      }
      if (course === name) course = null;
      await loadCourses(); await loadNotes(); renderCourses(); renderContent();
      return;
    }
    course = el.dataset.c === "__all__" ? null : el.dataset.c;
    viewNote = null; renderCourses(); renderContent();
  }));
}

// Add course
$("addBtn").onclick = () => { $("addBtn").style.display = "none"; $("addForm").classList.add("v"); $("addInput").value = ""; setTimeout(() => $("addInput").focus(), 50); };
async function addCourse() {
  const name = $("addInput").value.trim();
  if (name && !courses.includes(name)) {
    await dbPut("courses", { name });
    course = name;
    await loadCourses();
    renderCourses(); renderContent();
  }
  $("addForm").classList.remove("v"); $("addBtn").style.display = "block";
}
$("addOk").onclick = addCourse;
$("addInput").onkeydown = e => { if (e.key === "Enter") addCourse(); if (e.key === "Escape") { $("addForm").classList.remove("v"); $("addBtn").style.display = "block"; } };

// Search
$("search").oninput = e => { query = e.target.value.trim().toLowerCase(); if (!rec) renderContent(); };

// ══════════════════════════════════════════════════════════════════
//  CONTENT — notes grouped by day
// ══════════════════════════════════════════════════════════════════

function renderContent() {
  if (rec) { renderLive(); return; }
  if (viewNote) { renderDetail(); return; }
  renderList();
}

function renderList() {
  let filtered = notes.filter(n => !course || n.course === course);
  if (query) filtered = filtered.filter(n =>
    (n.transcript || "").toLowerCase().includes(query) ||
    (n.title || "").toLowerCase().includes(query)
  );

  if (!filtered.length) {
    ct.innerHTML = `<div class="empty"><h2>${esc(course || "All Notes")}</h2>
      <p>${query ? "No results." : "Add a course and start recording!"}</p></div>`;
    return;
  }

  // Group by day
  const days = {};
  filtered.forEach(n => {
    const day = new Date(n.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (!days[day]) days[day] = [];
    days[day].push(n);
  });

  let h = "";
  Object.entries(days).forEach(([day, dayNotes]) => {
    const collapsed = collapsedDays.has(day);
    const totalWords = dayNotes.reduce((a, n) => a + (n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0), 0);
    const totalDur = dayNotes.reduce((a, n) => a + (n.duration || 0), 0);

    h += `<div class="day-group">
      <div class="day-hdr" data-day="${esc(day)}">
        <span class="day-arrow ${collapsed ? "" : "open"}">&#9654;</span>
        <span class="day-title">${esc(day)}</span>
        <span class="day-stats">${dayNotes.length} lecture${dayNotes.length > 1 ? "s" : ""} &middot; ${totalWords} words &middot; ${fmt(totalDur)}</span>
      </div>`;

    if (!collapsed) {
      dayNotes.forEach(n => {
        const wc = n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0;
        h += `<div class="cd" data-id="${esc(n.id)}">
          <div class="cd-t">
            <div class="cd-info">
              <h3>${esc(n.title)}</h3>
              <span class="cd-time">${new Date(n.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
            </div>
            <button class="db" data-id="${esc(n.id)}">&#10005;</button>
          </div>
          <div class="mt">
            <span class="mt-tag">${esc(n.course)}</span>
            <span>${fmt(n.duration)}</span>
            <span>${wc} words</span>
          </div>
          <div class="pv">${esc((n.transcript || "").slice(0, 120))}${(n.transcript || "").length > 120 ? "..." : ""}</div>
        </div>`;
      });
    }
    h += `</div>`;
  });

  ct.innerHTML = h;

  // Day header collapse/expand
  ct.querySelectorAll(".day-hdr").forEach(el => el.addEventListener("click", () => {
    const day = el.dataset.day;
    if (collapsedDays.has(day)) collapsedDays.delete(day);
    else collapsedDays.add(day);
    renderList();
  }));

  // Note click
  ct.querySelectorAll(".cd").forEach(el => el.addEventListener("click", e => {
    if (e.target.classList.contains("db")) return;
    viewNote = notes.find(n => n.id === el.dataset.id);
    renderContent();
  }));

  // Delete
  ct.querySelectorAll(".db").forEach(el => el.addEventListener("click", async e => {
    e.stopPropagation();
    const n = notes.find(x => x.id === el.dataset.id);
    if (n && confirm(`Delete "${n.title}"?`)) {
      await dbDel("notes", n.id);
      await loadNotes();
      renderCourses(); renderContent();
    }
  }));
}

function renderDetail() {
  const n = viewNote;
  const wc = n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0;
  let th = "";
  if (n.chunks?.length) n.chunks.forEach(c => {
    th += `<span class="ts">[${fmt(c.time)}]</span> ${esc(c.text)}\n`;
  }); else th = esc(n.transcript) || "No transcript";

  const sumHtml = n.summary ? `<div class="sum"><h3>AI Summary</h3>${esc(n.summary)}</div>` : "";
  const time = new Date(n.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const day = new Date(n.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  ct.innerHTML = `<div class="dh">
    <div><h2>${esc(n.title)}</h2>
      <div class="stats"><span>${esc(day)} at ${time}</span><span>${fmt(n.duration)}</span><span>${wc} words</span><span class="mt-tag">${esc(n.course)}</span></div></div>
    <div class="bg"><button class="bt" id="back">&larr; Back</button><button class="bt pri" id="sumBtn">Summarize</button><button class="bt" id="exp">Export .md</button><button class="bt dng" id="del">Delete</button></div></div>
    <div class="tr">${th}</div>${sumHtml}`;

  $("back").onclick = () => { viewNote = null; renderContent(); };
  $("exp").onclick = () => exportMd(n);
  $("del").onclick = async () => { if (confirm("Delete?")) { await dbDel("notes", n.id); await loadNotes(); viewNote = null; renderCourses(); renderContent(); } };
  $("sumBtn").onclick = () => summarize(n);
}

// ══════════════════════════════════════════════════════════════════
//  LIVE TRANSCRIPT
// ══════════════════════════════════════════════════════════════════

function renderLive() {
  let h = "";
  lines.forEach(l => h += `<div class="ln"><span class="ts">[${fmt(l.time)}]</span> ${esc(l.text)}</div>`);
  if (interim) h += `<div class="ln it">${esc(interim)}</div>`;
  if (!h) h = `<div class="ln it">Listening... speak into your microphone.</div>`;
  ct.innerHTML = h;
  ct.scrollTop = ct.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════════════════════

let recognition = null, timerInt = null, audioCtx = null, analyser = null, micStream = null, raf = null;

recBtn.onclick = () => rec ? stopRec() : startRec();
document.onkeydown = e => { if (e.ctrlKey && e.key === "r") { e.preventDefault(); rec ? stopRec() : startRec(); } };

async function startRec() {
  if (!course) { alert("Select or add a course first."); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Use Chrome for speech recognition."); return; }

  const now = new Date();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  // Temporary title — will be replaced with auto-summary after recording
  const title = `Recording — ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;

  const noteObj = { id, course, title, date: now.toISOString(), transcript: "", chunks: [], duration: 0, summary: "" };
  await dbPut("notes", noteObj);
  notes.unshift(noteObj);

  noteId = id; lines = []; interim = ""; startT = Date.now(); rec = true; wordCount = 0;

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = e => {
    const elapsed = (Date.now() - startT) / 1000;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], text = r[0].transcript.trim(), conf = r[0].confidence || 0.8;
      if (r.isFinal && text) {
        lines.push({ text, time: elapsed, confidence: conf });
        interim = "";
        wordCount += text.split(/\s+/).length;
        wcEl.textContent = `${wordCount} words`;
        const n = notes.find(x => x.id === noteId);
        if (n) {
          n.transcript += (n.transcript ? " " : "") + text;
          n.chunks.push({ text, time: elapsed, confidence: conf });
          n.duration = Math.round(elapsed);
          debouncedSave(n);
        }
      } else { interim = text; }
    }
    renderLive();
  };

  recognition.onerror = e => { if (e.error === "not-allowed") { alert("Microphone denied."); stopRec(); } };
  recognition.onend = () => { if (rec) try { recognition.start(); } catch {} };
  recognition.start();

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    micStream = stream;
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    function tick() { if (!rec) return; analyser.getByteFrequencyData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]; mtrF.style.width = `${Math.min(100, (s / (buf.length * 255)) * 400)}%`; raf = requestAnimationFrame(tick); }
    tick();
  }).catch(() => {});

  recBtn.textContent = "Stop Recording"; recBtn.className = "rb on";
  tmr.style.display = "inline"; mtr.style.display = "block"; wcEl.style.display = "inline";
  timerInt = setInterval(() => tmr.textContent = fmt((Date.now() - startT) / 1000), 500);
  renderContent();
}

function debouncedSave(n) {
  if (saveDebounce) return;
  saveDebounce = setTimeout(async () => {
    saveDebounce = null;
    await dbPut("notes", n);
  }, 3000);
}

async function stopRec() {
  rec = false;
  if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
  if (raf) cancelAnimationFrame(raf);
  if (audioCtx) audioCtx.close().catch(() => {});
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  clearInterval(timerInt);
  if (saveDebounce) { clearTimeout(saveDebounce); saveDebounce = null; }
  mtrF.style.width = "0%";

  const n = notes.find(x => x.id === noteId);
  if (n) {
    n.duration = Math.round((Date.now() - startT) / 1000);
    // Auto-generate title from transcript
    n.title = generateTitle(n.transcript, n.date);
    await dbPut("notes", n);
  }

  recBtn.textContent = "Start Recording"; recBtn.className = "rb idle";
  tmr.style.display = "none"; mtr.style.display = "none"; wcEl.style.display = "none";
  noteId = null;
  await loadNotes();
  renderCourses(); renderContent();
}

// ══════════════════════════════════════════════════════════════════
//  AUTO TITLE — generates a short summary from transcript
// ══════════════════════════════════════════════════════════════════

function generateTitle(transcript, date) {
  if (!transcript || transcript.length < 20) {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " — Recording";
  }

  // Extract key phrases: take the first meaningful sentence
  const sentences = transcript.match(/[^.!?]+[.!?]*/g) || [transcript];
  const first = sentences[0].trim();

  // Find the most important words (frequency-based)
  const words = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);
  const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

  // Title = first 8 words of first sentence, or top keywords
  const titleWords = first.split(/\s+/).slice(0, 8).join(" ");
  let title = titleWords.length > 10 ? titleWords : topWords.join(", ");

  // Clean up and capitalize
  title = title.replace(/[.!?,;:]+$/, "").trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Max 50 chars
  if (title.length > 50) title = title.slice(0, 47) + "...";

  return title || "Recording";
}

// ══════════════════════════════════════════════════════════════════
//  AI SUMMARY
// ══════════════════════════════════════════════════════════════════

async function summarize(n) {
  if (!n.transcript) { alert("No transcript."); return; }
  const btn = $("sumBtn");
  btn.textContent = "Summarizing..."; btn.disabled = true;

  try {
    if (window.ai?.createTextSession) {
      const s = await window.ai.createTextSession();
      n.summary = await s.prompt(`Summarize this lecture:\n\n1. Main Topic (1 sentence)\n2. Key Points (3-5 bullets)\n3. Important Terms\n\n${n.transcript.slice(0, 4000)}`);
      s.destroy();
    } else {
      n.summary = extractiveSummary(n.transcript);
    }
  } catch { n.summary = extractiveSummary(n.transcript); }

  await dbPut("notes", n);
  renderDetail();
}

function extractiveSummary(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const words = text.toLowerCase().split(/\s+/);
  const freq = {};
  words.forEach(w => { if (w.length > 3) freq[w] = (freq[w] || 0) + 1; });
  const scored = sentences.map(s => {
    const sw = s.toLowerCase().split(/\s+/);
    return { s: s.trim(), score: sw.reduce((a, w) => a + (freq[w] || 0), 0) / sw.length };
  }).sort((a, b) => b.score - a.score);
  const topW = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
  return `Key Points:\n${scored.slice(0, 5).map(x => `- ${x.s}`).join("\n")}\n\nKey Terms: ${topW.join(", ")}`;
}

// ══════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════

function exportMd(n) {
  const d = new Date(n.date).toISOString().split("T")[0];
  const wc = n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0;
  const l = [`# ${n.title}`, "", `**Course:** ${n.course}`, `**Duration:** ${fmt(n.duration)}`, `**Words:** ${wc}`, "", "---", "", "## Transcript", ""];
  if (n.chunks?.length) n.chunks.forEach(c => l.push(`\`[${fmt(c.time)}]\` ${c.text}`, ""));
  else l.push(n.transcript || "_No transcript_");
  if (n.summary) l.push("", "---", "", "## Summary", "", n.summary);
  const blob = new Blob([l.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `${d}-${n.course.replace(/[^a-zA-Z0-9]+/g, "-")}.md`;
  a.click(); URL.revokeObjectURL(a.href);
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

(async () => {
  await openDB();
  await migrateFromLocalStorage();
  await loadCourses();
  await loadNotes();
  renderCourses();
  renderContent();
})();
