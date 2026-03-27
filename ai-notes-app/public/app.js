// ── Helpers ──
const esc = (s) => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return [h, m, sec].map(v => String(v).padStart(2, "0")).join(":"); };

// ── Data ──
const load = () => { try { return JSON.parse(localStorage.getItem("notes-v2")) || { courses: [], notes: [] }; } catch { return { courses: [], notes: [] }; } };
const save = (d) => { try { localStorage.setItem("notes-v2", JSON.stringify(d)); } catch { alert("Storage full — export and delete old lectures."); } };
let D = load();

// ── State ──
let course = null, note = null, rec = false, noteId = null, start = 0, lines = [], interim = "", query = "";

// ── DOM ──
const $ = (id) => document.getElementById(id);
const coursesEl = $("courses"), content = $("content"), recBtn = $("recBtn"), timerEl = $("timer"), meter = $("meter"), meterFill = $("meterFill");

// ── Courses ──
function renderCourses() {
  const cnt = {};
  D.notes.forEach(n => cnt[n.course] = (cnt[n.course] || 0) + 1);
  let h = `<div class="course-item ${course === null ? "active" : ""}" data-c="__all__">All Notes <span class="course-count">${D.notes.length}</span></div>`;
  D.courses.forEach(c => {
    h += `<div class="course-item ${course === c ? "active" : ""}" data-c="${esc(c)}">${esc(c)} <span class="course-count">${cnt[c] || 0}</span>
      <span class="course-actions"><span class="course-action" data-act="del" data-n="${esc(c)}">&#10005;</span></span></div>`;
  });
  coursesEl.innerHTML = h;
  coursesEl.querySelectorAll(".course-item").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.dataset.act === "del") {
        const n = e.target.dataset.n;
        if (confirm(`Delete "${n}"?`)) { D.courses = D.courses.filter(c => c !== n); D.notes.forEach(x => { if (x.course === n) x.course = "Other"; }); if (course === n) course = null; save(D); renderCourses(); renderContent(); }
        return;
      }
      course = el.dataset.c === "__all__" ? null : el.dataset.c;
      note = null; renderCourses(); renderContent();
    });
  });
}

// Add course
$("addBtn").onclick = () => { $("addBtn").style.display = "none"; $("addForm").classList.add("visible"); $("addInput").value = ""; setTimeout(() => $("addInput").focus(), 50); };
function addCourse() { const n = $("addInput").value.trim(); if (n && !D.courses.includes(n)) { D.courses.push(n); save(D); course = n; renderCourses(); renderContent(); } $("addForm").classList.remove("visible"); $("addBtn").style.display = "block"; }
$("addOk").onclick = addCourse;
$("addInput").onkeydown = (e) => { if (e.key === "Enter") addCourse(); if (e.key === "Escape") { $("addForm").classList.remove("visible"); $("addBtn").style.display = "block"; } };

// Search
$("search").oninput = (e) => { query = e.target.value.trim().toLowerCase(); if (!rec) renderContent(); };

// ── Content ──
function renderContent() {
  if (rec) { renderLive(); return; }
  if (note) { renderDetail(); return; }
  renderList();
}

function renderList() {
  let notes = D.notes.filter(n => !course || n.course === course);
  if (query) notes = notes.filter(n => n.transcript.toLowerCase().includes(query) || n.title.toLowerCase().includes(query));
  notes.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!notes.length) { content.innerHTML = `<div class="empty"><h2>${esc(course || "All Notes")}</h2><p>${query ? "No results." : "Add a course and start recording!"}</p></div>`; return; }
  let h = "";
  notes.forEach(n => {
    const prev = n.transcript.slice(0, 150) + (n.transcript.length > 150 ? "..." : "");
    h += `<div class="card" data-id="${esc(n.id)}"><div class="card-top"><h3>${esc(n.title)}</h3><button class="del-btn" data-id="${esc(n.id)}">&#10005;</button></div>
      <div class="meta"><span>${fmt(n.duration)}</span><span>${esc(n.course)}</span></div>
      <div class="preview">${esc(prev) || "No transcript"}</div></div>`;
  });
  content.innerHTML = h;
  content.querySelectorAll(".card").forEach(el => el.addEventListener("click", e => { if (e.target.classList.contains("del-btn")) return; note = D.notes.find(n => n.id === el.dataset.id); renderContent(); }));
  content.querySelectorAll(".del-btn").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); const n = D.notes.find(x => x.id === el.dataset.id); if (n && confirm(`Delete "${n.title}"?`)) { D.notes = D.notes.filter(x => x.id !== n.id); save(D); renderCourses(); renderContent(); } }));
}

