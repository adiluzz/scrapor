"""Process a single promo ad iteration job."""

from __future__ import annotations

import logging
import traceback
from pathlib import Path

from brand_intro_outro import ensure_brand_assets
from clip_compose import compose_promo_ad
from config import CONFIG
from db import (
    complete_iteration,
    fail_iteration,
    load_clips,
    load_iteration,
    parse_json,
    set_iteration_status,
)
from media import extract_frame, overlay_logo, promo_ad_s3_key, upload_file
from providers import get_provider

log = logging.getLogger("ad-generator.runner")


def process_iteration(conn, iteration_id: str) -> None:
    job = load_iteration(conn, iteration_id)
    if not job:
        log.warning("iteration_not_found id=%s", iteration_id)
        return

    promo_ad_id = job["promoAdId"]
    site_id = job["siteId"]
    iteration_number = job["iterationNumber"]
    generation_mode = job["generationMode"]
    model_params = parse_json(job.get("modelParams") or job.get("adModelParams"))

    set_iteration_status(conn, iteration_id, "GENERATING")

    try:
        ensure_brand_assets()
        work_dir = Path(CONFIG.work_dir) / promo_ad_id / f"iter-{iteration_number}"
        work_dir.mkdir(parents=True, exist_ok=True)

        if generation_mode == "CLIP_COMPOSE":
            clips = load_clips(conn, promo_ad_id)
            s3_key, _ = compose_promo_ad(
                site_id, promo_ad_id, iteration_number, clips, model_params
            )
            complete_iteration(conn, iteration_id, promo_ad_id, s3_key, actual_cost_usd=0.0)
            return

        # GENERATIVE
        model_id = job.get("generativeModelId") or "nova-reel-1-1"
        prompt = (job.get("userPrompt") or job.get("adPrompt") or "").strip()
        if not prompt:
            raise ValueError("Missing prompt for generative ad")

        ref_image: Path | None = None
        parent_id = job.get("parentIterationId")
        if parent_id:
            parent = conn.execute(
                'SELECT "s3Key" FROM "PromoAdIteration" WHERE id = %s',
                (parent_id,),
            ).fetchone()
            if parent and parent[0]:
                # Parent on S3 — use first clip frame as ref instead for simplicity
                pass

        clips = load_clips(conn, promo_ad_id)
        if clips:
            clip = clips[0]
            src = work_dir / f"ref_{clip['videoId']}.mp4"
            from media import download_video

            if download_video(site_id, clip["videoId"], src):
                ref_image = work_dir / "ref_frame.jpg"
                extract_frame(src, ref_image, float(clip["startSec"]) + 0.5)

        provider = get_provider(model_id)
        duration = int(model_params.get("durationSeconds") or 12)
        raw_path, provider_job_id, actual_cost = provider.generate(
            prompt=prompt,
            duration_seconds=duration,
            model_id=model_id,
            model_params=model_params,
            ref_image_path=ref_image,
            work_dir=work_dir,
        )

        lockup_png = Path(CONFIG.brand_lockup_path)
        final_path = work_dir / "final.mp4"
        logo_position = model_params.get("logoPosition") or "bottom-right"
        logo_opacity = float(model_params.get("logoOpacity") or 0.85)
        if lockup_png.exists() and lockup_png.suffix.lower() == ".png":
            overlay_logo(raw_path, final_path, lockup_png, logo_position, logo_opacity)
        else:
            final_path.write_bytes(raw_path.read_bytes())

        s3_key = promo_ad_s3_key(site_id, promo_ad_id, iteration_number)
        upload_file(final_path, s3_key)
        complete_iteration(
            conn,
            iteration_id,
            promo_ad_id,
            s3_key,
            provider_job_id=provider_job_id,
            actual_cost_usd=actual_cost,
        )
        log.info(
            "generative_done ad=%s iter=%s model=%s",
            promo_ad_id,
            iteration_number,
            model_id,
        )

    except Exception as e:  # noqa: BLE001
        log.error(
            "iteration_failed id=%s err=%s trace=%s",
            iteration_id,
            e,
            traceback.format_exc()[-600:],
        )
        fail_iteration(conn, iteration_id, promo_ad_id, str(e))
