// ══════════════════════════════════════════════════════════════════
//  Justin's AI Note Taker v4
//  Google Drive-style folders + day-grouped notes
//  Claude color scheme (#D97757 accent)
//  IndexedDB unlimited storage
// ══════════════════════════════════════════════════════════════════

const esc = s => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(v => String(v).padStart(2,"0")).join(":"); };
const $ = id => document.getElementById(id);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

// ══════════════════════════════════════════════════════════════════
//  IndexedDB
// ══════════════════════════════════════════════════════════════════
let db = null;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("justins-notes", 1);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("notes")) { const s = d.createObjectStore("notes", { keyPath: "id" }); s.createIndex("by-course","course"); s.createIndex("by-date","date"); }
      if (!d.objectStoreNames.contains("courses")) d.createObjectStore("courses", { keyPath: "name" });
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror = e => rej(e.target.error);
  });
}
async function dbAll(s) { return new Promise((r,j) => { const t=db.transaction(s,"readonly"); t.objectStore(s).getAll().onsuccess=e=>r(e.target.result); t.onerror=e=>j(e.target.error); }); }
async function dbPut(s,v) { return new Promise((r,j) => { const t=db.transaction(s,"readwrite"); t.objectStore(s).put(v).onsuccess=()=>r(); t.onerror=e=>j(e.target.error); }); }
async function dbDel(s,k) { return new Promise((r,j) => { const t=db.transaction(s,"readwrite"); t.objectStore(s).delete(k).onsuccess=()=>r(); t.onerror=e=>j(e.target.error); }); }

// Migrate old data
async function migrate() {
  for (const key of ["notes-v2","notes-v3"]) {
    try { const raw=localStorage.getItem(key); if(!raw)continue; const old=JSON.parse(raw);
      if(old.courses) for(const c of old.courses) await dbPut("courses",{name:c});
      if(old.notes) for(const n of old.notes) await dbPut("notes",n);
      localStorage.removeItem(key); console.log(`Migrated ${key}`);
    } catch{}
  }
}

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════
let courses=[], notes=[];
let view="home"; // "home" | "course" | "note" | "live"
let activeCourse=null, activeNote=null;
let rec=false, noteId=null, startT=0, lines=[], interim="", wordCount=0, query="";
let collapsedDays = new Set();
let selectedDays = new Set(); // multi-day selection for study mode
let selectMode = false;
let saveDebounce=null;
const ct=$("content"), recBtn=$("recBtn"), tmr=$("timer"), mtr=$("meter"), mtrF=$("meterFill"), wcEl=$("wordCount");

async function reload() { courses=(await dbAll("courses")).map(c=>c.name).sort(); notes=await dbAll("notes"); notes.sort((a,b)=>new Date(b.date)-new Date(a.date)); }

// ══════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════
function navigate(v, data) {
  if (v==="home") { view="home"; activeCourse=null; activeNote=null; }
  else if (v==="course") { view="course"; activeCourse=data; activeNote=null; }
  else if (v==="note") { view="note"; activeNote=data; }
  else if (v==="live") { view="live"; }
  renderBread();
  render();
}

function renderBread() {
  const b=$("bread");
  if (view==="home") { b.innerHTML=""; return; }
  let h = `<a data-nav="home">My Courses</a>`;
  if (view==="course"||view==="note"||view==="live") h += `<span>/</span><a data-nav="course">${esc(activeCourse)}</a>`;
  if (view==="note") h += `<span>/</span><span>${esc(activeNote.title)}</span>`;
  if (view==="live") h += `<span>/</span><span>Recording...</span>`;
  b.innerHTML = h;
  b.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    if (a.dataset.nav==="home") navigate("home");
    else if (a.dataset.nav==="course") navigate("course", activeCourse);
  }));
}

function render() {
  if (view==="live") renderLive();
  else if (view==="note") renderDetail();
  else if (view==="course") renderCourseNotes();
  else renderHome();
}

