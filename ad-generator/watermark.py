"""Per-source watermark presets and OpenCV auto-detect for static corner overlays."""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

log = logging.getLogger("ad-generator.watermark")

Corner = Literal["top-left", "top-right", "bottom-left", "bottom-right"]

# Zones as fraction of frame width/height (applied after scale to target resolution).
@dataclass(frozen=True)
class WatermarkZone:
    corner: Corner
    w_pct: float
    h_pct: float
    margin_pct: float = 0.01


# Common adult-tube corner watermarks (approximate; delogo interpolates pixels).
SOURCE_PRESETS: dict[str, list[WatermarkZone]] = {
    "PornHub": [WatermarkZone("top-left", 0.20, 0.11)],
    "Pornhub": [WatermarkZone("top-left", 0.20, 0.11)],
    "XHamster": [WatermarkZone("bottom-right", 0.22, 0.12)],
    "xHamster": [WatermarkZone("bottom-right", 0.22, 0.12)],
    "XVideos": [WatermarkZone("top-right", 0.18, 0.10)],
    "YouPorn": [WatermarkZone("top-left", 0.18, 0.10)],
    "RedTube": [WatermarkZone("top-left", 0.18, 0.10)],
    "Eporner": [WatermarkZone("bottom-right", 0.20, 0.11)],
    "ParadiseHill": [WatermarkZone("top-right", 0.24, 0.12)],
    "HQporner": [WatermarkZone("bottom-right", 0.20, 0.10)],
    "SpankBang": [WatermarkZone("top-right", 0.22, 0.11)],
}

SKIP_REMOVAL_SOURCES = frozenset({"creator-upload", "assistant", ""})

MAX_FRAME_COVERAGE = 0.15
MAX_ZONES_PER_CLIP = 2


@dataclass(frozen=True)
class DelogoRect:
    x: int
    y: int
    w: int
    h: int

    @property
    def area_ratio(self) -> float:
        return 0.0  # set by caller with frame dims

    def area_ratio_of(self, frame_w: int, frame_h: int) -> float:
        return (self.w * self.h) / max(1, frame_w * frame_h)


def zone_to_rect(zone: WatermarkZone, frame_w: int, frame_h: int) -> DelogoRect:
    margin_x = int(frame_w * zone.margin_pct)
    margin_y = int(frame_h * zone.margin_pct)
    w = max(8, int(frame_w * zone.w_pct))
    h = max(8, int(frame_h * zone.h_pct))
    if zone.corner == "top-left":
        x, y = margin_x, margin_y
    elif zone.corner == "top-right":
        x, y = frame_w - w - margin_x, margin_y
    elif zone.corner == "bottom-left":
        x, y = margin_x, frame_h - h - margin_y
    else:
        x, y = frame_w - w - margin_x, frame_h - h - margin_y
    x = max(0, min(x, frame_w - w))
    y = max(0, min(y, frame_h - h))
    return DelogoRect(x=x, y=y, w=w, h=h)


def preset_rects(source_site: str | None, frame_w: int, frame_h: int) -> list[DelogoRect]:
    if not source_site or source_site in SKIP_REMOVAL_SOURCES:
        return []
    zones = SOURCE_PRESETS.get(source_site)
    if not zones:
        # Case-insensitive fallback
        for key, val in SOURCE_PRESETS.items():
            if key.lower() == source_site.lower():
                zones = val
                break
    if not zones:
        return []
    return [zone_to_rect(z, frame_w, frame_h) for z in zones]


def _probe_resolution(video_path: Path) -> tuple[int, int]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    try:
        w, h = result.stdout.strip().split("x")
        return int(w), int(h)
    except ValueError:
        return 1920, 1080


