"""Post-detection filters for video-editor highlight runs."""

from __future__ import annotations

import re

from models.registry import Detection

MIN_CLIP_SEC = 5.0
MAX_CLIP_SEC = 10.0
IDEAL_CLIP_SEC = 7.0

_AD_LABEL_RE = re.compile(
    r"\b(ad|ads|advert|advertisement|promo|promotional|sponsor|sponsored|"
    r"interstitial|preroll|pre-roll|commercial|end[\s-]?card|title[\s-]?card|"
    r"cta|call[\s-]?to[\s-]?action|banner[\s-]?ad|overlay[\s-]?ad|"
    r"full[\s-]?screen[\s-]?ad)\b",
    re.I,
)
_STILL_LABEL_RE = re.compile(
    r"\b(still|static|freeze|frozen|photo|photograph|image|poster|thumbnail|"
    r"screenshot|slide|slideshow|wallpaper|text[\s-]?screen|loading[\s-]?screen|"
    r"splash[\s-]?screen|black[\s-]?screen|countdown)\b",
    re.I,
)
_GENERIC_HIGHLIGHT_RE = re.compile(
    r"\b(highlight|best moment|action peak|engaging moment|compelling moment|visual moment)\b",
    re.I,
)


def _is_likely_watermark(sw: float | None, sh: float | None) -> bool:
    if sw is None or sh is None:
        return False
    area = sw * sh
    return 0 < area <= 0.22 and (sw <= 0.4 or sh <= 0.4)


def _is_fullscreen_region(sw: float | None, sh: float | None) -> bool:
    if sw is None or sh is None:
        return False
    area = sw * sh
    return area >= 0.68 or (sw >= 0.82 and sh >= 0.82)


def should_reject_detection(det: Detection) -> bool:
    label = (det.label or "").strip()
    if not label:
        return True

    if _AD_LABEL_RE.search(label) or _STILL_LABEL_RE.search(label):
        return True

    full = _is_fullscreen_region(det.screen_w, det.screen_h)
    watermark = _is_likely_watermark(det.screen_w, det.screen_h)

    if full and not watermark and det.start_sec < 20:
        return True
    if full and not watermark and _GENERIC_HIGHLIGHT_RE.search(label):
        return True
    return False


def normalize_clip_duration(
    start_sec: float,
    end_sec: float,
    source_duration_sec: float | None = None,
) -> tuple[float, float] | None:
    start = start_sec
    end = end_sec
    dur = end - start
    if dur <= 0.2:
        return None

    if dur > MAX_CLIP_SEC:
        mid = (start + end) / 2
        take = IDEAL_CLIP_SEC
        start = mid - take / 2
        end = start + take
        dur = take

    if dur < MIN_CLIP_SEC:
        need = MIN_CLIP_SEC - dur
        start -= need / 2
        end = start + MIN_CLIP_SEC
        dur = MIN_CLIP_SEC

    if source_duration_sec and source_duration_sec > 0:
        start = max(0.0, start)
        end = min(source_duration_sec, end)
        if end - start < MIN_CLIP_SEC:
            start = max(0.0, end - MIN_CLIP_SEC)
        dur = end - start
    else:
        start = max(0.0, start)

    if dur < MIN_CLIP_SEC or dur > MAX_CLIP_SEC + 0.05:
        return None
    return start, end


def prepare_detection(det: Detection, source_duration_sec: float | None = None) -> Detection | None:
    if should_reject_detection(det):
        return None
    normalized = normalize_clip_duration(det.start_sec, det.end_sec, source_duration_sec)
    if not normalized:
        return None
    start, end = normalized
    return Detection(
        label=det.label,
        start_sec=start,
        end_sec=end,
        confidence=det.confidence,
        screen_x=det.screen_x,
        screen_y=det.screen_y,
        screen_w=det.screen_w,
        screen_h=det.screen_h,
        frame_sec=start + (end - start) / 2,
    )
