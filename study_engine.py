"""
study_engine.py — AI-powered study features using Groq (free tier).

Uses the Groq API (free) with Llama 3 to transform raw Whisper-generated notes
into structured summaries, study guides, compiled multi-day notes, and quizzes.

Get a free API key at: https://console.groq.com
"""

import hashlib
import json
import logging
import os
from typing import Any

from groq import Groq, AuthenticationError, RateLimitError, BadRequestError, APIStatusError, APIConnectionError

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

MODEL = "llama-3.3-70b-versatile"  # Free tier, very capable

_client: "Groq | None" = None


def _get_client() -> "Groq":
    """Lazily initialize the Groq client so missing key only errors at call time."""
    global _client
    if _client is None:
        _client = Groq()  # reads GROQ_API_KEY from env
    return _client

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------

_cache: dict[str, Any] = {}


def _cache_key(text: str, func_name: str) -> str:
    """Return a stable cache key for the given text and function name."""
    return f"{func_name}:{hashlib.md5(text.encode()).hexdigest()}"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _call_groq(
    *,
    system: str,
    user_content: str,
    func_name: str,
    cache_key_text: str,
    max_tokens: int = 4096,
) -> str:
    """
    Make a single Groq API call with caching and error handling.

    Returns the text response, or a fallback error string on failure.
    """
    key = _cache_key(cache_key_text, func_name)
    if key in _cache:
        logger.info("Cache hit for %s (key=%s)", func_name, key[:32])
        return _cache[key]

    logger.info("Calling Groq for %s (model=%s)", func_name, MODEL)
    try:
        response = _get_client().chat.completions.create(
            model=MODEL,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
        )

        result = response.choices[0].message.content or ""
        logger.info(
            "%s complete — input_tokens=%d output_tokens=%d",
            func_name,
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
        )
        _cache[key] = result
        return result

    except AuthenticationError:
        logger.error("Authentication failed — check GROQ_API_KEY")
        return "[Error] Authentication failed. Please verify your GROQ_API_KEY in the .env file."
    except RateLimitError:
        logger.warning("Rate limit hit for %s", func_name)
        return "[Error] Rate limit reached. Please retry after a short wait."
    except BadRequestError as exc:
        logger.error("Bad request in %s: %s", func_name, exc)
        return f"[Error] Invalid request: {exc}"
    except APIStatusError as exc:
        logger.error("API error in %s: status=%d msg=%s", func_name, exc.status_code, exc)
        return f"[Error] API error ({exc.status_code}). Please try again later."
    except APIConnectionError:
        logger.error("Network error in %s", func_name)
        return "[Error] Network connection failed. Check your internet connection."


# ---------------------------------------------------------------------------
# 1. generate_structured_summary
# ---------------------------------------------------------------------------

_SUMMARY_SYSTEM = (
    "You are an expert study assistant. Transform raw notes into a clean, structured "
    "summary for studying. Be concise, avoid fluff, use clear headers and bullets."
)

_SUMMARY_PROMPT_TEMPLATE = """\
Transform the following raw notes into a structured markdown summary using exactly this format:

# [Auto-generated title based on topic]

## Overview
- 2-3 sentence high-level summary

## Key Concepts
- Concept 1: explanation
- Concept 2: explanation
...

## Important Details
- Supporting bullets

## Connections / Insights
- Patterns, relationships, takeaways

## Quick Review
- Short bullet recap for fast studying

---
Raw notes:
{notes_text}
"""


def generate_structured_summary(notes_text: str) -> str:
    """
    Transform raw notes text into a clean, structured markdown summary.

    Args:
        notes_text: Raw transcript-based notes as a plain string.

    Returns:
        Structured markdown summary string, or an error message string on failure.
    """
    if not notes_text or not notes_text.strip():
        logger.warning("generate_structured_summary called with empty notes")
        return "[Error] No notes provided."

    return _call_groq(
        system=_SUMMARY_SYSTEM,
        user_content=_SUMMARY_PROMPT_TEMPLATE.format(notes_text=notes_text),
        func_name="generate_structured_summary",
        cache_key_text=notes_text,
        max_tokens=4096,
    )