def _extract_frame_at(video_path: Path, out_path: Path, at_sec: float) -> bool:
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", str(max(0, at_sec)),
                "-i", str(video_path),
                "-frames:v", "1",
                "-q:v", "3",
                str(out_path),
            ],
            capture_output=True,
            timeout=60,
            check=True,
        )
        return out_path.exists()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def detect_static_overlay_zones(
    video_path: Path,
    start_sec: float,
    end_sec: float,
    sample_frames: int = 8,
    work_dir: Path | None = None,
) -> list[DelogoRect]:
    """
    Sample frames across a segment; find low-variance high-edge corner bands
    that likely indicate static watermarks.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        log.warning("opencv_unavailable skipping auto watermark detect")
        return []

    duration = max(0.5, end_sec - start_sec)
    frame_w, frame_h = _probe_resolution(video_path)
    tmp = work_dir or video_path.parent
    tmp.mkdir(parents=True, exist_ok=True)

    corners: list[Corner] = ["top-left", "top-right", "bottom-left", "bottom-right"]
    corner_band = 0.22  # fraction of frame per corner band

    stacks: dict[Corner, list] = {c: [] for c in corners}
    times = [start_sec + (i + 0.5) * duration / sample_frames for i in range(sample_frames)]

    for i, t in enumerate(times):
        frame_path = tmp / f"wm_frame_{i:02d}.jpg"
        if not _extract_frame_at(video_path, frame_path, t):
            continue
        img = cv2.imread(str(frame_path))
        try:
            frame_path.unlink(missing_ok=True)
        except OSError:
            pass
        if img is None:
            continue
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        for corner in corners:
            bw = int(w * corner_band)
            bh = int(h * corner_band)
            if corner == "top-left":
                band = gray[0:bh, 0:bw]
            elif corner == "top-right":
                band = gray[0:bh, w - bw : w]
            elif corner == "bottom-left":
                band = gray[h - bh : h, 0:bw]
            else:
                band = gray[h - bh : h, w - bw : w]
            stacks[corner].append(band.astype(np.float32))

    candidates: list[DelogoRect] = []
    for corner in corners:
        bands = stacks[corner]
        if len(bands) < 2:
            continue
        stack = np.stack(bands, axis=0)
        temporal_var = float(np.var(stack, axis=0).mean())
        mean_band = np.mean(stack, axis=0)
        edges = cv2.Canny(mean_band.astype(np.uint8), 50, 150)
        edge_density = float(np.count_nonzero(edges)) / max(1, edges.size)
        # Static overlay: low temporal change, visible edges/text
        if temporal_var > 120 or edge_density < 0.04:
            continue
        bw = int(frame_w * corner_band)
        bh = int(frame_h * corner_band)
        shrink = 0.85
        sw, sh = int(bw * shrink), int(bh * shrink)
        if corner == "top-left":
            x, y = int(frame_w * 0.01), int(frame_h * 0.01)
        elif corner == "top-right":
            x, y = frame_w - sw - int(frame_w * 0.01), int(frame_h * 0.01)
        elif corner == "bottom-left":
            x, y = int(frame_w * 0.01), frame_h - sh - int(frame_h * 0.01)
        else:
            x, y = frame_w - sw - int(frame_w * 0.01), frame_h - sh - int(frame_h * 0.01)
        candidates.append(DelogoRect(x=max(0, x), y=max(0, y), w=sw, h=sh))

    # Cap zones and total coverage
    candidates.sort(key=lambda r: r.w * r.h, reverse=True)
    picked: list[DelogoRect] = []
    total_area = 0.0
    for rect in candidates:
        ratio = rect.area_ratio_of(frame_w, frame_h)
        if total_area + ratio > MAX_FRAME_COVERAGE:
            log.warning("watermark_skip_coverage area=%.3f", total_area + ratio)
            break
        picked.append(rect)
        total_area += ratio
        if len(picked) >= MAX_ZONES_PER_CLIP:
            break
    return picked


def resolve_delogo_rects(
    video_path: Path,
    source_site: str | None,
    start_sec: float,
    end_sec: float,
    *,
    remove: bool,
    mode: str = "both",
    work_dir: Path | None = None,
) -> list[DelogoRect]:
    if not remove or source_site in SKIP_REMOVAL_SOURCES:
        return []

    frame_w, frame_h = _probe_resolution(video_path)
    rects: list[DelogoRect] = []

    if mode in ("presets", "both"):
        rects = preset_rects(source_site, frame_w, frame_h)

    if not rects and mode in ("auto", "both"):
        rects = detect_static_overlay_zones(
            video_path, start_sec, end_sec, work_dir=work_dir
        )

    total = sum(r.area_ratio_of(frame_w, frame_h) for r in rects)
    if total > MAX_FRAME_COVERAGE:
        log.warning("watermark_skip_total_coverage site=%s ratio=%.3f", source_site, total)
        return []
    return rects[:MAX_ZONES_PER_CLIP]


def delogo_filter_chain(rects: list[DelogoRect]) -> str:
    """Build chained delogo vf filters (input label [v0], output [vN])."""
    if not rects:
        return ""
    parts = []
    label_in = "[0:v]"
    for i, r in enumerate(rects):
        label_out = f"[v{i + 1}]" if i < len(rects) - 1 else "[vout]"
        parts.append(
            f"{label_in}delogo=x={r.x}:y={r.y}:w={r.w}:h={r.h}:show=0{label_out}"
        )
        label_in = label_out
    return ";".join(parts)
