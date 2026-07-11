"""Postgres access for PromoAd tables."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg

_LIBPQ_QUERY_KEYS = {
    "sslmode", "sslcert", "sslkey", "sslrootcert", "sslpassword",
    "connect_timeout", "application_name", "options", "target_session_attrs",
    "gssencmode", "channel_binding",
}


def _normalize_dsn(dsn: str) -> str:
    parts = urlsplit(dsn)
    if not parts.query:
        return dsn
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if k in _LIBPQ_QUERY_KEYS]
    return urlunsplit(parts._replace(query=urlencode(kept)))


def connect():
    dsn = _normalize_dsn(os.environ["DATABASE_URL"])
    return psycopg.connect(dsn, autocommit=True)


def load_iteration(conn, iteration_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        '''
        SELECT i.id, i."promoAdId", i."iterationNumber", i."userPrompt", i."modelParams",
               i.status, i."s3Key", i."providerJobId", i."parentIterationId",
               a."siteId", a."generationMode", a."generativeModelId", a.prompt, a."modelParams",
               a.status AS ad_status, s."logoPath", s.domain AS "siteDomain"
        FROM "PromoAdIteration" i
        JOIN "PromoAd" a ON a.id = i."promoAdId"
        LEFT JOIN "Site" s ON s.id = a."siteId"
        WHERE i.id = %s
        ''',
        (iteration_id,),
    ).fetchone()
    if not row:
        return None
    cols = [
        "id", "promoAdId", "iterationNumber", "userPrompt", "modelParams",
        "status", "s3Key", "providerJobId", "parentIterationId",
        "siteId", "generationMode", "generativeModelId", "adPrompt", "adModelParams",
        "adStatus", "logoPath", "siteDomain",
    ]
    return dict(zip(cols, row))


def resolve_brand_lockup_path(logo_path: str | None) -> Path:
    """Map Site.logoPath (/brand/foo.png) to container filesystem path."""
    from config import CONFIG

    if logo_path:
        rel = logo_path.lstrip("/")
        candidate = Path("/app/public") / rel
        if candidate.exists():
            return candidate
        alt = Path("/app") / rel if not rel.startswith("public/") else Path("/app") / rel
        if alt.exists():
            return alt
    return Path(CONFIG.brand_lockup_path)


def load_clips(conn, promo_ad_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        '''
        SELECT c."sortOrder", d.id, d."videoId", d."videoTitle", d.label,
               d."startSec", d."endSec", v."sourceSite"
        FROM "PromoAdClip" c
        JOIN "VideoAgentDetection" d ON d.id = c."detectionId"
        JOIN "Video" v ON v.id = d."videoId"
        WHERE c."promoAdId" = %s
        ORDER BY c."sortOrder" ASC
        ''',
        (promo_ad_id,),
    ).fetchall()
    cols = [
        "sortOrder", "detectionId", "videoId", "videoTitle", "label",
        "startSec", "endSec", "sourceSite",
    ]
    return [dict(zip(cols, r)) for r in rows]


def list_active_iterations(conn) -> list[str]:
    rows = conn.execute(
        '''
        SELECT i.id
        FROM "PromoAdIteration" i
        WHERE i.status IN ('PENDING', 'GENERATING')
        ORDER BY i."createdAt" ASC
        LIMIT 20
        '''
    ).fetchall()
    return [r[0] for r in rows]


def set_iteration_status(conn, iteration_id: str, status: str, error: str | None = None) -> None:
    conn.execute(
        '''
        UPDATE "PromoAdIteration"
        SET status = %s::"PromoAdIterationStatus", error = %s, "updatedAt" = NOW()
        WHERE id = %s
        ''',
        (status, error, iteration_id),
    )


def set_ad_status(conn, promo_ad_id: str, status: str) -> None:
    conn.execute(
        '''
        UPDATE "PromoAd"
        SET status = %s::"PromoAdStatus", "updatedAt" = NOW()
        WHERE id = %s
        ''',
        (status, promo_ad_id),
    )


def complete_iteration(
    conn,
    iteration_id: str,
    promo_ad_id: str,
    s3_key: str,
    provider_job_id: str | None = None,
    actual_cost_usd: float | None = None,
) -> None:
    conn.execute(
        '''
        UPDATE "PromoAdIteration"
        SET status = 'DONE'::"PromoAdIterationStatus",
            "s3Key" = %s,
            "providerJobId" = COALESCE(%s, "providerJobId"),
            "actualCostUsd" = COALESCE(%s, "actualCostUsd"),
            error = NULL,
            "updatedAt" = NOW()
        WHERE id = %s
        ''',
        (s3_key, provider_job_id, actual_cost_usd, iteration_id),
    )
    set_ad_status(conn, promo_ad_id, "DONE")


def fail_iteration(conn, iteration_id: str, promo_ad_id: str, error: str) -> None:
    conn.execute(
        '''
        UPDATE "PromoAdIteration"
        SET status = 'ERROR'::"PromoAdIterationStatus", error = %s, "updatedAt" = NOW()
        WHERE id = %s
        ''',
        (error[:2000], iteration_id),
    )
    set_ad_status(conn, promo_ad_id, "ERROR")


def parse_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}
