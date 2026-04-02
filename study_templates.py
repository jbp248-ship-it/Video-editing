"""
Study features UI templates — CSS, HTML, and JavaScript for the study system.
Embedded as Python strings and rendered via Flask's render_template_string.
"""

STUDY_UI_CSS = """
/* ── Notes list ── */
.notes-list { margin-top: 8px; }
.note-card {
    background: #111;
    border: 1px solid #222;
    border-radius: 12px;
    padding: 16px;
    margin: 10px 0;
    transition: border-color 0.2s;
}
.note-card:hover { border-color: #25f4ee33; }
.note-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.note-title { font-size: 15px; font-weight: 600; color: #fff; }
.note-date-badge {
    font-size: 11px; color: #25f4ee; background: #0d2020;
    border: 1px solid #25f4ee44; border-radius: 6px; padding: 3px 8px;
    white-space: nowrap;
}
.note-preview { font-size: 12px; color: #666; margin-bottom: 12px; line-height: 1.5; }

/* ── Tab navigation ── */
.tab-nav {
    display: flex; gap: 6px; margin-bottom: 20px;
    background: #111; padding: 6px; border-radius: 12px;
}
.tab-btn {
    flex: 1; padding: 10px 12px; border-radius: 8px;
    background: transparent; color: #666; border: none;
    cursor: pointer; font-size: 13px; font-weight: 600;
    transition: all 0.2s;
}
.tab-btn:hover { color: #aaa; }
.tab-btn.active { background: #25f4ee; color: #000; }
.tab-btn.active-red { background: #fe2c55; color: #fff; }

.panel { display: none; }
.panel.active { display: block; }

/* ── Markdown rendered content ── */
.md-content { line-height: 1.75; color: #ccc; font-size: 14px; }
.md-content h1 {
    font-size: 20px; color: #25f4ee; margin: 20px 0 10px;
    padding-bottom: 6px; border-bottom: 1px solid #1a1a1a;
}
.md-content h2 {
    font-size: 16px; color: #fe2c55; margin: 18px 0 8px;
    padding-bottom: 4px; border-bottom: 1px solid #1a1a1a;
}
.md-content h3 { font-size: 14px; color: #fff; margin: 12px 0 6px; }
.md-content ul { padding-left: 18px; }
.md-content li { margin: 5px 0; }
.md-content strong { color: #fff; }
.md-content em { color: #aaa; }
.md-content code {
    background: #1a1a1a; color: #25f4ee;
    padding: 2px 6px; border-radius: 4px; font-size: 12px;
}
.md-content hr { border: none; border-top: 1px solid #222; margin: 16px 0; }
.md-content blockquote {
    border-left: 3px solid #fe2c55; padding-left: 12px;
    color: #888; margin: 12px 0;
}

/* ── Study action buttons ── */
.study-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-study {
    padding: 9px 16px; border: none; border-radius: 9px;
    font-size: 12px; font-weight: 700; cursor: pointer;
    transition: all 0.2s; white-space: nowrap;
}
.btn-study:hover { transform: scale(1.04); }
.btn-study:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.btn-summarize { background: linear-gradient(135deg, #25f4ee, #0fa8a3); color: #000; }
.btn-study-guide { background: linear-gradient(135deg, #fe2c55, #c4173a); color: #fff; }
.btn-quiz { background: linear-gradient(135deg, #7c3aed, #5b21b6); color: #fff; }

/* ── Content display panel ── */
.content-panel {
    background: #111; border-radius: 12px; padding: 20px;
    margin-top: 16px; border: 1px solid #222;
}
.content-panel-header {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 16px;
}
.content-panel-title { font-size: 14px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 1px; }
.content-empty { text-align: center; padding: 40px; color: #444; font-size: 14px; }

/* ── AI loading ── */
.ai-loading { display: none; text-align: center; padding: 30px; }
.ai-loading.show { display: block; }
.ai-spinner {
    width: 36px; height: 36px; border: 3px solid #222;
    border-top-color: #25f4ee; border-radius: 50%;
    animation: spin 1s linear infinite; margin: 0 auto 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.ai-loading-text { color: #555; font-size: 13px; }

/* ── Quiz styles ── */
.quiz-wrapper { }
.quiz-progress {
    font-size: 12px; color: #555; text-align: center;
    margin-bottom: 16px;
}
.quiz-question {
    background: #0d0d0d; border: 1px solid #222;
    border-radius: 12px; padding: 20px; margin-bottom: 12px;
}
.quiz-question-text { font-size: 15px; color: #fff; margin-bottom: 16px; line-height: 1.6; }
.quiz-options { display: flex; flex-direction: column; gap: 8px; }
.quiz-option {
    padding: 12px 16px; background: #1a1a1a;
    border: 1px solid #2a2a2a; border-radius: 9px;
    cursor: pointer; transition: all 0.15s;
    font-size: 13px; color: #ccc; text-align: left;
    width: 100%;
}
.quiz-option:hover:not(:disabled) { border-color: #25f4ee55; color: #fff; background: #1f2a2a; }
.quiz-option.correct { background: #0a2010; border-color: #22c55e; color: #22c55e; }
.quiz-option.wrong { background: #200a0a; border-color: #ef4444; color: #ef4444; }
.quiz-option.show-correct { border-color: #22c55e; color: #22c55e88; }
.quiz-explanation {
    background: #0f0f1a; border-left: 3px solid #7c3aed;
    padding: 12px 14px; border-radius: 0 8px 8px 0;
    margin-top: 12px; font-size: 13px; color: #888;
    display: none; line-height: 1.6;
}
.quiz-explanation.show { display: block; }
.quiz-sa-input {
    width: 100%; background: #1a1a1a; border: 1px solid #333;
    border-radius: 8px; padding: 12px; color: #fff;
    font-size: 13px; resize: vertical; min-height: 70px;
    margin-bottom: 8px;
}
.quiz-sa-input:focus { outline: none; border-color: #25f4ee; }
.btn-reveal {
    padding: 8px 16px; background: #1a1a2e;
    border: 1px solid #7c3aed; border-radius: 8px;
    color: #a855f7; font-size: 12px; cursor: pointer;
}
.quiz-nav {
    display: flex; justify-content: space-between;
    align-items: center; margin-top: 16px; gap: 10px;
}
.btn-nav {
    padding: 10px 24px; border: none; border-radius: 9px;
    font-size: 13px; font-weight: 700; cursor: pointer;
    background: #222; color: #ccc; transition: all 0.2s;
}
.btn-nav:hover { background: #333; color: #fff; }
.btn-nav:disabled { opacity: 0.3; cursor: not-allowed; }
.btn-nav.primary { background: #25f4ee; color: #000; }
.quiz-score-screen {
    text-align: center; padding: 30px 20px;
}
.quiz-score-num {
    font-size: 48px; font-weight: 900;
    background: linear-gradient(135deg, #25f4ee, #7c3aed);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
}
.quiz-score-label { font-size: 14px; color: #666; margin-top: 4px; }
.quiz-score-breakdown { margin-top: 20px; font-size: 13px; color: #888; }

/* ── Compile tab ── */
.compile-intro { font-size: 13px; color: #666; margin-bottom: 16px; }
.date-selector { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
.date-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; background: #111; border-radius: 9px;
    border: 1px solid #1e1e1e; cursor: pointer; transition: border-color 0.2s;
}
.date-item:hover { border-color: #25f4ee44; }
.date-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: #25f4ee; cursor: pointer; }
.date-label { font-size: 14px; color: #ccc; flex: 1; }
.date-count { font-size: 11px; color: #444; }
.btn-compile {
    width: 100%; padding: 14px; background: linear-gradient(135deg, #25f4ee, #0fa8a3);
    border: none; border-radius: 10px; color: #000;
    font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s;
}
.btn-compile:hover { transform: scale(1.02); }
.btn-compile:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* ── Inner study tabs ── */
.study-inner-nav {
    display: flex; gap: 4px; margin-bottom: 16px;
    border-bottom: 1px solid #1a1a1a; padding-bottom: 8px;
}
.study-inner-tab {
    padding: 6px 14px; background: transparent; border: none;
    color: #555; font-size: 13px; cursor: pointer;
    border-radius: 6px; transition: all 0.15s;
}
.study-inner-tab:hover { color: #aaa; }
.study-inner-tab.active { background: #1a1a1a; color: #fff; }

/* ── Empty states ── */
.empty-state { text-align: center; padding: 50px 20px; }
.empty-state-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }
.empty-state-text { font-size: 14px; color: #444; }
"""


