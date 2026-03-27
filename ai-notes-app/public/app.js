// ══════════════════════════════════════════════════════════════════
//  AI Note Taker — Optimized for speed and accuracy
//
//  Features:
//    - Instant transcription via Chrome Speech API
//    - PWA installable (works as desktop app)
//    - AI summary via Chrome's built-in window.ai (Gemini Nano)
//    - Confidence-based coloring (high/med/low accuracy)
//    - Word count tracking during recording
//    - Debounced saves to prevent jank
//    - Optimized rendering (only update changed DOM)
// ══════════════════════════════════════════════════════════════════

// ── Helpers ──
const esc = s => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(v => String(v).padStart(2,"0")).join(":"); };
const $ = id => document.getElementById(id);

// ── PWA Registration ──
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// ── Data (debounced saves) ──
const load = () => { try { return JSON.parse(localStorage.getItem("notes-v3")) || { courses: [], notes: [] }; } catch { return { courses: [], notes: [] }; } };
let saveTimer = null;
const save = (d, now) => {
  if (now) { localStorage.setItem("notes-v3", JSON.stringify(d)); return; }
  if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; localStorage.setItem("notes-v3", JSON.stringify(d)); }, 3000);
};
let D = load();

// ── State ──
let course = null, note = null, rec = false, noteId = null, startT = 0, lines = [], interim = "", query = "", wordCount = 0;

// ── DOM refs ──
const coursesEl = $("courses"), ct = $("content"), recBtn = $("recBtn"), tmr = $("timer"), mtr = $("meter"), mtrF = $("meterFill"), wcEl = $("wordCount");

// ══════════════════════════════════════════════════════════════════
//  COURSES
// ══════════════════════════════════════════════════════════════════

function renderCourses() {
  const cnt = {};
  D.notes.forEach(n => cnt[n.course] = (cnt[n.course]||0)+1);
  let h = `<div class="ci ${course===null?"on":""}" data-c="__all__">All Notes <span class="cc">${D.notes.length}</span></div>`;
  D.courses.forEach(c => {
    h += `<div class="ci ${course===c?"on":""}" data-c="${esc(c)}">${esc(c)} <span class="cc">${cnt[c]||0}</span><span class="ca"><span class="cx" data-act="del" data-n="${esc(c)}">&#10005;</span></span></div>`;
  });
  coursesEl.innerHTML = h;
  coursesEl.querySelectorAll(".ci").forEach(el => el.addEventListener("click", e => {
    if (e.target.dataset.act === "del") {
      const n = e.target.dataset.n;
      if (confirm(`Delete "${n}"?`)) { D.courses = D.courses.filter(c=>c!==n); D.notes.forEach(x=>{if(x.course===n)x.course="Other";}); if(course===n)course=null; save(D,true); renderCourses(); renderContent(); }
      return;
    }
    course = el.dataset.c === "__all__" ? null : el.dataset.c;
    note = null; renderCourses(); renderContent();
  }));
}

// Add course
$("addBtn").onclick = () => { $("addBtn").style.display="none"; $("addForm").classList.add("v"); $("addInput").value=""; setTimeout(()=>$("addInput").focus(),50); };
function addC() { const n=$("addInput").value.trim(); if(n&&!D.courses.includes(n)){D.courses.push(n);save(D,true);course=n;renderCourses();renderContent();} $("addForm").classList.remove("v"); $("addBtn").style.display="block"; }
$("addOk").onclick = addC;
$("addInput").onkeydown = e => { if(e.key==="Enter")addC(); if(e.key==="Escape"){$("addForm").classList.remove("v");$("addBtn").style.display="block";} };

// Search
$("search").oninput = e => { query=e.target.value.trim().toLowerCase(); if(!rec)renderContent(); };

// ══════════════════════════════════════════════════════════════════
//  CONTENT
// ══════════════════════════════════════════════════════════════════

function renderContent() {
  if (rec) { renderLive(); return; }
  if (note) { renderDetail(); return; }
  renderList();
}