function renderDetail() {
  let th = "";
  if (note.chunks?.length) note.chunks.forEach(c => th += `<span class="ts">[${fmt(c.time)}]</span> ${esc(c.text)}\n`);
  else th = esc(note.transcript) || "No transcript";
  content.innerHTML = `<div class="detail-hdr"><div><h2>${esc(note.title)}</h2><div class="meta" style="margin-top:4px"><span>${fmt(note.duration)}</span><span>${esc(note.course)}</span></div></div>
    <div class="btn-grp"><button class="btn" id="back">&larr; Back</button><button class="btn" id="exp">Export .md</button><button class="btn danger" id="del">Delete</button></div></div>
    <div class="transcript">${th}</div>`;
  $("back").onclick = () => { note = null; renderContent(); };
  $("exp").onclick = () => exportMd(note);
  $("del").onclick = () => { if (confirm("Delete?")) { D.notes = D.notes.filter(n => n.id !== note.id); save(D); note = null; renderCourses(); renderContent(); } };
}

function renderLive() {
  let h = "";
  lines.forEach(l => h += `<div class="line"><span class="ts">[${fmt(l.time)}]</span> ${esc(l.text)}</div>`);
  if (interim) h += `<div class="line interim">${esc(interim)}</div>`;
  if (!h) h = `<div class="line interim">Listening... speak into your microphone.</div>`;
  content.innerHTML = h;
  content.scrollTop = content.scrollHeight;
}

// ── Recording ──
let recognition = null, timerInt = null, audioCtx = null, analyserNode = null, micStream = null, animFrame = null;

recBtn.onclick = () => { rec ? stopRec() : startRec(); };
document.onkeydown = (e) => { if (e.ctrlKey && e.key === "r") { e.preventDefault(); rec ? stopRec() : startRec(); } };

function startRec() {
  if (!course) { alert("Select or add a course first."); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Speech recognition not supported. Use Chrome."); return; }

  // Title = date + time
  const now = new Date();
  const title = `${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  D.notes.push({ id, course, title, date: now.toISOString(), transcript: "", chunks: [], duration: 0 });
  save(D);
  noteId = id; lines = []; interim = ""; start = Date.now(); rec = true;

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (e) => {
    const elapsed = (Date.now() - start) / 1000;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], text = r[0].transcript.trim();
      if (r.isFinal && text) {
        lines.push({ text, time: elapsed });
        interim = "";
        const n = D.notes.find(x => x.id === noteId);
        if (n) { n.transcript += (n.transcript ? " " : "") + text; n.chunks.push({ text, time: elapsed }); n.duration = Math.round(elapsed); save(D); }
      } else { interim = text; }
    }
    renderLive();
  };

  recognition.onerror = (e) => {
    if (e.error === "not-allowed") { alert("Microphone denied."); stopRec(); return; }
    // no-speech, aborted, network — all normal in Chrome, just restart
  };

  recognition.onend = () => { if (rec) try { recognition.start(); } catch {} };
  recognition.start();

  // Mic level meter
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    micStream = stream;
    audioCtx = new AudioContext();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    audioCtx.createMediaStreamSource(stream).connect(analyserNode);
    const buf = new Uint8Array(analyserNode.frequencyBinCount);
    function tick() { if (!rec) return; analyserNode.getByteFrequencyData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]; meterFill.style.width = `${Math.min(100, (s / (buf.length * 255)) * 400)}%`; animFrame = requestAnimationFrame(tick); }
    tick();
  }).catch(() => {});

  recBtn.textContent = "Stop Recording"; recBtn.className = "rec-btn active";
  timerEl.style.display = "inline"; meter.style.display = "block";
  timerInt = setInterval(() => timerEl.textContent = fmt((Date.now() - start) / 1000), 1000);
  renderContent();
}

function stopRec() {
  rec = false;
  if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioCtx) audioCtx.close().catch(() => {});
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  clearInterval(timerInt);
  meterFill.style.width = "0%";

  const n = D.notes.find(x => x.id === noteId);
  if (n) { n.duration = Math.round((Date.now() - start) / 1000); save(D); }

  recBtn.textContent = "Start Recording"; recBtn.className = "rec-btn idle";
  timerEl.style.display = "none"; meter.style.display = "none";
  noteId = null; renderCourses(); renderContent();
}

// ── Export ──
function exportMd(n) {
  const d = new Date(n.date).toISOString().split("T")[0];
  const l = [`# ${n.title}`, "", `**Course:** ${n.course}`, `**Duration:** ${fmt(n.duration)}`, "", "---", "", "## Transcript", ""];
  if (n.chunks?.length) n.chunks.forEach(c => l.push(`\`[${fmt(c.time)}]\` ${c.text}`, ""));
  else l.push(n.transcript || "_No transcript_");
  const blob = new Blob([l.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `${d}-${n.course.replace(/[^a-zA-Z0-9]+/g, "-")}.md`;
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Init ──
renderCourses(); renderContent();