NOTES_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Study Notes</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a; color: #ffffff;
            min-height: 100vh; padding: 20px; padding-bottom: 80px;
        }
        .container { max-width: 540px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0 24px; }
        .page-header h1 { font-size: 22px; background: linear-gradient(135deg, #25f4ee, #fe2c55); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .back-link { font-size: 13px; color: #444; text-decoration: none; }
        .back-link:hover { color: #25f4ee; }
        {{ css }}
    </style>
</head>
<body>
<div class="container">

    <div class="page-header">
        <h1>Study Notes</h1>
        <a href="/" class="back-link">← Back to clipper</a>
    </div>

    <!-- Main tab nav -->
    <div class="tab-nav">
        <button class="tab-btn active" id="tab-btn-notes" onclick="showTab('notes')">My Notes</button>
        <button class="tab-btn" id="tab-btn-study" onclick="showTab('study')">Study</button>
        <button class="tab-btn" id="tab-btn-compile" onclick="showTab('compile')">Compile</button>
    </div>

    <!-- ── NOTES TAB ── -->
    <div id="panel-notes" class="panel active">
        {% if notes %}
        <div class="notes-list">
            {% for note in notes %}
            <div class="note-card">
                <div class="note-card-header">
                    <div class="note-title">{{ note.title }}</div>
                    <div class="note-date-badge">{{ note.date }}</div>
                </div>
                <div class="note-preview">{{ note.raw_content[:180] }}{% if note.raw_content|length > 180 %}...{% endif %}</div>
                <div class="study-actions">
                    <button class="btn-study btn-summarize" onclick="summarizeNote('{{ note.id }}')">Summarize</button>
                    <button class="btn-study btn-study-guide" onclick="studyGuide('{{ note.id }}')">Study Guide</button>
                    <button class="btn-study btn-quiz" onclick="startQuiz('{{ note.id }}')">Start Quiz</button>
                </div>
            </div>
            {% endfor %}
        </div>
        {% else %}
        <div class="empty-state">
            <div class="empty-state-icon">📝</div>
            <div class="empty-state-text">No notes yet. Process a video to generate notes, or add one below.</div>
        </div>
        {% endif %}

        <!-- Quick add note -->
        <div style="margin-top: 24px; background: #111; border-radius: 12px; padding: 16px; border: 1px solid #1e1e1e;">
            <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 600;">ADD NOTE MANUALLY</div>
            <input type="text" id="new-note-title" placeholder="Note title..." style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:10px;color:#fff;font-size:13px;margin-bottom:8px;">
            <textarea id="new-note-content" placeholder="Paste your notes here..." style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:10px;color:#fff;font-size:13px;min-height:100px;resize:vertical;"></textarea>
            <button onclick="saveNote()" style="margin-top:8px;width:100%;padding:10px;background:#222;border:1px solid #333;border-radius:8px;color:#ccc;font-size:13px;cursor:pointer;">Save Note</button>
        </div>
    </div>

    <!-- ── STUDY TAB ── -->
    <div id="panel-study" class="panel">
        <div class="study-inner-nav">
            <button class="study-inner-tab active" id="itab-btn-summary" onclick="showInnerTab('summary')">Summary</button>
            <button class="study-inner-tab" id="itab-btn-guide" onclick="showInnerTab('guide')">Study Guide</button>
            <button class="study-inner-tab" id="itab-btn-quiz" onclick="showInnerTab('quiz')">Quiz</button>
        </div>

        <!-- Summary panel -->
        <div id="itab-summary" class="panel active">
            <div class="ai-loading" id="loading-summary">
                <div class="ai-spinner"></div>
                <div class="ai-loading-text">Generating structured summary...</div>
            </div>
            <div class="content-panel" id="content-summary">
                <div class="content-empty">Select a note and click "Summarize" to get started.</div>
            </div>
        </div>

        <!-- Study Guide panel -->
        <div id="itab-guide" class="panel">
            <div class="ai-loading" id="loading-guide">
                <div class="ai-spinner"></div>
                <div class="ai-loading-text">Building your study guide...</div>
            </div>
            <div class="content-panel" id="content-guide">
                <div class="content-empty">Select a note and click "Study Guide" to get started.</div>
            </div>
        </div>

        <!-- Quiz panel -->
        <div id="itab-quiz" class="panel">
            <div class="ai-loading" id="loading-quiz">
                <div class="ai-spinner"></div>
                <div class="ai-loading-text">Generating quiz questions...</div>
            </div>
            <div id="quiz-container">
                <div class="content-panel">
                    <div class="content-empty">Select a note and click "Start Quiz" to test yourself.</div>
                </div>
            </div>
        </div>
    </div>

    <!-- ── COMPILE TAB ── -->
    <div id="panel-compile" class="panel">
        <p class="compile-intro">Select multiple days to compile into one cohesive master document.</p>

        {% if dates %}
        <div class="date-selector" id="date-selector">
            {% for d in dates %}
            <label class="date-item">
                <input type="checkbox" value="{{ d }}" class="compile-date-cb">
                <span class="date-label">{{ d }}</span>
                <span class="date-count"></span>
            </label>
            {% endfor %}
        </div>
        <button class="btn-compile" id="btn-compile" onclick="compileNotes()">Compile Selected Notes</button>
        {% else %}
        <div class="empty-state">
            <div class="empty-state-icon">📚</div>
            <div class="empty-state-text">No notes saved yet. Add notes first.</div>
        </div>
        {% endif %}

        <div class="ai-loading" id="loading-compile" style="margin-top:20px">
            <div class="ai-spinner"></div>
            <div class="ai-loading-text">Compiling and synthesizing notes...</div>
        </div>
        <div class="content-panel" id="content-compile" style="display:none; margin-top:16px">
            <div class="content-panel-header">
                <span class="content-panel-title">Compiled Notes</span>
                <button onclick="copyCompiled(this)" style="padding:6px 12px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#888;font-size:11px;cursor:pointer;">Copy</button>
            </div>
            <div class="md-content" id="compiled-result"></div>
        </div>
    </div>

</div>

<script>
// ── XSS escaping ────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Fetch with per-request timeout ──────────────────────────────────────

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

// ── In-flight guard ──────────────────────────────────────────────────────

const _inFlight = {};

// ── Tab navigation ──────────────────────────────────────────────────────

function showTab(name) {
    ['notes','study','compile'].forEach(t => {
        document.getElementById('panel-' + t).classList.remove('active');
        document.getElementById('tab-btn-' + t).classList.remove('active');
    });
    document.getElementById('panel-' + name).classList.add('active');
    document.getElementById('tab-btn-' + name).classList.add('active');
}

function showInnerTab(name) {
    ['summary','guide','quiz'].forEach(t => {
        document.getElementById('itab-' + t).classList.remove('active');
        document.getElementById('itab-btn-' + t).classList.remove('active');
    });
    document.getElementById('itab-' + name).classList.add('active');
    document.getElementById('itab-btn-' + name).classList.add('active');
}

// ── Markdown renderer ───────────────────────────────────────────────────

function renderMarkdown(text) {
    if (!text) return '';
    // Normalize numbered lists to bullet lists before processing
    text = text.replace(/^\d+\.\s+/gm, '- ');
    let html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Headers
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Bold + italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Code
        .replace(/`(.+?)`/g, '<code>$1</code>')
        // HR
        .replace(/^---$/gm, '<hr>')
        // Blockquote
        .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
        // Bullet lists
        .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>(\n|$))+/g, match => '<ul>' + match + '</ul>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap bare paragraphs
    if (!html.startsWith('<')) html = '<p>' + html + '</p>';
    return '<div class="md-content">' + html + '</div>';
}

// ── Async job polling helper ─────────────────────────────────────────────

async function pollJob(jobId, loadingEl, onDone, onError) {
    const MAX_POLLS = 120;
    const POLL_INTERVAL_MS = 3000;
    const LONG_WAIT_THRESHOLD_MS = 30000;
    const startTime = Date.now();
    let cancelled = false;

    // Build a cancel button into the loading element
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'margin-top:10px;padding:6px 16px;background:#1a1a1a;border:1px solid #555;border-radius:6px;color:#aaa;font-size:12px;cursor:pointer;';
    cancelBtn.onclick = () => { cancelled = true; };
    const timerEl = document.createElement('div');
    timerEl.className = 'ai-loading-text';
    timerEl.style.marginTop = '6px';
    loadingEl.appendChild(timerEl);
    loadingEl.appendChild(cancelBtn);

    const timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        let msg = 'Generating... (' + (mins > 0 ? mins + 'm ' : '') + secs + 's)';
        if (elapsed >= LONG_WAIT_THRESHOLD_MS) {
            msg += '<br><span style="color:#fe2c55;font-size:11px;">Still working — this may take a few minutes on first run</span>';
        }
        timerEl.innerHTML = msg;
    }, 1000);

    try {
        for (let i = 0; i < MAX_POLLS; i++) {
            if (cancelled) {
                onError(new Error('Cancelled'));
                return;
            }
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            if (cancelled) { onError(new Error('Cancelled')); return; }
            const res = await fetchWithTimeout('/api/job/' + jobId);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (data.status === 'done') {
                onDone(data.result);
                return;
            }
            if (data.status === 'error') throw new Error(data.message || 'Job failed');
        }
        throw new Error('Timed out after 6 minutes');
    } catch (e) {
        onError(e);
    } finally {
        clearInterval(timerInterval);
        if (timerEl.parentNode) timerEl.parentNode.removeChild(timerEl);
        if (cancelBtn.parentNode) cancelBtn.parentNode.removeChild(cancelBtn);
    }
}

