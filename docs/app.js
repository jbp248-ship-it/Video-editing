// ══════════════════════════════════════════════════════════════════
//  Justin's Amazing Note Taker v5 — Cloud Edition
//  Firebase Auth (Google Sign-In) + Firestore (cloud storage)
//  Access from any computer, any browser
//  100% free (Firebase free tier: 1GB, 50k reads/day)
// ══════════════════════════════════════════════════════════════════

const esc = s => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(v => String(v).padStart(2,"0")).join(":"); };
const $ = id => document.getElementById(id);

// ══════════════════════════════════════════════════════════════════
//  FIREBASE CONFIG
//  TODO: Replace with your own Firebase project credentials
//  1. Go to https://console.firebase.google.com
//  2. Create a new project "justins-notes"
//  3. Enable Authentication > Google sign-in
//  4. Enable Firestore Database
//  5. Copy config here
// ══════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyD1R5MmU5-udAsfyOUzTZj-GG2lRH5kYfs",
  authDomain: "justins-notes.firebaseapp.com",
  projectId: "justins-notes",
  storageBucket: "justins-notes.firebasestorage.app",
  messagingSenderId: "252271897988",
  appId: "1:252271897988:web:6bf27e48f23c0f0e57c1d1"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence (works without internet)
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

let userId = null;
let userRef = null; // Firestore ref for this user's data

// ══════════════════════════════════════════════════════════════════
//  AUTH — Google Sign-In
// ══════════════════════════════════════════════════════════════════

$("googleLogin").onclick = async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    alert("Sign-in failed: " + err.message);
  }
};

auth.onAuthStateChanged(user => {
  if (user) {
    userId = user.uid;
    userRef = db.collection("users").doc(userId);
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("userAvatar").src = user.photoURL || "";
    $("userAvatar").title = `Signed in as ${user.displayName}\nClick to sign out`;
    $("userAvatar").onclick = () => { if (confirm("Sign out?")) auth.signOut(); };
    init();
  } else {
    userId = null;
    userRef = null;
    $("loginScreen").classList.remove("hidden");
    $("app").classList.add("hidden");
  }
});

// ══════════════════════════════════════════════════════════════════
//  FIRESTORE — Cloud Storage (replaces IndexedDB)
// ══════════════════════════════════════════════════════════════════

// Color palette for courses — soft warm tones
const COURSE_COLORS = [
  { bg: "#5C3D2E", accent: "#D97757", name: "Terracotta" },
  { bg: "#2E4A5C", accent: "#5BA4CF", name: "Ocean" },
  { bg: "#3D5C2E", accent: "#7BC47A", name: "Sage" },
  { bg: "#5C4B2E", accent: "#E8B931", name: "Amber" },
  { bg: "#4A2E5C", accent: "#B57ADB", name: "Lavender" },
  { bg: "#5C2E3D", accent: "#DB7A99", name: "Rose" },
  { bg: "#2E5C5C", accent: "#5CCFCF", name: "Teal" },
  { bg: "#5C5C2E", accent: "#CFCF5C", name: "Olive" },
];

function getColorForCourse(index) {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}

async function getCourses() {
  const snap = await userRef.collection("courses").get();
  return snap.docs.map(d => ({ name: d.id, ...(d.data() || {}) })).sort((a,b) => a.name.localeCompare(b.name));
}

async function addCourseDB(name, colorIdx) {
  await userRef.collection("courses").doc(name).set({ created: Date.now(), colorIdx: colorIdx || 0 });
}

async function renameCourseDB(oldName, newName) {
  // Get old course data
  const oldDoc = await userRef.collection("courses").doc(oldName).get();
  const data = oldDoc.exists ? oldDoc.data() : { created: Date.now(), colorIdx: 0 };
  // Create new, delete old
  await userRef.collection("courses").doc(newName).set(data);
  await userRef.collection("courses").doc(oldName).delete();
  // Update all notes in this course
  for (const n of notes) {
    if (n.course === oldName) { n.course = newName; await putNote(n); }
  }
}