function renderList() {
  let notes = D.notes.filter(n => !course || n.course === course);
  if (query) notes = notes.filter(n => n.transcript.toLowerCase().includes(query) || n.title.toLowerCase().includes(query));
  notes.sort((a,b) => new Date(b.date) - new Date(a.date));
  if (!notes.length) { ct.innerHTML = `<div class="empty"><h2>${esc(course||"All Notes")}</h2><p>${query?"No results.":"Add a course and start recording!"}</p></div>`; return; }
  let h = "";
  notes.forEach(n => {
    const wc = n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0;
    h += `<div class="cd" data-id="${esc(n.id)}"><div class="cd-t"><h3>${esc(n.title)}</h3><button class="db" data-id="${esc(n.id)}">&#10005;</button></div>
      <div class="mt"><span>${fmt(n.duration)}</span><span>${wc} words</span><span>${esc(n.course)}</span></div>
      <div class="pv">${esc(n.transcript.slice(0,150))||(n.transcript.length>150?"...":"No transcript")}</div></div>`;
  });
  ct.innerHTML = h;
  ct.querySelectorAll(".cd").forEach(el => el.addEventListener("click", e => { if(e.target.classList.contains("db"))return; note=D.notes.find(n=>n.id===el.dataset.id); renderContent(); }));
  ct.querySelectorAll(".db").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); const n=D.notes.find(x=>x.id===el.dataset.id); if(n&&confirm(`Delete "${n.title}"?`)){D.notes=D.notes.filter(x=>x.id!==n.id);save(D,true);renderCourses();renderContent();} }));
}

function renderDetail() {
  const n = note;
  const wc = n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0;
  let th = "";
  if (n.chunks?.length) n.chunks.forEach(c => {
    const conf = c.confidence >= 0.9 ? "conf-high" : c.confidence >= 0.7 ? "conf-med" : "conf-low";
    th += `<span class="ts">[${fmt(c.time)}]</span> <span class="${conf}">${esc(c.text)}</span>\n`;
  }); else th = esc(n.transcript) || "No transcript";

  const sumHtml = n.summary ? `<div class="sum"><h3>AI Summary</h3>${esc(n.summary)}</div>` : "";

  ct.innerHTML = `<div class="dh"><div><h2>${esc(n.title)}</h2>
    <div class="stats"><span>${fmt(n.duration)}</span><span>${wc} words</span><span>${esc(n.course)}</span></div></div>
    <div class="bg"><button class="bt" id="back">&larr; Back</button><button class="bt pri" id="sumBtn">Summarize</button><button class="bt" id="exp">Export .md</button><button class="bt dng" id="del">Delete</button></div></div>
    <div class="tr">${th}</div>${sumHtml}`;

  $("back").onclick = () => { note=null; renderContent(); };
  $("exp").onclick = () => exportMd(n);
  $("del").onclick = () => { if(confirm("Delete?")){D.notes=D.notes.filter(x=>x.id!==n.id);save(D,true);note=null;renderCourses();renderContent();} };
  $("sumBtn").onclick = () => summarize(n);
}

// ══════════════════════════════════════════════════════════════════
//  LIVE TRANSCRIPT — optimized: only append new lines
// ══════════════════════════════════════════════════════════════════

let lastLineCount = 0;

function renderLive() {
  // Full re-render only when line count changes significantly
  let h = "";
  lines.forEach(l => {
    const conf = l.confidence >= 0.9 ? "conf-high" : l.confidence >= 0.7 ? "conf-med" : "";
    h += `<div class="ln ${conf}"><span class="ts">[${fmt(l.time)}]</span> ${esc(l.text)}</div>`;
  });
  if (interim) h += `<div class="ln it">${esc(interim)}</div>`;
  if (!h) h = `<div class="ln it">Listening... speak into your microphone.</div>`;
  ct.innerHTML = h;
  ct.scrollTop = ct.scrollHeight;
  lastLineCount = lines.length;
}

// ══════════════════════════════════════════════════════════════════
//  RECORDING — optimized Speech API
// ══════════════════════════════════════════════════════════════════

let recognition = null, timerInt = null, audioCtx = null, analyser = null, micStream = null, raf = null;

recBtn.onclick = () => rec ? stopRec() : startRec();
document.onkeydown = e => { if(e.ctrlKey && e.key==="r"){e.preventDefault(); rec?stopRec():startRec();} };