// ── Summarize ───────────────────────────────────────────────────────────

async function summarizeNote(noteId) {
    const key = noteId + '_summary';
    if (_inFlight[key]) return;
    _inFlight[key] = true;

    showTab('study');
    showInnerTab('summary');
    const loadingEl = document.getElementById('loading-summary');
    loadingEl.classList.add('show');
    document.getElementById('content-summary').innerHTML = '';

    try {
        const res = await fetchWithTimeout('/api/summarize/' + noteId);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.cached || data.summary) {
            document.getElementById('content-summary').innerHTML = renderMarkdown(data.summary);
        } else if (data.job_id) {
            await pollJob(data.job_id, loadingEl,
                result => { document.getElementById('content-summary').innerHTML = renderMarkdown(result.summary || result); },
                e => { document.getElementById('content-summary').innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px;">Error: ' + escapeHtml(e.message) + '</div>'; }
            );
        }
    } catch (e) {
        document.getElementById('content-summary').innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px;">Error: ' + escapeHtml(e.message) + '</div>';
    } finally {
        loadingEl.classList.remove('show');
        delete _inFlight[key];
    }
}

// ── Study Guide ─────────────────────────────────────────────────────────

async function studyGuide(noteId) {
    const key = noteId + '_guide';
    if (_inFlight[key]) return;
    _inFlight[key] = true;

    showTab('study');
    showInnerTab('guide');
    const loadingEl = document.getElementById('loading-guide');
    loadingEl.classList.add('show');
    document.getElementById('content-guide').innerHTML = '';

    try {
        const res = await fetchWithTimeout('/api/study-guide/' + noteId);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.cached || data.study_guide) {
            document.getElementById('content-guide').innerHTML = renderMarkdown(data.study_guide);
        } else if (data.job_id) {
            await pollJob(data.job_id, loadingEl,
                result => { document.getElementById('content-guide').innerHTML = renderMarkdown(result.study_guide || result); },
                e => { document.getElementById('content-guide').innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px;">Error: ' + escapeHtml(e.message) + '</div>'; }
            );
        }
    } catch (e) {
        document.getElementById('content-guide').innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px;">Error: ' + escapeHtml(e.message) + '</div>';
    } finally {
        loadingEl.classList.remove('show');
        delete _inFlight[key];
    }
}