async function delCourseDB(name) {
  await userRef.collection("courses").doc(name).delete();
}

async function getNotes() {
  const snap = await userRef.collection("notes").orderBy("date", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function putNote(note) {
  const { id, ...data } = note;
  await userRef.collection("notes").doc(id).set(data);
}

async function delNote(id) {
  await userRef.collection("notes").doc(id).delete();
}

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════

let courses = [], notes = [];
let view = "home", activeCourse = null, activeNote = null;
let rec = false, noteId = null, startT = 0, lines = [], interim = "", wordCount = 0, query = "";
let collapsedDays = new Set(), selectedDays = new Set(), selectMode = false;
let saveDebounce = null;
const ct = $("content"), recBtn = $("recBtn"), tmr = $("timer"), mtr = $("meter"), mtrF = $("meterFill"), wcEl = $("wordCount");

async function reload() {
  const courseObjs = await getCourses();
  courses = courseObjs; // now array of {name, colorIdx, created}
  notes = await getNotes();
}
function courseNames() { return courses.map(c => c.name); }
function courseColor(name) {
  const c = courses.find(x => x.name === name);
  const idx = c?.colorIdx || courses.indexOf(c) || 0;
  return getColorForCourse(idx);
}

// ══════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════

function navigate(v, data) {
  if (v === "home") { view = "home"; activeCourse = null; activeNote = null; }
  else if (v === "course") { view = "course"; activeCourse = data; activeNote = null; }
  else if (v === "note") { view = "note"; activeNote = data; }
  else if (v === "live") { view = "live"; }
  renderBread(); render();
}

function renderBread() {
  const b = $("bread"); if (!b) return;
  if (view === "home") { b.innerHTML = ""; return; }

  // Back button
  let backTarget = "home";
  if (view === "note" || view === "live") backTarget = "course";

  let h = `<button class="back-btn" data-back="${backTarget}">&larr; Back</button>`;
  h += `<a data-nav="home">My Courses</a>`;
  if (view !== "home") h += `<span>/</span><a data-nav="course">${esc(activeCourse)}</a>`;
  if (view === "note") h += `<span>/</span><span>${esc(activeNote?.title || "")}</span>`;
  if (view === "live") h += `<span>/</span><span>Recording...</span>`;
  b.innerHTML = h;

  b.querySelector(".back-btn")?.addEventListener("click", () => {
    if (backTarget === "course") navigate("course", activeCourse);
    else navigate("home");
  });
  b.querySelectorAll("a").forEach(a => a.onclick = () => {
    if (a.dataset.nav === "home") navigate("home");
    else if (a.dataset.nav === "course") navigate("course", activeCourse);
  });
}

function render() {
  if (view === "live") renderLive();
  else if (view === "note") renderDetail();
  else if (view === "course") renderCourseNotes();
  else renderHome();
}

// ══════════════════════════════════════════════════════════════════
//  HOME — Course Grid
// ══════════════════════════════════════════════════════════════════

function renderHome() {
  const cnt = {}; notes.forEach(n => cnt[n.course] = (cnt[n.course] || 0) + 1);
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

  if (query) {
    const m = notes.filter(n => (n.transcript || "").toLowerCase().includes(query) || (n.title || "").toLowerCase().includes(query));
    if (m.length) { renderSearchResults(m); return; }
  }

  let h = `<div class="greeting"><h2>${greet}, <span>Justin</span></h2><p>What are we learning today?</p></div>`;
  h += `<div class="section-title">My Courses</div><div class="grid">`;

  courses.forEach((c, i) => {
    const count = cnt[c.name] || 0;
    const tw = notes.filter(n => n.course === c.name).reduce((a, n) => a + (n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0), 0);
    const color = getColorForCourse(c.colorIdx ?? i);
    h += `<div class="folder" data-c="${esc(c.name)}" style="background:${color.bg};border-color:${color.bg}">
      <div class="folder-accent" style="background:${color.accent}"></div>
      <div class="folder-actions">
        <button class="folder-action" data-rename="${esc(c.name)}" title="Rename">&#9998;</button>
        <button class="folder-action folder-del-btn" data-del="${esc(c.name)}" title="Delete">&#10005;</button>
      </div>
      <div class="folder-icon" style="color:${color.accent}">&#128218;</div>
      <h3>${esc(c.name)}</h3>
      <p>${count} lecture${count !== 1 ? "s" : ""} &middot; ${tw.toLocaleString()} words</p></div>`;
  });

  h += `<div class="add-folder" id="addFolderBtn"><span>+</span><p>Add Course</p></div>`;
  h += `<div class="add-folder-form" id="addFolderForm"><input id="addInput" placeholder="Course name (e.g. CS101)" /><div class="btns"><button class="cancel" id="addCancel">Cancel</button><button class="ok" id="addOk">Create</button></div></div></div>`;

  if (!courseNames().length && !query) {
    h = `<div class="greeting"><h2>${greet}, <span>Justin</span></h2><p>Create your first course to get started.</p></div>
      <div class="grid"><div class="add-folder" id="addFolderBtn"><span>+</span><p>Add Course</p></div>
      <div class="add-folder-form" id="addFolderForm"><input id="addInput" placeholder="Course name" /><div class="btns"><button class="cancel" id="addCancel">Cancel</button><button class="ok" id="addOk">Create</button></div></div></div>`;
  }

  ct.innerHTML = h;
  ct.querySelectorAll(".folder").forEach(el => el.onclick = e => {
    if (e.target.classList.contains("folder-action") || e.target.classList.contains("folder-del-btn")) return;
    navigate("course", el.dataset.c);
  });
  ct.querySelectorAll(".folder-del-btn").forEach(el => el.onclick = async e => {
    e.stopPropagation(); const name = el.dataset.del;
    if (!confirm(`Delete "${name}" and all its lectures?`)) return;
    for (const n of notes.filter(x => x.course === name)) await delNote(n.id);
    await delCourseDB(name); await reload(); render();
  });
  // Rename
  ct.querySelectorAll("[data-rename]").forEach(el => el.onclick = async e => {
    e.stopPropagation(); const oldName = el.dataset.rename;
    const newName = prompt("Rename course:", oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) {
      await renameCourseDB(oldName, newName.trim());
      if (activeCourse === oldName) activeCourse = newName.trim();
      await reload(); render();
    }
  });

  const addBtn = $("addFolderBtn"), addForm = $("addFolderForm");
  if (addBtn) addBtn.onclick = () => { addBtn.style.display = "none"; addForm.classList.add("v"); setTimeout(() => $("addInput").focus(), 50); };
  if ($("addCancel")) $("addCancel").onclick = () => { addForm.classList.remove("v"); addBtn.style.display = "flex"; };
  if ($("addOk")) $("addOk").onclick = async () => {
    const name = $("addInput").value.trim();
    if (name && !courseNames().includes(name)) { await addCourseDB(name, courses.length % COURSE_COLORS.length); await reload(); navigate("course", name); }
    else { addForm.classList.remove("v"); addBtn.style.display = "flex"; }
  };
  if ($("addInput")) $("addInput").onkeydown = e => { if (e.key === "Enter") $("addOk").click(); if (e.key === "Escape") { addForm.classList.remove("v"); addBtn.style.display = "flex"; } };
}

function renderSearchResults(m) {
  let h = `<div class="section-title">Search Results — "${esc(query)}"</div>`;
  m.forEach(n => {
    h += `<div class="note" data-id="${esc(n.id)}"><div class="note-top"><div class="note-info"><h3>${esc(n.title)}</h3></div></div>
      <div class="note-meta"><span class="tag">${esc(n.course)}</span><span>${fmt(n.duration)}</span></div>
      <div class="note-pv">${esc((n.transcript || "").slice(0, 120))}</div></div>`;
  });
  ct.innerHTML = h;
  ct.querySelectorAll(".note").forEach(el => el.onclick = () => {
    activeNote = notes.find(n => n.id === el.dataset.id);
    if (activeNote) { activeCourse = activeNote.course; view = "note"; renderBread(); render(); }
  });
}

// ══════════════════════════════════════════════════════════════════
//  COURSE VIEW — Day Groups + Study Mode
// ══════════════════════════════════════════════════════════════════

function renderCourseNotes() {
  let cn = notes.filter(n => n.course === activeCourse);
  if (query) cn = cn.filter(n => (n.transcript || "").toLowerCase().includes(query) || (n.title || "").toLowerCase().includes(query));

  if (!cn.length) { ct.innerHTML = `<div class="empty"><h2>${esc(activeCourse)}</h2><p>No lectures yet. Click Start Recording.</p></div>`; return; }

  const days = {};
  cn.forEach(n => { const d = new Date(n.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); if (!days[d]) days[d] = []; days[d].push(n); });

  let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div class="section-title" style="margin:0">${esc(activeCourse)}</div><div style="display:flex;gap:8px;align-items:center">`;
  if (selectedDays.size > 0) {
    h += `<span style="font-size:12px;color:#D97757">${selectedDays.size} day${selectedDays.size > 1 ? "s" : ""} selected</span>`;
    h += `<button class="btn btn-pri" id="studyBtn">Study Selected</button><button class="btn" id="clearSel">Clear</button>`;
  }
  h += `<button class="btn" id="selToggle">${selectMode ? "Done" : "Select Days"}</button></div></div>`;

  Object.entries(days).forEach(([day, dn]) => {
    const col = collapsedDays.has(day), sel = selectedDays.has(day);
    const tw = dn.reduce((a, n) => a + (n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0), 0);
    h += `<div class="day-group ${sel ? "day-selected" : ""}"><div class="day-hdr" data-day="${esc(day)}">
      ${selectMode ? `<input type="checkbox" class="day-check" data-day="${esc(day)}" ${sel ? "checked" : ""} />` : `<span class="day-arrow ${col ? "" : "open"}">&#9654;</span>`}
      <span class="day-title">${esc(day)}</span><span class="day-stats">${dn.length} &middot; ${tw.toLocaleString()} words</span></div>`;
    if (!col && !selectMode) dn.forEach(n => {
      const time = new Date(n.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      h += `<div class="note" data-id="${esc(n.id)}"><div class="note-top"><div class="note-info"><h3>${esc(n.title)}</h3><span class="note-time">${time}</span></div>
        <button class="note-del" data-id="${esc(n.id)}">&#10005;</button></div>
        <div class="note-pv">${esc((n.transcript || "").slice(0, 120))}</div></div>`;
    });
    h += `</div>`;
  });

  ct.innerHTML = h;
  if ($("selToggle")) $("selToggle").onclick = () => { selectMode = !selectMode; if (!selectMode) selectedDays.clear(); renderCourseNotes(); };
  if ($("clearSel")) $("clearSel").onclick = () => { selectedDays.clear(); renderCourseNotes(); };
  if ($("studyBtn")) $("studyBtn").onclick = () => openStudyMode(cn);
  ct.querySelectorAll(".day-check").forEach(el => el.onchange = () => { el.checked ? selectedDays.add(el.dataset.day) : selectedDays.delete(el.dataset.day); renderCourseNotes(); });
  if (!selectMode) ct.querySelectorAll(".day-hdr").forEach(el => el.onclick = e => { if (e.target.classList.contains("day-check")) return; const d = el.dataset.day; collapsedDays.has(d) ? collapsedDays.delete(d) : collapsedDays.add(d); renderCourseNotes(); });
  ct.querySelectorAll(".note").forEach(el => el.onclick = e => { if (e.target.classList.contains("note-del")) return; activeNote = notes.find(n => n.id === el.dataset.id); if (activeNote) { view = "note"; renderBread(); render(); } });
  ct.querySelectorAll(".note-del").forEach(el => el.onclick = async e => { e.stopPropagation(); const n = notes.find(x => x.id === el.dataset.id); if (n && confirm(`Delete?`)) { await delNote(n.id); await reload(); render(); } });
}

function openStudyMode(cn) {
  const sel = cn.filter(n => { const d = new Date(n.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); return selectedDays.has(d); }).sort((a, b) => new Date(a.date) - new Date(b.date));
  let allText = "";
  let h = `<div class="detail-hdr"><h2>Study Mode — ${selectedDays.size} Day${selectedDays.size > 1 ? "s" : ""}</h2>
    <div class="detail-actions"><button class="btn" id="backStudy">&larr; Back</button><button class="btn btn-pri" id="copyStudy">Copy All Text</button><button class="btn" id="exportStudy">Export .md</button></div></div>`;
  sel.forEach(n => {
    const day = new Date(n.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    allText += `\n## ${n.title} (${day})\n\n`;
    h += `<div style="margin-bottom:16px"><div style="font-size:13px;font-weight:600;color:#D97757;margin-bottom:8px">${esc(n.title)} — ${day}</div><div class="transcript-box" style="max-height:none">`;
    if (n.chunks?.length) n.chunks.forEach(c => { h += `<span class="ts">[${fmt(c.time)}]</span> ${esc(c.text)}\n`; allText += `[${fmt(c.time)}] ${c.text}\n`; });
    else { h += esc(n.transcript) || ""; allText += n.transcript || ""; }
    h += `</div></div>`;
  });
  ct.innerHTML = h;
  $("backStudy").onclick = () => renderCourseNotes();
  $("copyStudy").onclick = () => { navigator.clipboard.writeText(allText.trim()).then(() => { $("copyStudy").textContent = "Copied!"; setTimeout(() => $("copyStudy").textContent = "Copy All Text", 2000); }); };
  $("exportStudy").onclick = () => { const b = new Blob([`# Study Notes\n${allText}`], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `study-${activeCourse}.md`; a.click(); };
}

// ══════════════════════════════════════════════════════════════════
//  NOTE DETAIL
// ══════════════════════════════════════════════════════════════════

function renderDetail() {
  const n = activeNote; if (!n) return;
  const wc = n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0;

  // Build readable transcript
  let th = "";
  if (n.chunks?.length) {
    n.chunks.forEach(c => {
      th += `<div style="margin-bottom:8px"><span class="ts">[${fmt(c.time)}]</span> ${esc(c.text)}</div>`;
    });
  } else if (n.transcript) {
    th = `<div style="line-height:1.9">${esc(n.transcript)}</div>`;
  } else {
    th = `<div style="color:#8B7E75;font-style:italic">No transcript recorded.</div>`;
  }

  const sumH = n.summary ? `<div class="summary-box"><h3>AI Summary</h3>${esc(n.summary)}</div>` : "";
  const day = new Date(n.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = new Date(n.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  ct.innerHTML = `<div class="detail-hdr"><h2>${esc(n.title)}</h2>
    <div class="detail-meta"><span>${esc(day)} at ${time}</span><span>${fmt(n.duration)}</span><span>${wc.toLocaleString()} words</span><span class="tag">${esc(n.course)}</span></div>
    <div class="detail-actions">
      <button class="btn btn-pri" id="copyAll">Copy Transcript</button>
      <button class="btn" id="sumBtn">Summarize</button>
      <button class="btn" id="exp">Export .md</button>
      <button class="btn btn-dng" id="del">Delete</button>
    </div></div>
    <div class="transcript-box">${th}</div>${sumH}`;

  $("copyAll").onclick = () => {
    const text = n.chunks?.length
      ? n.chunks.map(c => `[${fmt(c.time)}] ${c.text}`).join("\n")
      : n.transcript || "";
    navigator.clipboard.writeText(text).then(() => {
      $("copyAll").textContent = "Copied!";
      setTimeout(() => $("copyAll").textContent = "Copy Transcript", 2000);
    });
  };
  $("exp").onclick = () => exportMd(n);
  $("del").onclick = async () => { if (confirm("Delete?")) { await delNote(n.id); await reload(); navigate("course", activeCourse); } };
  $("sumBtn").onclick = () => summarize(n);
}

// Track how many lines are already rendered to avoid full re-renders
let renderedLineCount = 0;

function renderLive() {
  // First render — set up the container
  if (renderedLineCount === 0 && lines.length === 0) {
    ct.innerHTML = `<div id="liveContainer"><div class="live-line live-interim" id="interimLine">Listening... speak into your microphone.</div></div>`;
    return;
  }

  let container = $("liveContainer");
  if (!container) {
    ct.innerHTML = `<div id="liveContainer"></div>`;
    container = $("liveContainer");
    renderedLineCount = 0;
  }

  // Append only NEW sealed lines (typewriter effect — old lines stay)
  while (renderedLineCount < lines.length) {
    const l = lines[renderedLineCount];
    const div = document.createElement("div");
    div.className = "live-line";
    div.innerHTML = `<span class="ts">[${fmt(l.time)}]</span> ${esc(l.text)}`;
    // Remove interim line if it exists
    const old = $("interimLine");
    if (old) old.remove();
    container.appendChild(div);
    renderedLineCount++;
  }

  // Update or create interim line (the "typing" indicator)
  let interimEl = $("interimLine");
  if (interim) {
    if (!interimEl) {
      interimEl = document.createElement("div");
      interimEl.className = "live-line live-interim";
      interimEl.id = "interimLine";
      container.appendChild(interimEl);
    }
    interimEl.textContent = interim;
  } else if (interimEl) {
    interimEl.textContent = "Listening...";
  }

  ct.scrollTop = ct.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════════════════════

let recognition = null, timerInt = null, audioCtx = null, analyser = null, micStream = null, raf = null;
recBtn.onclick = () => rec ? stopRec() : startRec();
document.onkeydown = e => { if (e.ctrlKey && e.key === "r") { e.preventDefault(); rec ? stopRec() : startRec(); } };

async function startRec() {
  if (!activeCourse) { alert("Open a course first."); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Use Chrome."); return; }

  const now = new Date();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const noteObj = { id, course: activeCourse, title: "Recording...", date: now.toISOString(), transcript: "", chunks: [], duration: 0, summary: "" };
  await putNote(noteObj);
  notes.unshift(noteObj);
  noteId = id; lines = []; interim = ""; startT = Date.now(); rec = true; wordCount = 0; renderedLineCount = 0;

  recognition = new SR(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";
  recognition.onresult = e => {
    const elapsed = (Date.now() - startT) / 1000;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], text = r[0].transcript.trim(), conf = r[0].confidence || .8;
      if (r.isFinal && text) {
        lines.push({ text, time: elapsed }); interim = "";
        wordCount += text.split(/\s+/).length; wcEl.textContent = `${wordCount} words`;
        const n = notes.find(x => x.id === noteId);
        if (n) { n.transcript += (n.transcript ? " " : "") + text; n.chunks.push({ text, time: elapsed, confidence: conf }); n.duration = Math.round(elapsed); debouncedSave(n); }
      } else { interim = text; }
    }
    renderLive();
  };
  recognition.onerror = e => { if (e.error === "not-allowed") { alert("Mic denied."); stopRec(); } };
  recognition.onend = () => { if (rec) try { recognition.start(); } catch {} };
  recognition.start();

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    micStream = stream; audioCtx = new AudioContext(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    function tick() { if (!rec) return; analyser.getByteFrequencyData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]; mtrF.style.width = `${Math.min(100, (s / (buf.length * 255)) * 400)}%`; raf = requestAnimationFrame(tick); } tick();
  }).catch(() => {});

  recBtn.textContent = "Stop Recording"; recBtn.className = "nav-rec on";
  tmr.style.display = "inline"; mtr.style.display = "block"; wcEl.style.display = "inline";
  timerInt = setInterval(() => tmr.textContent = fmt((Date.now() - startT) / 1000), 500);
  navigate("live");
}

function debouncedSave(n) { if (saveDebounce) return; saveDebounce = setTimeout(async () => { saveDebounce = null; await putNote(n); }, 5000); }

async function stopRec() {
  rec = false;
  if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
  if (raf) cancelAnimationFrame(raf); if (audioCtx) audioCtx.close().catch(() => {}); if (micStream) micStream.getTracks().forEach(t => t.stop());
  clearInterval(timerInt); if (saveDebounce) { clearTimeout(saveDebounce); saveDebounce = null; }
  mtrF.style.width = "0%";
  const n = notes.find(x => x.id === noteId);
  if (n) { n.duration = Math.round((Date.now() - startT) / 1000); n.title = genTitle(n.transcript, n.date); await putNote(n); }
  recBtn.textContent = "Start Recording"; recBtn.className = "nav-rec idle";
  tmr.style.display = "none"; mtr.style.display = "none"; wcEl.style.display = "none";
  noteId = null; await reload(); navigate("course", activeCourse);
}

function genTitle(t, date) {
  if (!t || t.length < 20) return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " — Recording";
  const s = (t.match(/[^.!?]+[.!?]*/g) || [t])[0].trim();
  let title = s.split(/\s+/).slice(0, 8).join(" ").replace(/[.!?,;:]+$/, "").trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title.length > 50 ? title.slice(0, 47) + "..." : title || "Recording";
}

// ══════════════════════════════════════════════════════════════════
//  AI SUMMARY
// ══════════════════════════════════════════════════════════════════

async function summarize(n) {
  $("sumBtn").textContent = "Summarizing..."; $("sumBtn").disabled = true;
  try {
    if (window.ai?.createTextSession) { const s = await window.ai.createTextSession(); n.summary = await s.prompt(`Summarize:\n1. Main Topic\n2. Key Points\n3. Terms\n\n${n.transcript.slice(0, 4000)}`); s.destroy(); }
    else n.summary = exSum(n.transcript);
  } catch { n.summary = exSum(n.transcript); }
  await putNote(n); renderDetail();
}
function exSum(t) { const s = t.match(/[^.!?]+[.!?]+/g) || [t]; const w = t.toLowerCase().split(/\s+/); const f = {}; w.forEach(x => { if (x.length > 3) f[x] = (f[x] || 0) + 1; }); const sc = s.map(x => ({ s: x.trim(), sc: x.toLowerCase().split(/\s+/).reduce((a, w) => a + (f[w] || 0), 0) / x.split(/\s+/).length })).sort((a, b) => b.sc - a.sc); const tw = Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w); return `Key Points:\n${sc.slice(0, 5).map(x => `- ${x.s}`).join("\n")}\n\nKey Terms: ${tw.join(", ")}`; }

function exportMd(n) { const d = new Date(n.date).toISOString().split("T")[0]; const l = [`# ${n.title}`, "", `**Course:** ${n.course}`, `**Duration:** ${fmt(n.duration)}`, "", "---", "", "## Transcript", ""]; if (n.chunks?.length) n.chunks.forEach(c => l.push(`\`[${fmt(c.time)}]\` ${c.text}`, "")); else l.push(n.transcript || ""); if (n.summary) l.push("", "---", "", "## Summary", "", n.summary); const b = new Blob([l.join("\n")], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${d}-${n.course}.md`; a.click(); }

$("search").oninput = e => { query = e.target.value.trim().toLowerCase(); if (!rec) render(); };

async function init() { await reload(); render(); }
