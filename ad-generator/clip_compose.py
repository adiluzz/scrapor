"""Professional clip compose pipeline — no AI."""

from __future__ import annotations

import logging
from pathlib import Path

from brand_intro_outro import intro_outro_paths
from config import CONFIG
from media import (
    concat_simple,
    download_video,
    normalize_segment,
    overlay_logo,
    promo_ad_s3_key,
    upload_file,
)

log = logging.getLogger("ad-generator.clip_compose")


def compose_promo_ad(
    site_id: str,
    promo_ad_id: str,
    iteration_number: int,
    clips: list[dict],
    model_params: dict,
) -> tuple[str, Path]:
    work = Path(CONFIG.work_dir) / promo_ad_id / f"iter-{iteration_number}"
    work.mkdir(parents=True, exist_ok=True)

    max_body = float(model_params.get("maxBodySeconds") or 60)
    show_tagline = model_params.get("showTagline", True) is not False
    logo_position = model_params.get("logoPosition") or "bottom-right"
    logo_opacity = float(model_params.get("logoOpacity") or 0.85)

    segments_dir = work / "segments"
    segments_dir.mkdir(exist_ok=True)
    normalized: list[Path] = []
    body_duration = 0.0

    for i, clip in enumerate(clips):
        video_id = clip["videoId"]
        start = float(clip["startSec"])
        end = float(clip["endSec"])
        seg_dur = end - start
        if body_duration + seg_dur > max_body and normalized:
            break
        body_duration += seg_dur

        src = work / f"src_{video_id}.mp4"
        if not src.exists():
            if not download_video(site_id, video_id, src):
                raise FileNotFoundError(f"Cannot download video {video_id}")

        seg_out = segments_dir / f"seg_{i:03d}.mp4"
        normalize_segment(src, seg_out, start, end)
        normalized.append(seg_out)

    if not normalized:
        raise ValueError("No clip segments produced")

    body_path = work / "body.mp4"
    concat_simple(normalized, body_path)

    intro, outro = intro_outro_paths(show_tagline)
    parts = []
    if intro.exists():
        parts.append(intro)
    parts.append(body_path)
    if outro.exists():
        parts.append(outro)

    raw_path = work / "raw_concat.mp4"
    concat_simple(parts, raw_path)

    lockup_png = Path(CONFIG.intro_path).parent / "pisster-lockup.png"
    final_path = work / "final.mp4"
    if lockup_png.exists():
        overlay_logo(raw_path, final_path, lockup_png, logo_position, logo_opacity)
    else:
        final_path.write_bytes(raw_path.read_bytes())

    s3_key = promo_ad_s3_key(site_id, promo_ad_id, iteration_number)
    upload_file(final_path, s3_key)
    log.info("clip_compose_done ad=%s iter=%s key=%s", promo_ad_id, iteration_number, s3_key)
    return s3_key, final_path