# ---------------------------------------------------------------------------
# 2. generate_study_guide
# ---------------------------------------------------------------------------

_STUDY_GUIDE_SYSTEM = (
    "You are an expert study assistant. Create comprehensive, exam-ready study guides "
    "from raw notes. Include key terms, practice questions, and memory aids."
)

_STUDY_GUIDE_PROMPT_TEMPLATE = """\
Using the structured summary below, produce a complete study guide in exactly this format:

# Study Guide

## Summary
{structured_summary}

## Key Terms
- Term: definition
...

## Practice Questions
- Question 1
- Question 2
...

## Memory Aids
- Tips, mnemonics, or simplifications to remember the material
...
"""


def generate_study_guide(notes_text: str) -> str:
    """
    Produce a comprehensive study guide from raw notes.

    Internally calls generate_structured_summary to build the Summary section,
    then asks Groq to add Key Terms, Practice Questions, and Memory Aids.

    Args:
        notes_text: Raw transcript-based notes as a plain string.

    Returns:
        Structured study guide markdown string, or an error message string on failure.
    """
    if not notes_text or not notes_text.strip():
        logger.warning("generate_study_guide called with empty notes")
        return "[Error] No notes provided."

    logger.info("Generating structured summary for study guide...")
    structured_summary = generate_structured_summary(notes_text)
    if structured_summary.startswith("[Error]"):
        logger.error("Summary generation failed; cannot produce study guide")
        return structured_summary

    user_content = _STUDY_GUIDE_PROMPT_TEMPLATE.format(
        structured_summary=structured_summary
    )

    cache_key_text = notes_text + structured_summary

    return _call_groq(
        system=_STUDY_GUIDE_SYSTEM,
        user_content=user_content,
        func_name="generate_study_guide",
        cache_key_text=cache_key_text,
        max_tokens=6144,
    )


# ---------------------------------------------------------------------------
# 3. compile_notes
# ---------------------------------------------------------------------------

_COMPILE_SYSTEM = (
    "You are an expert study assistant. Merge multiple days of notes into one cohesive "
    "document. Remove redundancy, organize by theme, preserve all important information."
)

_COMPILE_PROMPT_TEMPLATE = """\
Merge the following multi-day notes into a single, cohesive reference document \
using exactly this format:

# Compiled Notes

## Major Themes
- Theme-based grouping across days

## Consolidated Concepts
- Clean, merged explanations (no redundancy)

## Key Takeaways
- High-value summary bullets

## Gaps / Missing Info
- Unclear, contradictory, or weakly covered areas

---
Notes by date:

{dated_notes}
"""


def compile_notes(notes_list: list[dict]) -> str:
    """
    Merge multiple days of notes into one cohesive compiled document.

    Args:
        notes_list: List of dicts, each with "date" (str) and "content" (str) keys.

    Returns:
        Compiled markdown notes string, or an error message string on failure.
    """
    if not notes_list:
        logger.warning("compile_notes called with empty list")
        return "[Error] No notes provided."

    dated_sections: list[str] = []
    for entry in notes_list:
        date = entry.get("date", "Unknown date")
        content = entry.get("content", "").strip()
        if content:
            dated_sections.append(f"### {date}\n{content}")

    if not dated_sections:
        logger.warning("compile_notes: all entries had empty content")
        return "[Error] All provided notes were empty."

    dated_notes = "\n\n".join(dated_sections)
    cache_key_text = dated_notes

    return _call_groq(
        system=_COMPILE_SYSTEM,
        user_content=_COMPILE_PROMPT_TEMPLATE.format(dated_notes=dated_notes),
        func_name="compile_notes",
        cache_key_text=cache_key_text,
        max_tokens=6144,
    )


# ---------------------------------------------------------------------------
# 4. generate_quiz
# ---------------------------------------------------------------------------

_QUIZ_SYSTEM = (
    "You are an expert quiz designer and study assistant. Generate mixed-format quiz "
    "questions from study notes. Always respond with valid JSON only — no prose, no "
    "markdown fences, no explanation outside the JSON structure."
)