// ── Quiz ────────────────────────────────────────────────────────────────

let _quiz = null;
let _qIdx = 0;
let _score = 0;
let _answered = {};

async function startQuiz(noteId) {
    const key = noteId + '_quiz';
    if (_inFlight[key]) return;
    _inFlight[key] = true;

    showTab('study');
    showInnerTab('quiz');
    const loadingEl = document.getElementById('loading-quiz');
    loadingEl.classList.add('show');
    document.getElementById('quiz-container').innerHTML = '';

    const initQuiz = (quiz) => {
        _quiz = quiz;
        _qIdx = 0;
        _score = 0;
        _answered = {};
        renderQuestion(0);
    };

    try {
        const res = await fetchWithTimeout('/api/quiz/' + noteId);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.cached || data.quiz) {
            initQuiz(data.quiz);
        } else if (data.job_id) {
            await pollJob(data.job_id, loadingEl,
                result => { initQuiz(result.quiz || result); },
                e => { document.getElementById('quiz-container').innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px;">Error: ' + escapeHtml(e.message) + '</div>'; }
            );
        }
    } catch (e) {
        document.getElementById('quiz-container').innerHTML = '<div style="color:#ef4444;font-size:13px;padding:12px;">Error: ' + escapeHtml(e.message) + '</div>';
    } finally {
        loadingEl.classList.remove('show');
        delete _inFlight[key];
    }
}