// ══════════════════════════════════════════════════════════════════
//  HOME — Course folders grid
// ══════════════════════════════════════════════════════════════════
function renderHome() {
  const cnt={};
  notes.forEach(n => cnt[n.course]=(cnt[n.course]||0)+1);

  let filtered = courses;
  if (query) {
    // Search across all notes
    const matchNotes = notes.filter(n => (n.transcript||"").toLowerCase().includes(query)||(n.title||"").toLowerCase().includes(query));
    if (matchNotes.length) {
      // Show search results as a flat list
      renderSearchResults(matchNotes);
      return;
    }
    filtered = courses.filter(c => c.toLowerCase().includes(query));
  }

  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  let h = `<div class="greeting"><h2>${greet}, <span>Justin</span></h2><p>What are we learning today?</p></div>`;
  h += `<div class="section-title">My Courses</div><div class="grid">`;

  filtered.forEach(c => {
    const count = cnt[c]||0;
    const totalWords = notes.filter(n=>n.course===c).reduce((a,n)=>a+(n.transcript?n.transcript.split(/\s+/).filter(Boolean).length:0),0);
    h += `<div class="folder" data-c="${esc(c)}">
      <button class="folder-del" data-del="${esc(c)}">&#10005;</button>
      <div class="folder-icon">&#128218;</div>
      <h3>${esc(c)}</h3>
      <p>${count} lecture${count!==1?"s":""} &middot; ${totalWords.toLocaleString()} words</p></div>`;
  });

  h += `<div class="add-folder" id="addFolderBtn"><span>+</span><p>Add Course</p></div>`;
  h += `<div class="add-folder-form" id="addFolderForm"><input id="addInput" placeholder="Course name (e.g. CS101)" /><div class="btns"><button class="cancel" id="addCancel">Cancel</button><button class="ok" id="addOk">Create</button></div></div>`;
  h += `</div>`;

  if (!filtered.length && !query) {
    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    h = `<div class="greeting"><h2>${greet}, <span>Justin</span></h2><p>What are we learning today?</p></div>
      <div style="padding:0 32px"><div class="grid">
        <div class="add-folder" id="addFolderBtn"><span>+</span><p>Add Course</p></div>
        <div class="add-folder-form" id="addFolderForm"><input id="addInput" placeholder="Course name (e.g. CS101)" /><div class="btns"><button class="cancel" id="addCancel">Cancel</button><button class="ok" id="addOk">Create</button></div></div>
      </div></div>`;
  }

  ct.innerHTML = h;

  // Folder click
  ct.querySelectorAll(".folder").forEach(el => el.addEventListener("click", e => {
    if (e.target.classList.contains("folder-del")) return;
    navigate("course", el.dataset.c);
  }));

  // Folder delete
  ct.querySelectorAll(".folder-del").forEach(el => el.addEventListener("click", async e => {
    e.stopPropagation();
    const name = el.dataset.del;
    if (!confirm(`Delete "${name}" and all its lectures?`)) return;
    for (const n of notes.filter(x=>x.course===name)) await dbDel("notes",n.id);
    await dbDel("courses",name);
    await reload(); render();
  }));

  // Add course
  const addBtn=$("addFolderBtn"), addForm=$("addFolderForm");
  if(addBtn) addBtn.onclick = () => { addBtn.style.display="none"; addForm.classList.add("v"); setTimeout(()=>$("addInput").focus(),50); };
  if($("addCancel")) $("addCancel").onclick = () => { addForm.classList.remove("v"); addBtn.style.display="flex"; };
  if($("addOk")) $("addOk").onclick = async () => {
    const name=$("addInput").value.trim();
    if(name&&!courses.includes(name)){await dbPut("courses",{name});await reload();navigate("course",name);}
    else{addForm.classList.remove("v");addBtn.style.display="flex";}
  };
  if($("addInput")) $("addInput").onkeydown = e => { if(e.key==="Enter")$("addOk").click(); if(e.key==="Escape"){addForm.classList.remove("v");addBtn.style.display="flex";} };
}

function renderSearchResults(matchNotes) {
  let h = `<div class="section-title">Search Results — "${esc(query)}"</div>`;
  matchNotes.forEach(n => {
    const wc=n.transcript?n.transcript.split(/\s+/).filter(Boolean).length:0;
    h += `<div class="note" data-id="${esc(n.id)}"><div class="note-top"><div class="note-info"><h3>${esc(n.title)}</h3><span class="note-time">${new Date(n.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${new Date(n.date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}</span></div></div>
      <div class="note-meta"><span class="tag">${esc(n.course)}</span><span>${fmt(n.duration)}</span><span>${wc} words</span></div>
      <div class="note-pv">${esc((n.transcript||"").slice(0,120))}</div></div>`;
  });
  ct.innerHTML = h;
  ct.querySelectorAll(".note").forEach(el => el.addEventListener("click", () => {
    activeNote=notes.find(n=>n.id===el.dataset.id);
    if(activeNote){activeCourse=activeNote.course;view="note";renderBread();render();}
  }));
}