_QUIZ_PROMPT_TEMPLATE = """\
Generate a quiz of 5–10 mixed questions (multiple choice, short answer, and concept \
explanation) based on the notes below.

Return ONLY a JSON object with this exact structure — no other text:

{{
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "explanation": "..."
    }},
    {{
      "id": 2,
      "type": "short_answer",
      "question": "...",
      "options": null,
      "answer": "full answer text",
      "explanation": "..."
    }},
    {{
      "id": 3,
      "type": "concept",
      "question": "Explain the concept of ...",
      "options": null,
      "answer": "full explanation",
      "explanation": "..."
    }}
  ]
}}

Rules:
- Include at least 2 multiple_choice, 2 short_answer, and 1 concept question.
- For multiple_choice: "options" is a list of 4 strings; "answer" is the letter only (A/B/C/D).
- For short_answer and concept: "options" is null; "answer" is a complete text answer.
- Every question must have an "explanation" field.

Notes:
{notes_text}
"""

_QUIZ_FALLBACK: dict = {
    "questions": [
        {
            "id": 1,
            "type": "short_answer",
            "question": "Quiz generation failed. Please review your notes manually.",
            "options": None,
            "answer": "N/A",
            "explanation": "An error occurred while contacting the AI service.",
        }
    ]
}


def generate_quiz(notes_text: str) -> dict:
    """
    Generate a mixed-format quiz from raw notes.

    Args:
        notes_text: Raw transcript-based notes as a plain string.

    Returns:
        Dict with a "questions" key containing a list of question dicts.
    """
    if not notes_text or not notes_text.strip():
        logger.warning("generate_quiz called with empty notes")
        return {
            "questions": [
                {
                    "id": 1,
                    "type": "short_answer",
                    "question": "No notes were provided.",
                    "options": None,
                    "answer": "N/A",
                    "explanation": "Please supply notes to generate a quiz.",
                }
            ]
        }

    key = _cache_key(notes_text, "generate_quiz")
    if key in _cache:
        logger.info("Cache hit for generate_quiz (key=%s)", key[:32])
        return _cache[key]

    logger.info("Calling Groq for generate_quiz (model=%s)", MODEL)
    try:
        response = _get_client().chat.completions.create(
            model=MODEL,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": _QUIZ_SYSTEM},
                {
                    "role": "user",
                    "content": _QUIZ_PROMPT_TEMPLATE.format(notes_text=notes_text),
                },
            ],
        )

        raw_text = (response.choices[0].message.content or "").strip()

        logger.info(
            "generate_quiz complete — input_tokens=%d output_tokens=%d",
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
        )

        # Strip optional markdown fences the model might include.
        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            inner_lines = lines[1:-1] if lines[-1].startswith("```") else lines[1:]
            raw_text = "\n".join(inner_lines).strip()

        quiz_dict = json.loads(raw_text)

        if "questions" not in quiz_dict or not isinstance(quiz_dict["questions"], list):
            raise ValueError("Response missing 'questions' list")

        logger.info("Parsed %d quiz questions", len(quiz_dict["questions"]))
        _cache[key] = quiz_dict
        return quiz_dict

    except json.JSONDecodeError as exc:
        logger.error("generate_quiz: JSON parse error — %s", exc)
        return _QUIZ_FALLBACK.copy()
    except ValueError as exc:
        logger.error("generate_quiz: unexpected structure — %s", exc)
        return _QUIZ_FALLBACK.copy()
    except AuthenticationError:
        logger.error("Authentication failed — check GROQ_API_KEY")
        return _QUIZ_FALLBACK.copy()
    except RateLimitError:
        logger.warning("Rate limit hit for generate_quiz")
        return _QUIZ_FALLBACK.copy()
    except BadRequestError as exc:
        logger.error("Bad request in generate_quiz: %s", exc)
        return _QUIZ_FALLBACK.copy()
    except APIStatusError as exc:
        logger.error("API error in generate_quiz: status=%d msg=%s", exc.status_code, exc)
        return _QUIZ_FALLBACK.copy()
    except APIConnectionError:
        logger.error("Network error in generate_quiz")
        return _QUIZ_FALLBACK.copy()
