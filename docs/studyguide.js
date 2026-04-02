/**
 * studyguide.js — Pure JavaScript study guide generator
 * Extracts key points, terms, and questions from transcript text.
 * No dependencies. Loaded via <script> tag (all functions are window-global).
 */

// Common English stop words to filter out during analysis
const STOP_WORDS = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","need","dare","ought","used","to","of","in","for","on","with","at","by","from","as","into","through","during","before","after","above","below","between","but","and","or","nor","not","so","very","just","about","also","then","than","more","most","other","some","such","no","only","same","that","this","these","those","it","its","i","me","my","we","our","you","your","he","him","his","she","her","they","them","their","what","which","who","whom","when","where","how","all","each","every","both","few","many","much","any","if","because","until","while"]);

/**
 * Split text into an array of sentences.
 * Handles common abbreviations and decimal numbers to avoid false splits.
 */
function _splitSentences(text) {
  // Split on sentence-ending punctuation followed by whitespace and a capital letter
  var raw = text.replace(/([.!?])\s+(?=[A-Z])/g, "$1||SPLIT||").split("||SPLIT||");
  // Filter out empty or trivially short fragments
  return raw.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 10; });
}

/**
 * Tokenize text into lowercase words, stripping punctuation.
 */
function _tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9' -]/g, " ").split(/\s+/).filter(function (w) { return w.length > 0; });
}

/**
 * Build a term-frequency map for non-stop words.
 */
function _buildTF(words) {
  var tf = {};
  words.forEach(function (w) {
    if (!STOP_WORDS.has(w) && w.length > 2) {
      tf[w] = (tf[w] || 0) + 1;
    }
  });
  return tf;
}

/**
 * Split text into paragraphs (blocks separated by blank lines or double newlines).
 */
function _splitParagraphs(text) {
  return text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });
}

// ---------------------------------------------------------------------------
// 1. extractKeyPoints — extract top key sentences by scoring
// ---------------------------------------------------------------------------

/**
 * Extract the top N key sentences from the text.
 * Scoring uses TF weighting, position bonus, length preference, and keyword presence.
 *
 * @param {string} text  - The transcript text.
 * @param {number} count - How many key points to return (default 8).
 * @returns {string[]}   - Top sentences in their original order.
 */
function extractKeyPoints(text, count) {
  if (count === undefined) count = 8;

  var paragraphs = _splitParagraphs(text);
  var allSentences = _splitSentences(text);
  if (allSentences.length === 0) return [];

  // Build global term-frequency map
  var words = _tokenize(text);
  var tf = _buildTF(words);

  // Determine which sentences are first/last in their paragraph
  var firstLast = new Set();
  paragraphs.forEach(function (p) {
    var pSentences = _splitSentences(p);
    if (pSentences.length > 0) {
      firstLast.add(pSentences[0]);
      firstLast.add(pSentences[pSentences.length - 1]);
    }
  });

  // Score each sentence
  var scored = allSentences.map(function (sentence, idx) {
    var sWords = _tokenize(sentence);
    var score = 0;

    // TF score — sum of frequencies for non-stop words
    sWords.forEach(function (w) {
      if (tf[w]) score += tf[w];
    });

    // Position bonus — first/last sentences of paragraphs
    if (firstLast.has(sentence)) score *= 1.3;

    // Length preference — favour medium-length sentences (10-30 words)
    var len = sWords.length;
    if (len >= 10 && len <= 30) {
      score *= 1.2;
    } else if (len < 5 || len > 50) {
      score *= 0.6;
    }

    // Keyword presence — capitalized words or likely technical terms
    var caps = sentence.match(/\b[A-Z][a-z]{3,}\b/g);
    if (caps) score += caps.length * 2;
    // Bonus for acronyms (2+ uppercase letters)
    var acronyms = sentence.match(/\b[A-Z]{2,}\b/g);
    if (acronyms) score += acronyms.length * 3;

    return { sentence: sentence, score: score, index: idx };
  });

  // Sort by score descending, pick top N, then restore original order
  scored.sort(function (a, b) { return b.score - a.score; });
  var top = scored.slice(0, count);
  top.sort(function (a, b) { return a.index - b.index; });

  return top.map(function (item) { return item.sentence; });
}

