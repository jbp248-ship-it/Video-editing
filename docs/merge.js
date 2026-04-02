// merge.js — Pure JS transcript merging utilities (no dependencies, loaded via script tag)

// Common English stop words excluded from topic grouping
var STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'is','it','this','that','was','are','be','has','had','have','will',
  'can','do','does','did','not','no','so','if','by','from','as','we',
  'he','she','they','i','you','my','your','its','our','their','me',
  'him','her','us','them','been','being','would','could','should',
  'may','might','shall','about','up','out','just','also','than','then',
  'very','all','any','each','more','some','such','into','over','after'
]);

/**
 * Compute Jaccard similarity between two strings.
 * Splits into lowercase word sets, returns |intersection| / |union|.
 */
function jaccardSimilarity(str1, str2) {
  var words1 = new Set(str1.toLowerCase().trim().split(/\s+/).filter(Boolean));
  var words2 = new Set(str2.toLowerCase().trim().split(/\s+/).filter(Boolean));

  var intersection = 0;
  words1.forEach(function (w) {
    if (words2.has(w)) intersection++;
  });

  var union = new Set([].concat(Array.from(words1), Array.from(words2))).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Remove duplicate or near-duplicate sentences from text.
 * Uses Jaccard similarity with an 85% threshold.
 */
function deduplicateSentences(text) {
  // Split on sentence-ending punctuation, keeping the delimiter
  var sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return text;

  var kept = [];

  sentences.forEach(function (sentence) {
    var trimmed = sentence.trim();
    if (!trimmed) return;

    // Check against all previously kept sentences
    var isDuplicate = kept.some(function (prev) {
      return jaccardSimilarity(trimmed, prev) > 0.85;
    });

    if (!isDuplicate) {
      kept.push(trimmed);
    }
  });

  return kept.join(' ');
}

/**
 * Merge an array of note objects into a single deduplicated transcript.
 * Each note: { transcript, chunks, title, date, course }
 * Returns: { mergedText, sectionHeaders, wordCount }
 */
function mergeTranscripts(transcripts) {
  // Sort chronologically by date
  var sorted = transcripts.slice().sort(function (a, b) {
    return new Date(a.date) - new Date(b.date);
  });

  var sectionHeaders = [];
  var parts = [];

  sorted.forEach(function (note) {
    // Build a section header from available metadata
    var header = '## ' + (note.title || 'Untitled');
    if (note.date) header += ' (' + note.date + ')';
    if (note.course) header += ' - ' + note.course;

    sectionHeaders.push(header);
    parts.push(header + '\n\n' + (note.transcript || ''));
  });

  var combined = parts.join('\n\n');
  var mergedText = deduplicateSentences(combined);
  var wordCount = mergedText.split(/\s+/).filter(Boolean).length;

  return {
    mergedText: mergedText,
    sectionHeaders: sectionHeaders,
    wordCount: wordCount
  };
}

/**
 * Group sentences by shared keyword overlap.
 * Sentences sharing 3+ meaningful (non-stop) words are placed together.
 * Returns an array of groups, each group being an array of sentences.
 */
function groupByTopic(sentences) {
  // Extract meaningful words for a sentence
  function keywords(sentence) {
    return sentence.toLowerCase().split(/\s+/).filter(function (w) {
      return w.length > 2 && !STOP_WORDS.has(w);
    });
  }

  // Track which group index each sentence belongs to
  var groups = [];
  var assigned = [];

  sentences.forEach(function (sentence, i) {
    if (assigned[i]) return;

    var group = [sentence];
    var kw = new Set(keywords(sentence));
    assigned[i] = true;

    // Find all unassigned sentences sharing 3+ keywords
    sentences.forEach(function (other, j) {
      if (i === j || assigned[j]) return;

      var otherKw = keywords(other);
      var shared = otherKw.filter(function (w) { return kw.has(w); }).length;

      if (shared >= 3) {
        group.push(other);
        assigned[j] = true;
      }
    });

    groups.push(group);
  });

  return groups;
}

/**
 * High-level function: build a clean master transcript from notes.
 * options: { deduplicate: true, groupByTopic: false, includeHeaders: true }
 */
function buildMasterTranscript(notes, options) {
  var opts = Object.assign(
    { deduplicate: true, groupByTopic: false, includeHeaders: true },
    options || {}
  );

  // Merge and optionally deduplicate
  var result = mergeTranscripts(notes);
  var text = result.mergedText;

  // Optionally regroup by topic
  if (opts.groupByTopic) {
    var sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    var groups = groupByTopic(sentences.map(function (s) { return s.trim(); }));

    text = groups.map(function (group, idx) {
      var header = opts.includeHeaders ? '### Topic ' + (idx + 1) + '\n\n' : '';
      return header + group.join(' ');
    }).join('\n\n');
  } else if (opts.includeHeaders) {
    // Headers are already embedded in the merged text
    text = result.mergedText;
  }

  return text;
}
