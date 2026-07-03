"""Prompt templates for video event detection."""

from __future__ import annotations


def chunk_time_scope(start_sec: float, duration_sec: float) -> str:
    end = start_sec + duration_sec
    m1, s1 = divmod(int(start_sec), 60)
    m2, s2 = divmod(int(end), 60)
    return f"Only analyze the video between {m1}:{s1:02d} and {m2}:{s2:02d}."


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

{learning_context}"""


def nova_detection_prompt(
    targets: list[str],
    learning_context: str,
    chunk_start: float,
    chunk_duration: float,
) -> str:
    target_list = "\n".join(f'- "{t}"' for t in targets)
    scope = chunk_time_scope(chunk_start, chunk_duration)
    return f"""{scope}

For each target event below, find ALL occurrences in the video with start/end times in seconds
and a normalized bounding box on 0-1000 scale [x1,y1,x2,y2] around the action.

Targets:
{target_list}

Respond with ONLY valid JSON:
{{
  "detections": [
    {{
      "label": "event name",
      "startSec": 12.5,
      "endSec": 18.0,
      "confidence": 0.9,
      "bbox": [x1, y1, x2, y2]
    }}
  ]
}}

If no events found, return {{"detections": []}}.

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