// ══════════════════════════════════════════════════════════════════
//  COURSE VIEW — notes grouped by day
// ══════════════════════════════════════════════════════════════════
function renderCourseNotes() {
  let courseNotes = notes.filter(n => n.course === activeCourse);
  if (query) courseNotes = courseNotes.filter(n => (n.transcript||"").toLowerCase().includes(query)||(n.title||"").toLowerCase().includes(query));

  if (!courseNotes.length) {
    ct.innerHTML = `<div class="empty"><h2>${esc(activeCourse)}</h2><p>No lectures yet. Click Start Recording to begin.</p></div>`;
    return;
  }

  const days = {};
  courseNotes.forEach(n => {
    const day = new Date(n.date).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
    if(!days[day])days[day]=[];
    days[day].push(n);
  });

  // Study mode bar
  let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div class="section-title" style="margin:0">${esc(activeCourse)} — ${courseNotes.length} lecture${courseNotes.length!==1?"s":""}</div>
    <div style="display:flex;gap:8px;align-items:center">`;

  if (selectedDays.size > 0) {
    const selNotes = courseNotes.filter(n => {
      const d = new Date(n.date).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
      return selectedDays.has(d);
    });
    const selWords = selNotes.reduce((a,n)=>a+(n.transcript?n.transcript.split(/\s+/).filter(Boolean).length:0),0);
    h += `<span style="font-size:12px;color:#D97757">${selectedDays.size} day${selectedDays.size>1?"s":""} selected &middot; ${selWords.toLocaleString()} words</span>`;
    h += `<button class="btn btn-pri" id="studyBtn">Study Selected</button>`;
    h += `<button class="btn" id="clearSel">Clear</button>`;
  }
  h += `<button class="btn" id="selToggle">${selectMode?"Done":"Select Days"}</button>`;
  h += `</div></div>`;

  Object.entries(days).forEach(([day, dayNotes]) => {
    const collapsed = collapsedDays.has(day);
    const selected = selectedDays.has(day);
    const tw = dayNotes.reduce((a,n)=>a+(n.transcript?n.transcript.split(/\s+/).filter(Boolean).length:0),0);
    const td = dayNotes.reduce((a,n)=>a+(n.duration||0),0);

    h += `<div class="day-group ${selected?"day-selected":""}">
      <div class="day-hdr" data-day="${esc(day)}">
        ${selectMode ? `<input type="checkbox" class="day-check" data-day="${esc(day)}" ${selected?"checked":""} />` : `<span class="day-arrow ${collapsed?"":"open"}">&#9654;</span>`}
        <span class="day-title">${esc(day)}</span>
        <span class="day-stats">${dayNotes.length} lecture${dayNotes.length>1?"s":""} &middot; ${tw.toLocaleString()} words &middot; ${fmt(td)}</span>
      </div>`;

    if (!collapsed && !selectMode) dayNotes.forEach(n => {
      const wc=n.transcript?n.transcript.split(/\s+/).filter(Boolean).length:0;
      const time=new Date(n.date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
      h += `<div class="note" data-id="${esc(n.id)}"><div class="note-top"><div class="note-info"><h3>${esc(n.title)}</h3><span class="note-time">${time}</span></div>
        <button class="note-del" data-id="${esc(n.id)}">&#10005;</button></div>
        <div class="note-meta"><span>${fmt(n.duration)}</span><span>${wc} words</span></div>
        <div class="note-pv">${esc((n.transcript||"").slice(0,120))}${(n.transcript||"").length>120?"...":""}</div></div>`;
    });
    h += `</div>`;
  });

  ct.innerHTML = h;

  // Select mode toggle
  if ($("selToggle")) $("selToggle").onclick = () => { selectMode = !selectMode; if (!selectMode) selectedDays.clear(); renderCourseNotes(); };
  if ($("clearSel")) $("clearSel").onclick = () => { selectedDays.clear(); renderCourseNotes(); };
  if ($("studyBtn")) $("studyBtn").onclick = () => openStudyMode(courseNotes);

  // Day checkboxes
  ct.querySelectorAll(".day-check").forEach(el => el.addEventListener("change", () => {
    const d = el.dataset.day;
    if (el.checked) selectedDays.add(d); else selectedDays.delete(d);
    renderCourseNotes();
  }));

  // Day collapse (non-select mode)
  if (!selectMode) {
    ct.querySelectorAll(".day-hdr").forEach(el => el.addEventListener("click", e => {
      if (e.target.classList.contains("day-check")) return;
      const d = el.dataset.day; collapsedDays.has(d) ? collapsedDays.delete(d) : collapsedDays.add(d); renderCourseNotes();
    }));
  }

  ct.querySelectorAll(".note").forEach(el => el.addEventListener("click", e => {
    if(e.target.classList.contains("note-del"))return;
    activeNote=notes.find(n=>n.id===el.dataset.id); if(activeNote){view="note";renderBread();render();}
  }));
  ct.querySelectorAll(".note-del").forEach(el => el.addEventListener("click", async e => {
    e.stopPropagation();const n=notes.find(x=>x.id===el.dataset.id);
    if(n&&confirm(`Delete "${n.title}"?`)){await dbDel("notes",n.id);await reload();render();}
  }));
}

// ══════════════════════════════════════════════════════════════════
//  STUDY MODE — combine selected days into one view
// ══════════════════════════════════════════════════════════════════
function openStudyMode(courseNotes) {
  const selNotes = courseNotes.filter(n => {
    const d = new Date(n.date).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
    return selectedDays.has(d);
  }).sort((a,b) => new Date(a.date) - new Date(b.date)); // chronological for study

  const totalWords = selNotes.reduce((a,n) => a + (n.transcript ? n.transcript.split(/\s+/).filter(Boolean).length : 0), 0);
  const totalDur = selNotes.reduce((a,n) => a + (n.duration || 0), 0);

  let allText = "";
  let h = `<div class="detail-hdr"><h2>Study Mode — ${selectedDays.size} Day${selectedDays.size>1?"s":""}</h2>
    <div class="detail-meta"><span>${selNotes.length} lectures</span><span>${totalWords.toLocaleString()} words</span><span>${fmt(totalDur)} total</span><span class="tag">${esc(activeCourse)}</span></div>
    <div class="detail-actions"><button class="btn" id="backStudy">&larr; Back</button><button class="btn btn-pri" id="copyStudy">Copy All Text</button><button class="btn" id="exportStudy">Export .md</button></div></div>`;

  selNotes.forEach(n => {
    const day = new Date(n.date).toLocaleDateString("en-US",{month:"short",day:"numeric"});
    const time = new Date(n.date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
    allText += `\n\n## ${n.title} (${day} ${time})\n\n`;

    h += `<div style="margin-bottom:16px"><div style="font-size:13px;font-weight:600;color:#D97757;margin-bottom:8px">${esc(n.title)} — ${day} ${time}</div>`;
    h += `<div class="transcript-box" style="max-height:none">`;

    if (n.chunks?.length) {
      n.chunks.forEach(c => { h += `<span class="ts">[${fmt(c.time)}]</span> ${esc(c.text)}\n`; allText += `[${fmt(c.time)}] ${c.text}\n`; });
    } else {
      h += esc(n.transcript) || "No transcript";
      allText += n.transcript || "";
    }
    h += `</div></div>`;
  });

  ct.innerHTML = h;

  $("backStudy").onclick = () => { renderCourseNotes(); };
  $("copyStudy").onclick = () => {
    navigator.clipboard.writeText(allText.trim()).then(() => {
      $("copyStudy").textContent = "Copied!";
      setTimeout(() => $("copyStudy").textContent = "Copy All Text", 2000);
    });
  };
  $("exportStudy").onclick = () => {
    const blob = new Blob([`# Study Notes — ${activeCourse}\n\n${allText}`], {type:"text/markdown"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `study-${activeCourse.replace(/[^a-zA-Z0-9]+/g,"-")}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  };
}

// ══════════════════════════════════════════════════════════════════
//  NOTE DETAIL
// ══════════════════════════════════════════════════════════════════
function renderDetail() {
  const n=activeNote;
  const wc=n.transcript?n.transcript.split(/\s+/).filter(Boolean).length:0;
  let th="";
  if(n.chunks?.length)n.chunks.forEach(c=>th+=`<span class="ts">[${fmt(c.time)}]</span> ${esc(c.text)}\n`);
  else th=esc(n.transcript)||"No transcript";
  const sumH=n.summary?`<div class="summary-box"><h3>AI Summary</h3>${esc(n.summary)}</div>`:"";
  const time=new Date(n.date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
  const day=new Date(n.date).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});

  ct.innerHTML=`<div class="detail-hdr"><h2>${esc(n.title)}</h2>
    <div class="detail-meta"><span>${esc(day)} at ${time}</span><span>${fmt(n.duration)}</span><span>${wc.toLocaleString()} words</span><span class="tag">${esc(n.course)}</span></div>
    <div class="detail-actions"><button class="btn btn-pri" id="sumBtn">Summarize</button><button class="btn" id="exp">Export .md</button><button class="btn btn-dng" id="del">Delete</button></div></div>
    <div class="transcript-box">${th}</div>${sumH}`;

  $("exp").onclick=()=>exportMd(n);
  $("del").onclick=async()=>{if(confirm("Delete?")){await dbDel("notes",n.id);await reload();navigate("course",activeCourse);}};
  $("sumBtn").onclick=()=>summarize(n);
}

// ══════════════════════════════════════════════════════════════════
//  LIVE RECORDING VIEW
// ══════════════════════════════════════════════════════════════════
function renderLive() {
  let h="";
  lines.forEach(l=>h+=`<div class="live-line"><span class="ts">[${fmt(l.time)}]</span> ${esc(l.text)}</div>`);
  if(interim)h+=`<div class="live-line live-interim">${esc(interim)}</div>`;
  if(!h)h=`<div class="live-line live-interim">Listening... speak into your microphone.</div>`;
  ct.innerHTML=h;
  ct.scrollTop=ct.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════════════════════
let recognition=null,timerInt=null,audioCtx=null,analyser=null,micStream=null,raf=null;

recBtn.onclick=()=>rec?stopRec():startRec();
document.onkeydown=e=>{if(e.ctrlKey&&e.key==="r"){e.preventDefault();rec?stopRec():startRec();}};

async function startRec() {
  if(!activeCourse){alert("Open a course folder first.");return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert("Use Chrome.");return;}

  const now=new Date();
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2);
  const noteObj={id,course:activeCourse,title:"Recording...",date:now.toISOString(),transcript:"",chunks:[],duration:0,summary:""};
  await dbPut("notes",noteObj);
  notes.unshift(noteObj);
  noteId=id;lines=[];interim="";startT=Date.now();rec=true;wordCount=0;

  recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang="en-US";

  recognition.onresult=e=>{
    const elapsed=(Date.now()-startT)/1000;
    for(let i=e.resultIndex;i<e.results.length;i++){
      const r=e.results[i],text=r[0].transcript.trim(),conf=r[0].confidence||.8;
      if(r.isFinal&&text){
        lines.push({text,time:elapsed,confidence:conf});interim="";
        wordCount+=text.split(/\s+/).length;wcEl.textContent=`${wordCount} words`;
        const n=notes.find(x=>x.id===noteId);
        if(n){n.transcript+=(n.transcript?" ":"")+text;n.chunks.push({text,time:elapsed,confidence:conf});n.duration=Math.round(elapsed);debouncedSave(n);}
      }else{interim=text;}
    }
    renderLive();
  };
  recognition.onerror=e=>{if(e.error==="not-allowed"){alert("Mic denied.");stopRec();}};
  recognition.onend=()=>{if(rec)try{recognition.start();}catch{}};
  recognition.start();

  navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
    micStream=stream;audioCtx=new AudioContext();analyser=audioCtx.createAnalyser();analyser.fftSize=256;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf=new Uint8Array(analyser.frequencyBinCount);
    function tick(){if(!rec)return;analyser.getByteFrequencyData(buf);let s=0;for(let i=0;i<buf.length;i++)s+=buf[i];mtrF.style.width=`${Math.min(100,(s/(buf.length*255))*400)}%`;raf=requestAnimationFrame(tick);}
    tick();
  }).catch(()=>{});

  recBtn.textContent="Stop Recording";recBtn.className="nav-rec on";
  tmr.style.display="inline";mtr.style.display="block";wcEl.style.display="inline";
  timerInt=setInterval(()=>tmr.textContent=fmt((Date.now()-startT)/1000),500);
  navigate("live");
}

function debouncedSave(n){if(saveDebounce)return;saveDebounce=setTimeout(async()=>{saveDebounce=null;await dbPut("notes",n);},3000);}

async function stopRec(){
  rec=false;
  if(recognition){recognition.onend=null;recognition.stop();recognition=null;}
  if(raf)cancelAnimationFrame(raf);if(audioCtx)audioCtx.close().catch(()=>{});
  if(micStream)micStream.getTracks().forEach(t=>t.stop());
  clearInterval(timerInt);if(saveDebounce){clearTimeout(saveDebounce);saveDebounce=null;}
  mtrF.style.width="0%";

  const n=notes.find(x=>x.id===noteId);
  if(n){n.duration=Math.round((Date.now()-startT)/1000);n.title=genTitle(n.transcript,n.date);await dbPut("notes",n);}

  recBtn.textContent="Start Recording";recBtn.className="nav-rec idle";
  tmr.style.display="none";mtr.style.display="none";wcEl.style.display="none";
  noteId=null;await reload();navigate("course",activeCourse);
}

function genTitle(t,date){
  if(!t||t.length<20)return new Date(date).toLocaleDateString("en-US",{month:"short",day:"numeric"})+" — Recording";
  const s=(t.match(/[^.!?]+[.!?]*/g)||[t])[0].trim();
  let title=s.split(/\s+/).slice(0,8).join(" ").replace(/[.!?,;:]+$/,"").trim();
  title=title.charAt(0).toUpperCase()+title.slice(1);
  return title.length>50?title.slice(0,47)+"...":title||"Recording";
}

// ══════════════════════════════════════════════════════════════════
//  AI SUMMARY
// ══════════════════════════════════════════════════════════════════
async function summarize(n){
  if(!n.transcript){alert("No transcript.");return;}
  $("sumBtn").textContent="Summarizing...";$("sumBtn").disabled=true;
  try{if(window.ai?.createTextSession){const s=await window.ai.createTextSession();n.summary=await s.prompt(`Summarize:\n\n1. Main Topic\n2. Key Points (3-5)\n3. Terms\n\n${n.transcript.slice(0,4000)}`);s.destroy();}
  else n.summary=exSum(n.transcript);}catch{n.summary=exSum(n.transcript);}
  await dbPut("notes",n);renderDetail();
}
function exSum(t){const s=t.match(/[^.!?]+[.!?]+/g)||[t];const w=t.toLowerCase().split(/\s+/);const f={};w.forEach(x=>{if(x.length>3)f[x]=(f[x]||0)+1;});const sc=s.map(x=>({s:x.trim(),sc:x.toLowerCase().split(/\s+/).reduce((a,w)=>a+(f[w]||0),0)/x.split(/\s+/).length})).sort((a,b)=>b.sc-a.sc);const tw=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([w])=>w);return`Key Points:\n${sc.slice(0,5).map(x=>`- ${x.s}`).join("\n")}\n\nKey Terms: ${tw.join(", ")}`;}

// ══════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════
function exportMd(n){const d=new Date(n.date).toISOString().split("T")[0];const wc=n.transcript?n.transcript.split(/\s+/).filter(Boolean).length:0;const l=[`# ${n.title}`,"",`**Course:** ${n.course}`,`**Duration:** ${fmt(n.duration)}`,`**Words:** ${wc}`,"","---","","## Transcript",""];if(n.chunks?.length)n.chunks.forEach(c=>l.push(`\`[${fmt(c.time)}]\` ${c.text}`,""));else l.push(n.transcript||"_No transcript_");if(n.summary)l.push("","---","","## Summary","",n.summary);const blob=new Blob([l.join("\n")],{type:"text/markdown"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${d}-${n.course.replace(/[^a-zA-Z0-9]+/g,"-")}.md`;a.click();URL.revokeObjectURL(a.href);}

// ══════════════════════════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════════════════════════
$("search").oninput=e=>{query=e.target.value.trim().toLowerCase();if(!rec)render();};

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
(async()=>{await openDB();await migrate();await reload();render();})();
