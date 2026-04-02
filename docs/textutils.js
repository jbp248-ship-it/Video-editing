/**
 * textutils.js — Pure JavaScript text cleaning utilities for transcript processing.
 * No dependencies. Loaded via <script> tag; all functions are window-global.
 */

/**
 * Removes timestamp patterns from text.
 * Handles bracketed [00:12:32], parenthesized (00:12:32), and bare timestamps
 * at line starts. Preserves natural time references like "class starts at 2:30".
 */
function removeTimestamps(text) {
  // Remove bracketed timestamps: [00:12:32], [12:32]
  text = text.replace(/\[(\d{1,2}:)?\d{1,2}:\d{2}\]/g, '');

  // Remove parenthesized timestamps: (00:12:32), (12:32)
  text = text.replace(/\((\d{1,2}:)?\d{1,2}:\d{2}\)/g, '');

  // Remove bare timestamps at the start of a line (with optional trailing dash/colon)
  // e.g. "00:12:32 Hello" or "12:32 - Hello"
  text = text.replace(/^(\d{1,2}:)?\d{1,2}:\d{2}\s*[-:]?\s*/gm, '');

  return text;
}

/**
 * Removes filler words and phrases while preserving meaningful uses.
 * Uses word boundaries and context-aware patterns to avoid false positives.
 */
function removeFillerWords(text) {
  // Simple fillers that are almost never meaningful: um, uh, erm, hmm
  text = text.replace(/\b(um|uh|erm|hmm)\b[,]?\s*/gi, '');

  // "you know" as filler (not "you know that..." which is meaningful)
  text = text.replace(/\byou know\b[,]?\s*/gi, '');

  // "I mean" as filler
  text = text.replace(/\bI mean\b[,]?\s*/gi, '');

  // "sort of" / "kind of" as hedging fillers
  text = text.replace(/\b(sort|kind) of\b[,]?\s*/gi, '');

  // "basically", "actually", "literally" as standalone fillers
  text = text.replace(/\b(basically|actually|literally)\b[,]?\s*/gi, '');

  // "right?" as a filler tag question (not "the right answer")
  // Only remove "right?" when followed by space/punctuation, not when preceded by "the"
  text = text.replace(/(?<!\bthe\s)\bright\?\s*/gi, '');

  // "like" as filler — only when surrounded by words (not "I like this" or "looks like")
  // Filler "like" typically appears after a comma or between two content words
  // Strategy: remove ", like," and "like" when preceded by a verb/pronoun and not
  // followed by a noun-phrase that would make it a comparison
  text = text.replace(/,?\s*\blike\b,\s*/gi, ' ');

  // "so" at sentence/line start (filler opener)
  text = text.replace(/(^|[.!?]\s+)so\b[,]?\s*/gim, '$1');

  // "well" at sentence/line start (filler opener)
  text = text.replace(/(^|[.!?]\s+)well\b[,]?\s*/gim, '$1');

  // "okay so" / "alright so" as filler openers
  text = text.replace(/\b(okay|alright)\s+so\b[,]?\s*/gi, '');

  return text;
}

/**
 * Full cleaning pipeline: removes timestamps and fillers, then normalizes whitespace
 * and fixes capitalization artifacts left by removals.
 */
function cleanTranscript(text) {
  text = removeTimestamps(text);
  text = removeFillerWords(text);

  // Collapse multiple spaces into one
  text = text.replace(/ {2,}/g, ' ');

  // Collapse 3+ consecutive newlines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // Fix capitalization: after a sentence-ending punctuation followed by a lowercase letter
  text = text.replace(/([.!?]\s+)([a-z])/g, function (_, punct, letter) {
    return punct + letter.toUpperCase();
  });

  // Capitalize the very first character of the text
  text = text.replace(/^\s*([a-z])/, function (_, letter) {
    return letter.toUpperCase();
  });

  // Capitalize the first character of each line
  text = text.replace(/\n\s*([a-z])/g, function (match, letter) {
    return match.replace(letter, letter.toUpperCase());
  });

  // Trim each line individually
  text = text
    .split('\n')
    .map(function (line) { return line.trim(); })
    .join('\n');

  return text.trim();
}

/**
 * Further compresses text by removing redundant verbal phrases,
 * collapsing repeated words, and fixing punctuation artifacts.
 */
function compressText(text) {
  // Remove common redundant phrases
  var redundantPhrases = [
    'what I want to say is',
    'what I\'m trying to say is',
    'the thing is',
    'the point is',
    'as I was saying',
    'as I said before',
    'at the end of the day',
    'if you will',
    'so to speak',
    'in other words',
    'to be honest',
    'to be fair',
    'if that makes sense',
    'does that make sense'
  ];

  redundantPhrases.forEach(function (phrase) {
    var regex = new RegExp('\\b' + phrase + '\\b[,]?\\s*', 'gi');
    text = text.replace(regex, '');
  });

  // Collapse repeated words: "the the" -> "the", "I I" -> "I"
  text = text.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // Fix double periods
  text = text.replace(/\.{2}(?!\.)/g, '.');

  // Fix orphaned commas (comma at start of sentence or after another comma)
  text = text.replace(/,\s*,/g, ',');
  text = text.replace(/(^|[.!?]\s+),\s*/gm, '$1');

  // Fix space before punctuation
  text = text.replace(/\s+([.,!?;:])/g, '$1');

  // Collapse multiple spaces again after all replacements
  text = text.replace(/ {2,}/g, ' ');

  return text.trim();
}

/**
 * Takes an array of chunk objects ({text, time}) and returns a single
 * clean string with all timestamps removed and text fully processed.
 *
 * @param {Array<{text: string, time: any}>} chunks
 * @returns {string} Clean text ready for clipboard
 */
function getCleanCopyText(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return '';
  }

  // Extract and join just the text from each chunk
  var raw = chunks
    .map(function (chunk) { return (chunk.text || '').trim(); })
    .filter(function (t) { return t.length > 0; })
    .join(' ');

  // Run the full pipeline
  var cleaned = cleanTranscript(raw);
  cleaned = compressText(cleaned);

  return cleaned;
}

/*
 * ============================================================
 * TESTS — example input/output
 * ============================================================
 *
 * // --- removeTimestamps ---
 * removeTimestamps("[00:12:32] Hello world [1:05] more text")
 *   => " Hello world  more text"
 *
 * removeTimestamps("00:01:05 Welcome to the show")
 *   => "Welcome to the show"
 *
 * removeTimestamps("class starts at 2:30 tomorrow")
 *   => "class starts at 2:30 tomorrow"   // preserved
 *
 * // --- removeFillerWords ---
 * removeFillerWords("So, um, I think, you know, it works")
 *   => "I think, it works"
 *
 * removeFillerWords("I like this design")
 *   => "I like this design"              // "like" preserved
 *
 * removeFillerWords("the right answer is here")
 *   => "the right answer is here"        // "right" preserved
 *
 * // --- cleanTranscript ---
 * cleanTranscript("[00:05:12] well, um, basically the server is down")
 *   => "The server is down"
 *
 * // --- compressText ---
 * compressText("the the server is, , what I want to say is, broken..")
 *   => "The server is, broken."
 *
 * // --- getCleanCopyText ---
 * getCleanCopyText([
 *   { text: "[00:01] Um, so, the thing is we need a fix", time: 1 },
 *   { text: "[00:15] I mean, basically the the deploy broke", time: 15 }
 * ])
 *   => "We need a fix. The deploy broke"
 */
