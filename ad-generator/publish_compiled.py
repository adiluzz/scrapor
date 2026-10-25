"""Ask the web app to list a finished compile on Ad clips.

The FFmpeg worker does not depend on the browser staying open. Publishing is
idempotent, and a periodic sweep picks up anything this call missed.
"""

from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger("ad-generator.publish")


def _web_base() -> str:
    return os.environ.get("WEB_INTERNAL_URL", "http://web:3000").rstrip("/")


def notify_compiled(promo_ad_id: str | None = None) -> None:
    secret = (os.environ.get("API_KEY_SECRET") or "").strip()
    if len(secret) < 16:
        log.warning("compiled_publish_skipped reason=missing_api_key_secret")
        return

    payload = {"promoAdId": promo_ad_id} if promo_ad_id else {}
    url = f"{_web_base()}/api/internal/ad-clips/publish-compiled"
    try:
        response = httpx.post(
            url,
            json=payload,
            headers={"x-internal-token": secret},
            timeout=120,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "compiled_publish_request_failed promoAdId=%s err=%s",
            promo_ad_id or "",
            exc,
        )
        return

    if response.status_code >= 300:
        log.warning(
            "compiled_publish_rejected promoAdId=%s status=%s body=%s",
            promo_ad_id or "",
            response.status_code,
            response.text[:300],
        )
        return

    log.info(
        "compiled_publish_ok promoAdId=%s status=%s",
        promo_ad_id or "",
        response.status_code,
    )