function renderQuestion(idx) {
    if (!_quiz || idx >= _quiz.questions.length) {
        showQuizResults();
        return;
    }
    const q = _quiz.questions[idx];
    const total = _quiz.questions.length;

    let optionsHtml = '';
    if (q.type === 'multiple_choice' && q.options) {
        optionsHtml = '<div class="quiz-options">' +
            q.options.map((opt, i) =>
                `<button class="quiz-option" id="opt-${idx}-${i}" onclick="selectMC(${idx}, ${i}, '${escQ(q.answer)}')">${escapeHtml(opt)}</button>`
            ).join('') +
            '</div>';
    } else {
        // Short answer / concept
        optionsHtml = `<textarea class="quiz-sa-input" id="sa-${idx}" placeholder="Type your answer..."></textarea>
        <button class="btn-reveal" onclick="revealAnswer(${idx})">Reveal Answer</button>`;
    }

    document.getElementById('quiz-container').innerHTML = `
        <div class="quiz-progress">Question ${idx + 1} of ${total}</div>
        <div class="quiz-question">
            <div class="quiz-question-text">${idx + 1}. ${escapeHtml(q.question)}</div>
            ${optionsHtml}
            <div class="quiz-explanation ${_answered[idx] ? 'show' : ''}" id="exp-${idx}">
                💡 ${escapeHtml(q.explanation || '')}
            </div>
        </div>
        <div class="quiz-nav">
            <button class="btn-nav" onclick="renderQuestion(${idx - 1})" ${idx === 0 ? 'disabled' : ''}>← Prev</button>
            <span style="font-size:12px;color:#444;">${_score} correct</span>
            <button class="btn-nav primary" id="btn-next-${idx}" onclick="renderQuestion(${idx + 1})" ${!_answered[idx] && q.type === 'multiple_choice' ? 'disabled' : ''}>
                ${idx === total - 1 ? 'Finish' : 'Next →'}
            </button>
        </div>
    `;
}

