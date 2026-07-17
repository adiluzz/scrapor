"""Prompt templates for video event detection."""

from __future__ import annotations

DETECTION_RULES = """
Rules for every detection:
- Each clip must span 5–10 seconds of continuous moving video with visible action.
- Only detect segments with ongoing motion — not frozen frames, posters, thumbnails, title cards, or still images.
- Do NOT detect preroll ads, interstitial ads, sponsor cards, end cards, or full-screen promotional screens.
- Small corner watermarks/logos are fine to ignore — never treat them as the main subject.
- Prefer the most engaging action peaks in the actual scene footage.
"""


def chunk_time_scope(start_sec: float, duration_sec: float) -> str:
    """Absolute timeline note for models that see the full source video."""
    end = start_sec + duration_sec
    m1, s1 = divmod(int(start_sec), 60)
    m2, s2 = divmod(int(end), 60)
    return f"Only analyze the video between {m1}:{s1:02d} and {m2}:{s2:02d}."


def chunk_relative_scope(duration_sec: float) -> str:
    """Scope for models that only receive a cut chunk file (Nova S3 uploads)."""
    dur = max(1, int(duration_sec or 1))
    return (
        f"This video file is a clip lasting {dur} seconds. "
        f"Use timestamps relative to THIS file only (0 = start of file, max {dur})."
    )


def pegasus_detection_prompt(
    targets: list[str],
    learning_context: str,
    chunk_start: float,
    chunk_duration: float,
) -> str:
    target_list = "\n".join(f"- {t}" for t in targets)
    scope = chunk_time_scope(chunk_start, chunk_duration)
    return f"""{scope}

Detect every occurrence of these on-screen events in the video:
{target_list}

Return a JSON object with a "detections" array. Each item must have:
- label (string, matching one of the targets)
- startSec (number, seconds from video start)
- endSec (number, seconds from video start)
- confidence (number 0-1)

Only include clear visible occurrences. Merge nothing — list each distinct occurrence.

{DETECTION_RULES}

{learning_context}"""


def nova_detection_prompt(
    targets: list[str],
    learning_context: str,
    chunk_start: float,
    chunk_duration: float,
) -> str:
    # Nova receives cut chunk files, not the full source — never use absolute
    # source timestamps here (callers still pass chunk_start; parse adds it back).
    target_list = "\n".join(f'- "{t}"' for t in targets)
    scope = chunk_relative_scope(chunk_duration)
    return f"""{scope}

Detect every occurrence of these on-screen events:
{target_list}

For each hit include start/end seconds (relative to this file) and a bounding box
on a 0-1000 scale as four numbers [left, top, right, bottom].

Respond with ONLY valid JSON, for example:
{{"detections":[{{"label":"event name","startSec":12.5,"endSec":18.0,"confidence":0.9,"bbox":[100,120,800,900]}}]}}

If none found: {{"detections":[]}}
Only include clear visible occurrences. Merge nothing — list each distinct occurrence.

{DETECTION_RULES}

{learning_context}"""


DETECTION_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "detections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "startSec": {"type": "number"},
                    "endSec": {"type": "number"},
                    "confidence": {"type": "number"},
                    "bbox": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                },
                "required": ["label", "startSec", "endSec"],
            },
        },
    },
    "required": ["detections"],
}