// ---------------------------------------------------------------------------
// 2. extractKeyTerms — find important terms
// ---------------------------------------------------------------------------

/**
 * Find important terms in the text based on capitalisation, frequency, and length.
 *
 * @param {string} text  - The transcript text.
 * @param {number} count - How many terms to return (default 10).
 * @returns {Array<{term: string, frequency: number, context: string}>}
 */
function extractKeyTerms(text, count) {
  if (count === undefined) count = 10;

  var sentences = _splitSentences(text);
  var wordFreq = {};   // lowercase → count
  var originalForm = {};  // lowercase → first-seen original form
  var contextMap = {};    // lowercase → first sentence containing the term

  sentences.forEach(function (sentence) {
    // Match capitalised words, acronyms, and long words
    var tokens = sentence.match(/\b[A-Za-z][A-Za-z'-]*\b/g);
    if (!tokens) return;

    tokens.forEach(function (tok) {
      var lower = tok.toLowerCase();
      if (STOP_WORDS.has(lower)) return;
      if (lower.length <= 5) return;

      wordFreq[lower] = (wordFreq[lower] || 0) + 1;

      // Keep the capitalised form if available
      if (!originalForm[lower] || (tok[0] === tok[0].toUpperCase() && tok !== tok.toLowerCase())) {
        originalForm[lower] = tok;
      }
      if (!contextMap[lower]) {
        contextMap[lower] = sentence;
      }
    });
  });

  // Filter: must appear 3+ times, or be a capitalised/acronym term appearing 2+ times
  var candidates = Object.keys(wordFreq).filter(function (w) {
    var orig = originalForm[w] || w;
    var isCap = orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase();
    if (wordFreq[w] >= 3) return true;
    if (isCap && wordFreq[w] >= 2) return true;
    return false;
  });

  // Sort by frequency descending
  candidates.sort(function (a, b) { return wordFreq[b] - wordFreq[a]; });

  return candidates.slice(0, count).map(function (w) {
    return {
      term: originalForm[w] || w,
      frequency: wordFreq[w],
      context: contextMap[w] || ""
    };
  });
}

// ---------------------------------------------------------------------------
// 3. generateQuestions — create study questions from key sentences
// ---------------------------------------------------------------------------

/**
 * Generate study questions by transforming factual sentences.
 *
 * @param {string} text  - The transcript text.
 * @param {number} count - How many questions to generate (default 5).
 * @returns {string[]}   - Array of question strings.
 */
function generateQuestions(text, count) {
  if (count === undefined) count = 5;

  var sentences = _splitSentences(text);
  var questions = [];

  sentences.forEach(function (s) {
    if (questions.length >= count * 3) return; // gather extra candidates, trim later

    // Pattern: "X is Y" or "X are Y" — turn into "What is X?"
    var defMatch = s.match(/^([A-Z][^,]{3,40})\s+(is|are)\s+/);
    if (defMatch) {
      questions.push("What " + defMatch[2] + " " + defMatch[1].trim() + "?");
      return;
    }

    // Pattern: year reference — "In YYYY, ..."
    var yearMatch = s.match(/[Ii]n\s+(1[0-9]{3}|2[0-9]{3}),?\s+(.+)/);
    if (yearMatch) {
      questions.push("What happened in " + yearMatch[1] + "?");
      return;
    }

    // Pattern: "because" — why question
    var becauseMatch = s.match(/(.+?)\s+because\s+/i);
    if (becauseMatch) {
      var subject = becauseMatch[1].replace(/^(the|a|an)\s+/i, "").trim();
      questions.push("Why " + subject.charAt(0).toLowerCase() + subject.slice(1) + "?");
      return;
    }

    // Pattern: "three types" / "four kinds" / lists
    var listMatch = s.match(/(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(types?|kinds?|categories|forms?|stages?|steps?|components?|elements?|parts?|factors?)\s+of\s+([^.!?]+)/i);
    if (listMatch) {
      questions.push("What are the " + listMatch[2] + " of " + listMatch[3].trim() + "?");
      return;
    }

    // Pattern: sentence with a number or date (likely a key fact)
    if (/\b\d{2,}\b/.test(s) && s.length > 30 && s.length < 200) {
      // Generic factual question
      var firstClause = s.split(/[,;]/)[0].trim();
      if (firstClause.length > 15) {
        questions.push("Explain the significance of: " + firstClause + ".");
      }
    }
  });

  // Deduplicate and trim to requested count
  var seen = new Set();
  var unique = questions.filter(function (q) {
    var key = q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, count);
}

// ---------------------------------------------------------------------------
// 4. formatStudyGuide — render all sections as a markdown string
// ---------------------------------------------------------------------------

/**
 * Format key points, terms, and questions into a clean markdown study guide.
 *
 * @param {string}   title     - Guide title.
 * @param {string[]} keyPoints - Array of key point sentences.
 * @param {Array}    keyTerms  - Array of {term, frequency, context} objects.
 * @param {string[]} questions - Array of question strings.
 * @returns {string} Formatted markdown string.
 */
function formatStudyGuide(title, keyPoints, keyTerms, questions) {
  var lines = [];

  // Title
  lines.push("# " + (title || "Study Guide"));
  lines.push("");

  // Key Points
  lines.push("## Key Points");
  lines.push("");
  keyPoints.forEach(function (point) {
    lines.push("- " + point);
  });
  lines.push("");

  // Key Concepts / Terms
  lines.push("## Key Concepts & Definitions");
  lines.push("");
  keyTerms.forEach(function (entry, i) {
    lines.push((i + 1) + ". **" + entry.term + "** (mentioned " + entry.frequency + " times)");
    lines.push("   _Context:_ " + entry.context);
    lines.push("");
  });

  // Study Questions
  lines.push("## Study Questions");
  lines.push("");
  questions.forEach(function (q, i) {
    lines.push((i + 1) + ". " + q);
  });
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 5. generateStudyGuide — main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a complete study guide from transcript text.
 *
 * @param {string} text  - Clean transcript text.
 * @param {string} title - Optional title for the guide.
 * @returns {string} Formatted markdown study guide.
 */
function generateStudyGuide(text, title) {
  if (!text || text.trim().length === 0) return "# Study Guide\n\n_No content provided._\n";

  var guideTitle = title || "Study Guide";
  var keyPoints = extractKeyPoints(text, 8);
  var keyTerms = extractKeyTerms(text, 10);
  var questions = generateQuestions(text, 5);

  // If extraction produced very few questions, add a generic prompt
  if (questions.length === 0) {
    questions.push("What are the main ideas discussed in this material?");
    questions.push("How do the key concepts relate to each other?");
    questions.push("What are the most important takeaways?");
  }

  return formatStudyGuide(guideTitle, keyPoints, keyTerms, questions);
}

// ---------------------------------------------------------------------------
// 6. summarizeForAI — prepare transcript for LLM summarisation
// ---------------------------------------------------------------------------

/**
 * Format transcript text optimally for passing to an LLM.
 * Strips noise, adds structural markers, and truncates to 4000 words.
 *
 * @param {string} text - Raw transcript text.
 * @returns {string} Cleaned and prefixed prompt string.
 */
function summarizeForAI(text) {
  if (!text || text.trim().length === 0) return "";

  // Strip filler words and noise patterns common in transcripts
  var cleaned = text
    .replace(/\b(um|uh|erm|ah|like,?\s)/gi, "")   // filler words
    .replace(/\s{2,}/g, " ")                        // collapse whitespace
    .replace(/(.)\1{3,}/g, "$1$1")                  // collapse repeated chars
    .trim();

  // Add paragraph markers — split on double newlines and number them
  var paragraphs = _splitParagraphs(cleaned);
  var structured = paragraphs.map(function (p, i) {
    return "[Section " + (i + 1) + "]\n" + p.trim();
  }).join("\n\n");

  // Truncate to 4000 words if needed
  var words = structured.split(/\s+/);
  if (words.length > 4000) {
    structured = words.slice(0, 4000).join(" ") + "\n\n[Truncated — original exceeded 4000 words]";
  }

  // Prefix with instruction for the LLM
  var prompt = "The following is a lecture transcript. Summarize the key concepts:\n\n" + structured;

  return prompt;
}