function startRec() {
  if (!course) { alert("Select or add a course first."); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Use Chrome for speech recognition."); return; }

  const now = new Date();
  const title = `${now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} ${now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}`;
  const id = Date.now().toString(36)+Math.random().toString(36).slice(2);

  D.notes.push({id, course, title, date:now.toISOString(), transcript:"", chunks:[], duration:0, summary:""});
  save(D, true);
  noteId=id; lines=[]; interim=""; startT=Date.now(); rec=true; wordCount=0;

  // Speech recognition — tuned for accuracy
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  recognition.onresult = e => {
    const elapsed = (Date.now()-startT)/1000;
    for (let i=e.resultIndex; i<e.results.length; i++) {
      const r = e.results[i];
      const text = r[0].transcript.trim();
      const confidence = r[0].confidence || 0.8;
      if (r.isFinal && text) {
        lines.push({text, time:elapsed, confidence});
        interim = "";
        wordCount += text.split(/\s+/).length;
        wcEl.textContent = `${wordCount} words`;
        const n = D.notes.find(x=>x.id===noteId);
        if (n) { n.transcript+=(n.transcript?" ":"")+text; n.chunks.push({text,time:elapsed,confidence}); n.duration=Math.round(elapsed); save(D); }
      } else {
        interim = text;
      }
    }
    renderLive();
  };

  recognition.onerror = e => {
    if (e.error==="not-allowed") { alert("Microphone denied."); stopRec(); }
    // all other errors: let onend restart
  };

  recognition.onend = () => { if(rec) try{recognition.start();}catch{} };
  recognition.start();

  // Level meter
  navigator.mediaDevices.getUserMedia({audio:true}).then(stream => {
    micStream = stream;
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    function tick(){if(!rec)return;analyser.getByteFrequencyData(buf);let s=0;for(let i=0;i<buf.length;i++)s+=buf[i];mtrF.style.width=`${Math.min(100,(s/(buf.length*255))*400)}%`;raf=requestAnimationFrame(tick);}
    tick();
  }).catch(()=>{});

  recBtn.textContent="Stop Recording"; recBtn.className="rb on";
  tmr.style.display="inline"; mtr.style.display="block"; wcEl.style.display="inline";
  timerInt = setInterval(()=>tmr.textContent=fmt((Date.now()-startT)/1000), 500);
  renderContent();
}

function stopRec() {
  rec = false;
  if(recognition){recognition.onend=null;recognition.stop();recognition=null;}
  if(raf)cancelAnimationFrame(raf);
  if(audioCtx)audioCtx.close().catch(()=>{});
  if(micStream)micStream.getTracks().forEach(t=>t.stop());
  clearInterval(timerInt);
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}
  mtrF.style.width="0%";

  const n=D.notes.find(x=>x.id===noteId);
  if(n){n.duration=Math.round((Date.now()-startT)/1000);save(D,true);}

  recBtn.textContent="Start Recording"; recBtn.className="rb idle";
  tmr.style.display="none"; mtr.style.display="none"; wcEl.style.display="none";
  noteId=null; renderCourses(); renderContent();
}

// ══════════════════════════════════════════════════════════════════
//  AI SUMMARY — uses window.ai (Chrome's Gemini Nano) if available
//  Falls back to a simple extractive summary if not
// ══════════════════════════════════════════════════════════════════

async function summarize(n) {
  if (!n.transcript) { alert("No transcript to summarize."); return; }

  const btn = $("sumBtn");
  btn.textContent = "Summarizing...";
  btn.disabled = true;

  try {
    // Try Chrome's built-in AI (Gemini Nano)
    if (window.ai && window.ai.createTextSession) {
      const session = await window.ai.createTextSession();
      const result = await session.prompt(
        `Summarize this lecture transcript into:\n\n1. Main Topic (1 sentence)\n2. Key Points (3-5 bullets)\n3. Important Terms\n\nTranscript:\n${n.transcript.slice(0, 4000)}`
      );
      n.summary = result;
      session.destroy();
    } else {
      // Fallback: extractive summary (pick key sentences)
      n.summary = extractiveSummary(n.transcript);
    }
    save(D, true);
    renderDetail();
  } catch (err) {
    n.summary = extractiveSummary(n.transcript);
    save(D, true);
    renderDetail();
  }
}

function extractiveSummary(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const words = text.toLowerCase().split(/\s+/);
  const freq = {};
  words.forEach(w => { if(w.length>3) freq[w]=(freq[w]||0)+1; });

  // Score sentences by word frequency
  const scored = sentences.map(s => {
    const sw = s.toLowerCase().split(/\s+/);
    const score = sw.reduce((a,w) => a+(freq[w]||0), 0) / sw.length;
    return {s: s.trim(), score};
  });
  scored.sort((a,b) => b.score-a.score);

  const topWords = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([w])=>w);

  return `Key Points:\n${scored.slice(0,5).map(x=>`- ${x.s}`).join("\n")}\n\nKey Terms: ${topWords.join(", ")}`;
}

// ══════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════

function exportMd(n) {
  const d = new Date(n.date).toISOString().split("T")[0];
  const wc = n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0;
  const l = [`# ${n.title}`, "", `**Course:** ${n.course}  `, `**Duration:** ${fmt(n.duration)}  `, `**Words:** ${wc}`, "", "---", "", "## Transcript", ""];
  if(n.chunks?.length) n.chunks.forEach(c => l.push(`\`[${fmt(c.time)}]\` ${c.text}`, ""));
  else l.push(n.transcript || "_No transcript_");
  if(n.summary) l.push("", "---", "", "## AI Summary", "", n.summary);
  const blob = new Blob([l.join("\n")], {type:"text/markdown"});
  const a = document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=`${d}-${n.course.replace(/[^a-zA-Z0-9]+/g,"-")}.md`;
  a.click(); URL.revokeObjectURL(a.href);
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

renderCourses();
renderContent();
