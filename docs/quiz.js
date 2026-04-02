/**
 * quiz.js — Pure JavaScript quiz and flashcard generator for lecture transcripts.
 * No dependencies. Loaded via <script> tag; all functions are window-global.
 */

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

var _QUIZ_STOP = new Set(["the","a","an","is","are","was","were","be","been","have","has","had",
  "do","does","did","will","would","could","should","may","might","can","to","of","in","for",
  "on","with","at","by","from","as","into","through","but","and","or","not","so","very","just",
  "about","also","then","than","this","that","these","those","it","its","i","me","my","we","you",
  "he","him","his","she","her","they","them","their","what","which","who","when","where","how"]);

function _qSplitSentences(text) {
  var raw = text.replace(/([.!?])\s+(?=[A-Z])/g, "$1||S||").split("||S||");
  return raw.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 15; });
}

function _qTokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9' -]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2; });
}

function _qKeywords(sentence) {
  return _qTokenize(sentence).filter(function (w) { return !_QUIZ_STOP.has(w); });
}

function _qShuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function _qIsFactual(s) {
  return /\b\d{2,}\b/.test(s) || /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/.test(s) ||
    /\b(?:is defined as|refers to|is called|means|is a|is the)\b/i.test(s) ||
    /\b\d{4}\b/.test(s);
}

function _qMakeDistractors(correct, allSentences, count) {
  var kw = _qKeywords(correct);
  var pool = [];
  allSentences.forEach(function (s) {
    if (s !== correct) {
      _qKeywords(s).forEach(function (w) { if (pool.indexOf(w) === -1) pool.push(w); });
    }
  });
  pool = _qShuffle(pool);

  var distractors = [];
  var used = {};
  // Strategy 1: swap a keyword with one from the pool
  for (var i = 0; i < pool.length && distractors.length < count; i++) {
    var d = pool[i];
    if (kw.indexOf(d) === -1 && !used[d]) {
      used[d] = true;
      if (kw.length > 0) {
        var target = kw[Math.floor(Math.random() * kw.length)];
        distractors.push(correct.replace(new RegExp("\\b" + target + "\\b", "i"), d));
      }
    }
  }
  // Strategy 2: number alteration
  if (distractors.length < count && /\b(\d+)\b/.test(correct)) {
    var num = parseInt(RegExp.$1, 10);
    [num + 1, num * 2, Math.max(1, num - 1)].forEach(function (alt) {
      if (distractors.length < count) {
        distractors.push(correct.replace(/\b\d+\b/, String(alt)));
      }
    });
  }
  // Pad with generic wrong answers if needed
  while (distractors.length < count) {
    distractors.push("None of the above");
  }
  return distractors.slice(0, count);
}

function _qSentenceToQuestion(sentence) {
  var s = sentence.replace(/\.\s*$/, "");
  // Definition-style
  var defMatch = s.match(/^(.+?)\b(?:is defined as|refers to|is called|means|is a|is the)\b(.+)$/i);
  if (defMatch) {
    return "What " + defMatch[1].trim().toLowerCase().replace(/^the\s+/i, "") + "?";
  }
  // Contains a number — ask about it
  if (/\b(\d{2,})\b/.test(s)) {
    return s.replace(/\b\d{2,}\b/, "how many/what number") + "?";
  }
  // Contains a proper noun
  var nameMatch = s.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/);
  if (nameMatch) {
    return s.replace(nameMatch[1], "whom/what") + "?";
  }
  return "Which of the following is correct: " + s.substring(0, 60) + "...?";
}

/* ------------------------------------------------------------------ */
/*  Public: generateQuiz                                               */
/* ------------------------------------------------------------------ */

/**
 * Generate multiple-choice questions from transcript text.
 * @param {string} text - Lecture transcript
 * @param {number} [count=10] - Number of questions to generate
 * @returns {Array<{question:string, options:string[], correctIndex:number, explanation:string}>}
 */