function escQ(s) { return String(s).replace(/'/g, "\\'"); }

function selectMC(qIdx, optIdx, correctAnswer) {
    const q = _quiz.questions[qIdx];
    if (_answered[qIdx]) return;
    _answered[qIdx] = true;

    const opts = q.options;
    const selectedText = opts[optIdx];
    const isCorrect = selectedText.trim().startsWith(correctAnswer.trim()) ||
                      selectedText.trim() === correctAnswer.trim() ||
                      String(optIdx) === String(correctAnswer) ||
                      String.fromCharCode(65 + optIdx) === String(correctAnswer).toUpperCase();

    if (isCorrect) _score++;

    // Style all options
    opts.forEach((opt, i) => {
        const btn = document.getElementById(`opt-${qIdx}-${i}`);
        if (!btn) return;
        btn.disabled = true;
        const thisCorrect = opt.trim().startsWith(correctAnswer.trim()) ||
                            String.fromCharCode(65 + i) === String(correctAnswer).toUpperCase();
        if (i === optIdx && isCorrect) btn.classList.add('correct');
        else if (i === optIdx) btn.classList.add('wrong');
        else if (thisCorrect) btn.classList.add('show-correct');
    });

    document.getElementById(`exp-${qIdx}`).classList.add('show');
    const nextBtn = document.getElementById(`btn-next-${qIdx}`);
    if (nextBtn) nextBtn.disabled = false;
}

function revealAnswer(qIdx) {
    _answered[qIdx] = true;
    document.getElementById(`exp-${qIdx}`).classList.add('show');
    const sa = document.getElementById(`sa-${qIdx}`);
    if (sa) {
        const q = _quiz.questions[qIdx];
        sa.style.borderColor = '#22c55e';
    }
}

function showQuizResults() {
    const total = _quiz.questions.length;
    const pct = Math.round((_score / total) * 100);
    const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚';

    document.getElementById('quiz-container').innerHTML = `
        <div class="quiz-score-screen">
            <div style="font-size:36px;margin-bottom:8px;">${emoji}</div>
            <div class="quiz-score-num">${pct}%</div>
            <div class="quiz-score-label">${_score} of ${total} correct</div>
            <div class="quiz-score-breakdown">
                ${pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good effort — review the missed ones.' : 'Keep studying — you\'ll get there!'}
            </div>
            <button onclick="_score=0;_answered={};_qIdx=0;renderQuestion(0);" style="margin-top:24px;padding:12px 28px;background:#25f4ee;border:none;border-radius:10px;color:#000;font-size:14px;font-weight:700;cursor:pointer;">
                Retake Quiz
            </button>
        </div>
    `;
}

// ── Compile ─────────────────────────────────────────────────────────────

async function compileNotes() {
    if (_inFlight['compile']) return;
    const cbs = document.querySelectorAll('.compile-date-cb:checked');
    const dates = Array.from(cbs).map(cb => cb.value);
    if (dates.length < 1) {
        alert('Select at least one date to compile.');
        return;
    }

    _inFlight['compile'] = true;
    document.getElementById('loading-compile').classList.add('show');
    document.getElementById('content-compile').style.display = 'none';
    document.getElementById('btn-compile').disabled = true;

    try {
        const res = await fetchWithTimeout('/api/compile', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({dates})
        }, 30000);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        document.getElementById('compiled-result').innerHTML = renderMarkdown(data.compiled);
        document.getElementById('content-compile').style.display = 'block';
    } catch(e) {
        alert('Compile error: ' + e.message);
    } finally {
        document.getElementById('loading-compile').classList.remove('show');
        document.getElementById('btn-compile').disabled = false;
        delete _inFlight['compile'];
    }
}

function copyCompiled(btn) {
    const text = document.getElementById('compiled-result').innerText;
    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
    });
}

// ── Save note manually ──────────────────────────────────────────────────

async function saveNote() {
    const title = document.getElementById('new-note-title').value.trim() || 'Untitled Note';
    const content = document.getElementById('new-note-content').value.trim();
    if (!content) { alert('Note content is required.'); return; }

    try {
        const res = await fetch('/api/save-note', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, content})
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // Reload page to show new note
        location.reload();
    } catch(e) {
        alert('Error saving note: ' + e.message);
    }
}
</script>
</body>
</html>"""
