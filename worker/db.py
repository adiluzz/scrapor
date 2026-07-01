"""Postgres access for the scrape worker (mirrors the Prisma schema)."""

import os
import re
import secrets
import unicodedata
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

import psycopg


def _cuid() -> str:
    # Any unique string works for a Prisma String @id.
    return "c" + secrets.token_hex(12)


# libpq (used by psycopg) only understands a fixed set of URI query params.
# Prisma's DATABASE_URL adds its own (schema, connection_limit, pgbouncer, ...)
# which libpq rejects with `invalid URI query parameter`. Keep only libpq-valid
# ones so the same DATABASE_URL works for both Prisma (web) and psycopg (worker).
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


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = text.encode("ascii", "ignore").decode("ascii").lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:80] or "video"


def connect():
    dsn = _normalize_dsn(os.environ["DATABASE_URL"])
    return psycopg.connect(dsn, autocommit=True)


def video_exists(conn, source_url: str) -> bool:
    """Global dedup — includes soft-deleted rows (no isDeleted filter)."""
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "Video" WHERE "sourceUrl" = %s', (source_url,))
        return cur.fetchone() is not None


def _unique_slug(conn, site_id: str, title: str) -> str:
    base = slugify(title)
    slug = base
    with conn.cursor() as cur:
        cur.execute('SELECT 1 FROM "Video" WHERE "siteId"=%s AND slug=%s', (site_id, slug))
        if cur.fetchone():
            slug = f"{base}-{secrets.token_hex(3)}"
    return slug


def upsert_pornstar(conn, site_id: str, name: str) -> str:
    slug = slugify(name)
    pid = _cuid()
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "Pornstar" (id,"siteId",name,slug) VALUES (%s,%s,%s,%s) '
            'ON CONFLICT ("siteId",slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',
            (pid, site_id, name, slug),
        )
        return cur.fetchone()[0]


def upsert_tag(conn, site_id: str, name: str) -> str:
    slug = slugify(name)
    tid = _cuid()
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "Tag" (id,"siteId",name,slug) VALUES (%s,%s,%s,%s) '
            'ON CONFLICT ("siteId",slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',
            (tid, site_id, name, slug),
        )
        return cur.fetchone()[0]


def create_video(conn, *, site_id, source_url, title, description, duration_sec,
                 source_site, scrape_run_id, s3_video_key, s3_thumb_key,
                 s3_preview_key, s3_storyboard_key, s3_storyboard_vtt_key,
                 tags, pornstars):
    vid = _cuid()
    slug = _unique_slug(conn, site_id, title)
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "Video" '
            '(id,slug,"siteId",title,"sourceUrl","sourceSite",description,"durationSec",'
            '"s3VideoKey","s3ThumbKey","s3PreviewKey","s3StoryboardKey","s3StoryboardVttKey",'
            '"scrapeRunId","viewCount","isDeleted","createdAt","updatedAt") '
            'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,false,now(),now())',
            (vid, slug, site_id, title[:400], source_url, source_site, description or None,
             duration_sec, s3_video_key, s3_thumb_key, s3_preview_key,
             s3_storyboard_key, s3_storyboard_vtt_key, scrape_run_id),
        )
    for name in pornstars or []:
        if not name.strip():
            continue
        pid = upsert_pornstar(conn, site_id, name.strip())
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO "VideoPornstar" ("videoId","pornstarId") VALUES (%s,%s) '
                'ON CONFLICT DO NOTHING',
                (vid, pid),
            )
    for name in tags or []:
        if not name.strip():
            continue
        tid = upsert_tag(conn, site_id, name.strip())
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO "VideoTag" ("videoId","tagId") VALUES (%s,%s) ON CONFLICT DO NOTHING',
                (vid, tid),
            )
    return vid, slug


def load_video(conn, video_id: str):
    """Load the fields the creator-upload pipeline needs."""
    with conn.cursor() as cur:
        cur.execute(
            'SELECT id,"siteId","durationSec",status FROM "Video" WHERE id=%s',
            (video_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "siteId": row[1], "durationSec": row[2], "status": row[3]}


def set_video_status(conn, video_id: str, status: str):
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "Video" SET status=%s,"updatedAt"=now() WHERE id=%s',
            (status, video_id),
        )


def update_video_media(conn, video_id, *, s3_video_key, s3_thumb_key, s3_preview_key,
                       s3_storyboard_key, s3_storyboard_vtt_key, duration_sec, status):
    """Write generated S3 keys + duration and flip status (READY/FAILED)."""
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "Video" SET "s3VideoKey"=%s,"s3ThumbKey"=%s,"s3PreviewKey"=%s,'
            '"s3StoryboardKey"=%s,"s3StoryboardVttKey"=%s,'
            '"durationSec"=COALESCE("durationSec",%s),status=%s,"updatedAt"=now() '
            'WHERE id=%s',
            (s3_video_key, s3_thumb_key, s3_preview_key, s3_storyboard_key,
             s3_storyboard_vtt_key, duration_sec, status, video_id),
        )


def load_run(conn, run_id: str):
    with conn.cursor() as cur:
        cur.execute(
            'SELECT id,"siteId",query,"selectedSites","minDurationSec" FROM "ScrapeRun" WHERE id=%s',
            (run_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "id": row[0], "siteId": row[1], "query": row[2],
        "selectedSites": row[3], "minDurationSec": row[4],
    }


def set_run_status(conn, run_id, status, started=False, finished=False):
    sets = ['status=%s']
    vals = [status]
    if started:
        sets.append('"startedAt"=now()')
    if finished:
        sets.append('"finishedAt"=now()')
    with conn.cursor() as cur:
        cur.execute(f'UPDATE "ScrapeRun" SET {",".join(sets)} WHERE id=%s', (*vals, run_id))


def update_run_totals(conn, run_id, new_videos, skipped, failed, total_found):
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "ScrapeRun" SET "newVideos"=%s,skipped=%s,failed=%s,"totalFound"=%s WHERE id=%s',
            (new_videos, skipped, failed, total_found, run_id),
        )


def set_run_site(conn, run_id, source_site, **fields):
    cols, vals = [], []
    for k, v in fields.items():
        col = {
            "status": "status", "found": "found", "new_videos": '"newVideos"',
            "skipped": "skipped", "failed": "failed", "error": "error",
        }[k]
        cols.append(f"{col}=%s")
        vals.append(v)
    if fields.get("status") == "RUNNING":
        cols.append('"startedAt"=now()')
    if fields.get("status") in ("DONE", "ERROR"):
        cols.append('"finishedAt"=now()')
    with conn.cursor() as cur:
        cur.execute(
            f'UPDATE "ScrapeRunSite" SET {",".join(cols)} WHERE "runId"=%s AND "sourceSite"=%s',
            (*vals, run_id, source_site),
        )
