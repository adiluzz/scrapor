"""Postgres access for VideoAgent tables."""

from __future__ import annotations

import json
import os
import secrets
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


def _cuid() -> str:
    return "c" + secrets.token_hex(12)


def load_run(conn, run_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        '''
        SELECT id, "siteId", "agentId", "userPrompt", "searchQuery",
               "extractTargets", "analysisModel", status, error
        FROM "VideoAgentRun"
        WHERE id = %s
        ''',
        (run_id,),
    ).fetchone()
    if not row:
        return None
    cols = [
        "id", "siteId", "agentId", "userPrompt", "searchQuery",
        "extractTargets", "analysisModel", "status", "error",
    ]
    return dict(zip(cols, row))


def set_run_status(conn, run_id: str, status: str, error: str | None = None) -> None:
    if error is not None:
        conn.execute(
            'UPDATE "VideoAgentRun" SET status = %s, error = %s, "updatedAt" = NOW() WHERE id = %s',
            (status, error[:2000], run_id),
        )
    else:
        conn.execute(
            'UPDATE "VideoAgentRun" SET status = %s, error = NULL, "updatedAt" = NOW() WHERE id = %s',
            (status, run_id),
        )


def list_active_runs(conn) -> list[str]:
    rows = conn.execute(
        '''
        SELECT id FROM "VideoAgentRun"
        WHERE status IN ('PENDING', 'RUNNING')
        ORDER BY "createdAt" ASC
        '''
    ).fetchall()
    return [r[0] for r in rows]


def clear_detections(conn, run_id: str) -> None:
    conn.execute('DELETE FROM "VideoAgentDetection" WHERE "runId" = %s', (run_id,))


def insert_detection(
    conn,
    *,
    run_id: str,
    video_id: str,
    video_title: str,
    label: str,
    start_sec: float,
    end_sec: float,
    screen_x: float | None = None,
    screen_y: float | None = None,
    screen_w: float | None = None,
    screen_h: float | None = None,
    confidence: float | None = None,
    frame_sec: float | None = None,
) -> None:
    conn.execute(
        '''
        INSERT INTO "VideoAgentDetection" (
          id, "runId", "videoId", "videoTitle", label,
          "startSec", "endSec", "screenX", "screenY", "screenW", "screenH",
          confidence, "frameSec", "createdAt"
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ''',
        (
            _cuid(), run_id, video_id, video_title, label,
            start_sec, end_sec, screen_x, screen_y, screen_w, screen_h,
            confidence, frame_sec,
        ),
    )


def search_videos(conn, site_id: str, query: str) -> list[dict[str, Any]]:
    """Fetch all READY videos matching search query (paginated internally)."""
    pattern = f"%{query}%"
    rows = conn.execute(
        '''
        SELECT DISTINCT v.id, v.title, v."durationSec"
        FROM "Video" v
        WHERE v."siteId" = %s
          AND v."isDeleted" = false
          AND v.status = 'READY'
          AND (
            v.title ILIKE %s
            OR v.description ILIKE %s
            OR EXISTS (
              SELECT 1 FROM "VideoTag" vt
              JOIN "Tag" t ON t.id = vt."tagId"
              WHERE vt."videoId" = v.id AND t.name ILIKE %s
            )
            OR EXISTS (
              SELECT 1 FROM "VideoPornstar" vp
              JOIN "Pornstar" p ON p.id = vp."pornstarId"
              WHERE vp."videoId" = v.id AND p.name ILIKE %s
            )
          )
        ORDER BY v."viewCount" DESC
        ''',
        (site_id, pattern, pattern, pattern, pattern),
    ).fetchall()
    return [{"id": r[0], "title": r[1], "durationSec": r[2]} for r in rows]


def load_training_examples(conn, site_id: str, labels: list[str]) -> list[dict[str, Any]]:
    if not labels:
        return []
    rows = conn.execute(
        '''
        SELECT label, approved, "startSec", "endSec",
               "screenX", "screenY", "screenW", "screenH", "contextPrompt"
        FROM "VideoAgentTrainingExample"
        WHERE "siteId" = %s
          AND LOWER(label) = ANY(%s)
        ORDER BY "createdAt" DESC
        LIMIT 20
        ''',
        (site_id, [l.lower() for l in labels]),
    ).fetchall()
    cols = [
        "label", "approved", "startSec", "endSec",
        "screenX", "screenY", "screenW", "screenH", "contextPrompt",
    ]
    return [dict(zip(cols, r)) for r in rows]