function generateQuiz(text, count) {
  if (count === undefined) count = 10;
  var sentences = _qSplitSentences(text);
  var factual = sentences.filter(_qIsFactual);
  if (factual.length === 0) factual = sentences; // fallback
  factual = _qShuffle(factual).slice(0, count);

  return factual.map(function (s) {
    var question = _qSentenceToQuestion(s);
    var distractors = _qMakeDistractors(s, sentences, 3);
    var options = distractors.concat([s]);
    options = _qShuffle(options);
    var correctIndex = options.indexOf(s);
    return {
      question: question,
      options: options,
      correctIndex: correctIndex,
      explanation: "The correct answer comes from: \"" + s + "\""
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Public: generateFlashcards                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate study flashcards from transcript text.
 * @param {string} text - Lecture transcript
 * @param {number} [count=15] - Max number of flashcards
 * @returns {Array<{front:string, back:string, category:string}>}
 */
function generateFlashcards(text, count) {
  if (count === undefined) count = 15;
  var sentences = _qSplitSentences(text);
  var cards = [];

  // Term/definition pairs
  var defRe = /^(.+?)\b(is defined as|refers to|means|is called|defined as)\b(.+)$/i;
  sentences.forEach(function (s) {
    var m = s.match(defRe);
    if (m && cards.length < count) {
      cards.push({ front: m[1].trim(), back: m[3].trim().replace(/\.\s*$/, ""), category: "term" });
    }
  });

  // Cause-effect pairs
  var causeRe = /\b(because|therefore|results in|leads to|causes|consequently)\b/i;
  sentences.forEach(function (s) {
    if (causeRe.test(s) && cards.length < count) {
      var parts = s.split(causeRe);
      if (parts.length >= 3) {
        cards.push({ front: parts[0].trim(), back: parts.slice(1).join(" ").trim().replace(/\.\s*$/, ""), category: "concept" });
      }
    }
  });

  // Fact sentences (numbers, dates, proper nouns)
  sentences.forEach(function (s) {
    if (cards.length < count && _qIsFactual(s)) {
      var kw = _qKeywords(s);
      if (kw.length >= 3) {
        var top = kw.slice(0, 3).join(", ");
        cards.push({ front: "Key fact: " + top, back: s.replace(/\.\s*$/, ""), category: "fact" });
      }
    }
  });

  return cards.slice(0, count);
}

/* ------------------------------------------------------------------ */
/*  Public: renderQuizHTML                                             */
/* ------------------------------------------------------------------ */

/**
 * Render an interactive quiz as an HTML string with inline styles.
 * @param {Array} questions - Output of generateQuiz()
 * @returns {string} HTML string
 */
function renderQuizHTML(questions) {
  var id = "qz_" + Date.now();
  var html = '<div id="' + id + '" style="font-family:Georgia,serif;background:#F5EDE4;padding:24px;border-radius:12px;max-width:720px;margin:auto">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">';
  html += '<h2 style="margin:0;color:#2C2C2C">Quiz</h2>';
  html += '<span id="' + id + '_score" style="background:#D97757;color:#fff;padding:6px 14px;border-radius:20px;font-size:14px">Score: 0 / ' + questions.length + '</span>';
  html += '</div>';

  questions.forEach(function (q, qi) {
    html += '<div style="background:#fff;border-radius:10px;padding:18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.08)">';
    html += '<p style="font-weight:bold;color:#2C2C2C;margin:0 0 12px"><span style="color:#D97757">Q' + (qi + 1) + '.</span> ' + q.question + '</p>';
    q.options.forEach(function (opt, oi) {
      var rid = id + "_q" + qi + "_o" + oi;
      html += '<label style="display:block;padding:8px 12px;margin:4px 0;border-radius:6px;cursor:pointer;border:1px solid #e0d6cc;transition:background .2s" ';
      html += 'onmouseover="this.style.background=\'#faf5ef\'" onmouseout="this.style.background=\'#fff\'">';
      html += '<input type="radio" name="' + id + '_q' + qi + '" value="' + oi + '" id="' + rid + '" style="margin-right:8px">';
      html += '<span>' + opt + '</span></label>';
    });
    html += '<button onclick="(function(){var r=document.querySelector(\'input[name=' + id + '_q' + qi + ']:checked\');if(!r)return;var btn=event.target;btn.disabled=true;var fb=btn.nextElementSibling;var correct=' + q.correctIndex + ';var chosen=parseInt(r.value);if(chosen===correct){fb.style.color=\'#2a7a3a\';fb.textContent=\'Correct! \';var sc=document.getElementById(\'' + id + '_score\');var m=sc.textContent.match(/(\\d+)/);sc.textContent=\'Score: \'+(parseInt(m[1])+1)+\' / ' + questions.length + '\'}else{fb.style.color=\'#c0392b\';fb.textContent=\'Incorrect. \'}fb.textContent+=\'' + q.explanation.replace(/'/g, "\\'").replace(/"/g, "&quot;") + '\';fb.style.display=\'block\'})()" ';
    html += 'style="margin-top:10px;background:#D97757;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:14px">Check Answer</button>';
    html += '<p style="display:none;margin-top:8px;font-size:13px;line-height:1.5"></p>';
    html += '</div>';
  });

  html += '</div>';
  return html;
}

/* ------------------------------------------------------------------ */
/*  Public: renderFlashcardsHTML                                       */
/* ------------------------------------------------------------------ */

/**
 * Render flip-able flashcards as an HTML string with inline styles.
 * @param {Array} cards - Output of generateFlashcards()
 * @returns {string} HTML string
 */
function renderFlashcardsHTML(cards) {
  var id = "fc_" + Date.now();
  var html = '<div id="' + id + '" style="font-family:Georgia,serif;background:#F5EDE4;padding:24px;border-radius:12px;max-width:800px;margin:auto">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">';
  html += '<h2 style="margin:0;color:#2C2C2C">Flashcards</h2>';
  html += '<div><span id="' + id + '_counter" style="margin-right:12px;font-size:14px;color:#6b5e52">Card 1 of ' + cards.length + '</span>';
  html += '<button onclick="(function(){var c=document.getElementById(\'' + id + '\');var g=c.querySelector(\'[data-grid]\');var items=Array.from(g.children);for(var i=items.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));g.insertBefore(items[j],items[i]);items=Array.from(g.children)}})()" ';
  html += 'style="background:#D97757;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px">Shuffle</button></div></div>';

  html += '<div data-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">';

  var catColors = { term: "#D97757", concept: "#5b8a72", fact: "#5878a0" };

  cards.forEach(function (card, ci) {
    var col = catColors[card.category] || "#D97757";
    html += '<div onclick="(function(el){var b=el.querySelector(\'[data-back]\');var f=el.querySelector(\'[data-front]\');if(b.style.display===\'none\'){b.style.display=\'block\';f.style.display=\'none\'}else{b.style.display=\'none\';f.style.display=\'block\'}var ctr=document.getElementById(\'' + id + '_counter\');ctr.textContent=\'Card ' + (ci + 1) + ' of ' + cards.length + '\'})(this)" ';
    html += 'style="background:#fff;border-radius:10px;padding:18px;min-height:120px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.08);position:relative;transition:transform .15s;display:flex;flex-direction:column;justify-content:center" ';
    html += 'onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'scale(1)\'">';
    html += '<span style="position:absolute;top:8px;right:10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#fff;background:' + col + ';padding:2px 8px;border-radius:10px">' + card.category + '</span>';
    html += '<div data-front style="text-align:center;color:#2C2C2C;font-size:15px;font-weight:bold;padding-top:10px">' + card.front + '</div>';
    html += '<div data-back style="display:none;text-align:center;color:#5a5048;font-size:14px;line-height:1.5;padding-top:10px">' + card.back + '</div>';
    html += '</div>';
  });

  html += '</div></div>';
  return html;
}

/* ------------------------------------------------------------------ */
/*  Public: crossMeetingInsights                                       */
/* ------------------------------------------------------------------ */

/**
 * Analyze an array of note objects for cross-meeting patterns.
 * Each note: {title:string, text:string, date?:string}
 * @param {Array} notes - Array of note objects
 * @returns {{recurringTopics:string[], progression:Array, gaps:string[], summary:string}}
 */
function crossMeetingInsights(notes) {
  if (!notes || notes.length === 0) {
    return { recurringTopics: [], progression: [], gaps: [], summary: "No notes provided." };
  }

  // Build per-note keyword frequency maps
  var noteMaps = notes.map(function (n) {
    var words = _qTokenize(n.text || "");
    var tf = {};
    words.forEach(function (w) {
      if (!_QUIZ_STOP.has(w) && w.length > 3) tf[w] = (tf[w] || 0) + 1;
    });
    return { title: n.title || "Untitled", date: n.date || "", tf: tf };
  });

  // Count how many notes each term appears in
  var termNoteCount = {};
  noteMaps.forEach(function (nm) {
    Object.keys(nm.tf).forEach(function (t) {
      termNoteCount[t] = (termNoteCount[t] || 0) + 1;
    });
  });

  // Recurring: appears in 3+ notes (or 2+ if fewer than 3 notes)
  var threshold = notes.length < 3 ? 2 : 3;
  var recurringTopics = Object.keys(termNoteCount).filter(function (t) {
    return termNoteCount[t] >= threshold;
  }).sort(function (a, b) { return termNoteCount[b] - termNoteCount[a]; }).slice(0, 20);

  // Gaps: appeared only once across all notes
  var gaps = Object.keys(termNoteCount).filter(function (t) {
    return termNoteCount[t] === 1;
  });
  // Keep only "significant" gap terms — those with high frequency in their single note
  gaps = gaps.filter(function (t) {
    for (var i = 0; i < noteMaps.length; i++) {
      if (noteMaps[i].tf[t] && noteMaps[i].tf[t] >= 3) return true;
    }
    return false;
  }).slice(0, 15);

  // Progression: recurring topics with increasing frequency over time
  var progression = [];
  recurringTopics.slice(0, 10).forEach(function (topic) {
    var trend = noteMaps.map(function (nm, idx) {
      return { note: nm.title, index: idx, freq: nm.tf[topic] || 0 };
    }).filter(function (e) { return e.freq > 0; });

    if (trend.length >= 2) {
      var increasing = true;
      for (var i = 1; i < trend.length; i++) {
        if (trend[i].freq < trend[i - 1].freq) { increasing = false; break; }
      }
      if (increasing || trend[trend.length - 1].freq > trend[0].freq) {
        progression.push({ topic: topic, mentions: trend });
      }
    }
  });

  // Summary
  var summary = "Analyzed " + notes.length + " lecture(s). ";
  if (recurringTopics.length > 0) {
    summary += "Top recurring topics: " + recurringTopics.slice(0, 5).join(", ") + ". ";
  }
  if (progression.length > 0) {
    summary += progression.length + " topic(s) show increasing emphasis over time. ";
  }
  if (gaps.length > 0) {
    summary += gaps.length + " significant term(s) appeared in only one lecture and may need review.";
  }

  return {
    recurringTopics: recurringTopics,
    progression: progression,
    gaps: gaps,
    summary: summary
  };
}
