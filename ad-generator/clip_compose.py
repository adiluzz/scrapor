"""Professional clip compose pipeline — no AI."""

from __future__ import annotations

import logging
from pathlib import Path

from brand_intro_outro import intro_outro_paths
from config import CONFIG
from media import (
    apply_body_bookends,
    concat_simple,
    concat_with_xfade,
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
    logo_path: str | None = None,
) -> tuple[str, Path]:
    work = Path(CONFIG.work_dir) / promo_ad_id / f"iter-{iteration_number}"
    work.mkdir(parents=True, exist_ok=True)

    max_body = float(model_params.get("maxBodySeconds") or 60)
    show_tagline = model_params.get("showTagline", True) is not False
    tagline_domain = (
        (model_params.get("taglineDomain") or "").strip()
        or None
    )
    logo_position = model_params.get("logoPosition") or "bottom-right"
    logo_opacity = float(model_params.get("logoOpacity") or 0.85)
    crossfade_sec = float(model_params.get("crossfadeSec") or 0.5)
    ken_burns = model_params.get("kenBurns") is True
    remove_logos = model_params.get("removeSourceLogos", True) is not False
    logo_removal_mode = model_params.get("logoRemovalMode") or "both"
    output_aspect = model_params.get("outputAspect") or "16:9"
    if output_aspect == "9:16":
        target_w, target_h = 1080, 1920
    else:
        target_w, target_h = 1920, 1080

    segments_dir = work / "segments"
    segments_dir.mkdir(exist_ok=True)
    normalized: list[Path] = []
    body_duration = 0.0

    for i, clip in enumerate(clips):
        video_id = clip["videoId"]
        source_site = clip.get("sourceSite")
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

        crop_norm = None
        if (
            clip.get("screenW") is not None
            and clip.get("screenH") is not None
            and float(clip["screenW"]) > 0
            and float(clip["screenH"]) > 0
        ):
            crop_norm = {
                "x": float(clip.get("screenX") or 0),
                "y": float(clip.get("screenY") or 0),
                "w": float(clip["screenW"]),
                "h": float(clip["screenH"]),
            }

        seg_out = segments_dir / f"seg_{i:03d}.mp4"
        normalize_segment(
            src,
            seg_out,
            start,
            end,
            source_site=source_site,
            remove_logos=remove_logos,
            logo_removal_mode=logo_removal_mode,
            ken_burns=ken_burns,
            work_dir=work,
            crop_norm=crop_norm,
            target_w=target_w,
            target_h=target_h,
        )
        normalized.append(seg_out)

    if not normalized:
        raise ValueError("No clip segments produced")

    body_raw = work / "body_raw.mp4"
    if len(normalized) > 1:
        concat_with_xfade(normalized, body_raw, xfade_sec=crossfade_sec)
    else:
        body_raw.write_bytes(normalized[0].read_bytes())

    body_path = work / "body.mp4"
    apply_body_bookends(body_raw, body_path)

    intro, outro = intro_outro_paths(show_tagline, tagline_domain=tagline_domain)
    parts = []
    if intro.exists():
        parts.append(intro)
    parts.append(body_path)
    if outro.exists():
        parts.append(outro)

    raw_path = work / "raw_concat.mp4"
    concat_simple(parts, raw_path)

    lockup_png = Path(CONFIG.brand_lockup_path)
    if logo_path:
        from db import resolve_brand_lockup_path
        lockup_png = resolve_brand_lockup_path(logo_path)
    if not lockup_png.exists():
        svg_fallback = lockup_png.with_suffix(".svg")
        if not svg_fallback.exists():
            svg_fallback = lockup_png.parent / "pisster-lockup.svg"
        if svg_fallback.exists():
            from brand_intro_outro import _svg_to_png
            _svg_to_png(svg_fallback, lockup_png)

    final_path = work / "final.mp4"
    if lockup_png.exists() and lockup_png.suffix.lower() == ".png":
        overlay_logo(raw_path, final_path, lockup_png, logo_position, logo_opacity)
    else:
        final_path.write_bytes(raw_path.read_bytes())

    s3_key = promo_ad_s3_key(site_id, promo_ad_id, iteration_number)
    upload_file(final_path, s3_key)
    log.info("clip_compose_done ad=%s iter=%s key=%s", promo_ad_id, iteration_number, s3_key)
    return s3_key, final_path
