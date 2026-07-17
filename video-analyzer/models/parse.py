"""Shared detection parsing utilities."""

from __future__ import annotations

import json
import re
from typing import Any

from models.registry import Detection


def _norm_bbox(bbox: list[float] | None) -> tuple[float | None, float | None, float | None, float | None]:
    if not bbox or len(bbox) < 4:
        return None, None, None, None
    x1, y1, x2, y2 = bbox[:4]
    # Nova uses 0-1000 scale
    if max(bbox) > 1.5:
        x1, y1, x2, y2 = (v / 1000.0 for v in bbox[:4])
    w = max(0.0, x2 - x1)
    h = max(0.0, y2 - y1)
    return x1, y1, w, h


def parse_detections_json(raw: str, chunk_offset: float = 0.0) -> list[Detection]:
    text = raw.strip()
    # Extract JSON object if wrapped in markdown
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            text = brace.group(0)

    data = json.loads(text)
    items = data.get("detections") or data.get("segments") or []
    if isinstance(data, list):
        items = data

    out: list[Detection] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("id") or "").strip()
        if not label:
            continue
        start = float(item.get("startSec") or item.get("start_sec") or item.get("start_time") or 0)
        end = float(item.get("endSec") or item.get("end_sec") or item.get("end_time") or start + 7)
        conf = item.get("confidence")
        confidence = float(conf) if conf is not None else None
        bbox = item.get("bbox")
        sx, sy, sw, sh = _norm_bbox(bbox if isinstance(bbox, list) else None)
        out.append(Detection(
            label=label,
            start_sec=chunk_offset + start,
            end_sec=chunk_offset + end,
            confidence=confidence,
            screen_x=sx,
            screen_y=sy,
            screen_w=sw,
            screen_h=sh,
            frame_sec=chunk_offset + (start + end) / 2,
        ))
    return out


def parse_segments_response(segments: list[dict[str, Any]], targets: list[str], chunk_offset: float) -> list[Detection]:
    """Parse TwelveLabs Pegasus 1.5 segment_definitions output."""
    out: list[Detection] = []
    target_lower = {t.lower(): t for t in targets}
    for seg in segments:
        seg_id = str(seg.get("id") or seg.get("segment_id") or "").lower()
        start = float(seg.get("start_time") or seg.get("start") or 0)
        end = float(seg.get("end_time") or seg.get("end") or start + 7)
        fields = seg.get("fields") or seg
        label = None
        for t_lower, t_orig in target_lower.items():
            if t_lower in seg_id or any(t_lower in str(v).lower() for v in fields.values() if v):
                label = t_orig
                break
        if not label:
            for t_lower, t_orig in target_lower.items():
                if fields.get("event") and t_lower in str(fields.get("event")).lower():
                    label = t_orig
                    break
        if not label and targets:
            label = targets[0]
        conf_raw = fields.get("confidence")
        out.append(Detection(
            label=label or "unknown",
            start_sec=chunk_offset + start,
            end_sec=chunk_offset + end,
            confidence=float(conf_raw) if conf_raw is not None else None,
            frame_sec=chunk_offset + (start + end) / 2,
        ))
    return out
