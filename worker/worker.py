#!/usr/bin/env python3
"""
Queue-consuming scrape worker.

Consumes ScrapeRun ids from Redis (list `scrape:queue`, pushed by the app),
searches the admin-selected source sites, dedups by sourceUrl (globally, incl.
soft-deleted), downloads new videos, generates preview/thumbnail/storyboard,
uploads everything to S3, links pornstars/tags, and updates per-site + run totals.

Run modes:
  python worker/worker.py                 # long-running queue consumer (container)
  python worker/worker.py --run <runId>   # process one existing run and exit
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db  # noqa: E402
import storage  # noqa: E402
import media  # noqa: E402
from site_searchers import SEARCHERS  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format='{"service":"worker","level":"%(levelname)s","msg":%(message)s}',
)
log = logging.getLogger("worker")


def _j(msg):
    return json.dumps(msg)


MAX_PER_SITE = int(os.environ.get("SCRAPE_MAX_PER_SITE", "25"))
QUEUE_KEY = "scrape:queue"


# ── Downloaders ───────────────────────────────────────────────────────
def _download(video, dest_dir) -> bool:
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, "video.mp4")
    if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
        return True

    m3u8 = video.get("_m3u8_base_url")
    cdn = video.get("_cdn_url")
    try:
        if m3u8:
            url = m3u8.replace("_TPL_", "240p")
            cmd = ["ffmpeg", "-y", "-i", url, "-c", "copy", dest]
            subprocess.run(cmd, capture_output=True, timeout=900)
        elif cdn:
            cmd = ["wget", "-q", "--no-check-certificate", "-O", dest, cdn]
            subprocess.run(cmd, capture_output=True, timeout=900)
        else:
            tmp = os.path.join(dest_dir, "dl.%(ext)s")
            cmd = ["yt-dlp", "--no-playlist", "--merge-output-format", "mp4",
                   "-f", "bestvideo[height<=720]+bestaudio/best",
                   "-o", tmp, "--socket-timeout", "30", "--retries", "3", video["url"]]
            subprocess.run(cmd, capture_output=True, timeout=1800)
            if not (os.path.exists(dest) and os.path.getsize(dest) > 100_000):
                for f in os.listdir(dest_dir):
                    if f.startswith("dl."):
                        shutil.move(os.path.join(dest_dir, f), dest)
                        break
        return os.path.exists(dest) and os.path.getsize(dest) > 100_000
    except Exception as e:
        log.warning(_j(f"download failed: {e}"))
        return False


def _process_one(conn, run, source_site, video) -> str:
    """Returns 'new' | 'skip' | 'fail'."""
    url = video["url"]
    if db.video_exists(conn, url):
        return "skip"

    site_id = run["siteId"]
    tmp_dir = tempfile.mkdtemp(prefix="scrape_")
    try:
        if not _download(video, tmp_dir):
            return "fail"
        video_path = os.path.join(tmp_dir, "video.mp4")
        duration = video.get("duration_sec") or media.probe_duration(video_path)

        # Generate media assets.
        preview = os.path.join(tmp_dir, "preview.mp4")
        thumb = os.path.join(tmp_dir, "thumbnail.jpg")
        sprite = os.path.join(tmp_dir, "storyboard.jpg")
        vtt = os.path.join(tmp_dir, "storyboard.vtt")
        media.make_preview(video_path, preview)
        media.make_thumbnail(video_path, thumb, video.get("thumbnail", ""))
        media.make_storyboard(video_path, sprite, vtt, duration)

        # Upload to S3 (only if configured; otherwise keys stay null for dev).
        keys = dict(v=None, t=None, p=None, sb=None, vtt=None)
        # We need a video id namespace before insert; use a temp id via db then update.
        # Simplest: create the row first with null keys, then upload under its id.
        vid, slug = db.create_video(
            conn, site_id=site_id, source_url=url, title=video["title"],
            description=video.get("description"), duration_sec=duration,
            source_site=source_site, scrape_run_id=run["id"],
            s3_video_key=None, s3_thumb_key=None, s3_preview_key=None,
            s3_storyboard_key=None, s3_storyboard_vtt_key=None,
            tags=video.get("tags"), pornstars=video.get("pornstars"),
        )

        if storage.configured():
            keys["v"] = storage.upload(video_path, storage.key_video(site_id, vid), "video/mp4")
            if os.path.exists(thumb):
                keys["t"] = storage.upload(thumb, storage.key_thumb(site_id, vid), "image/jpeg")
            if os.path.exists(preview):
                keys["p"] = storage.upload(preview, storage.key_preview(site_id, vid), "video/mp4")
            if os.path.exists(sprite):
                keys["sb"] = storage.upload(sprite, storage.key_storyboard(site_id, vid), "image/jpeg")
            if os.path.exists(vtt):
                keys["vtt"] = storage.upload(vtt, storage.key_storyboard_vtt(site_id, vid), "text/vtt")
            with conn.cursor() as cur:
                cur.execute(
                    'UPDATE "Video" SET "s3VideoKey"=%s,"s3ThumbKey"=%s,"s3PreviewKey"=%s,'
                    '"s3StoryboardKey"=%s,"s3StoryboardVttKey"=%s WHERE id=%s',
                    (keys["v"], keys["t"], keys["p"], keys["sb"], keys["vtt"], vid),
                )
        else:
            # Dev fallback: keep files under downloads/{id}/ for local API routes.
            local = os.path.join(ROOT, "downloads", vid)
            os.makedirs(local, exist_ok=True)
            for src, name in [(video_path, "video.mp4"), (preview, "thumbnail.mp4"), (thumb, "thumbnail.jpg")]:
                if os.path.exists(src):
                    shutil.copy(src, os.path.join(local, name))

        log.info(_j(f"added video {slug} ({source_site})"))
        return "new"
    except Exception as e:
        log.warning(_j(f"process failed {url}: {e}"))
        return "fail"
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def process_run(conn, run_id: str):
    run = db.load_run(conn, run_id)
    if not run:
        log.warning(_j(f"run {run_id} not found"))
        return
    sources = json.loads(run["selectedSites"])
    min_dur = run["minDurationSec"]
    log.info(_j(f"run {run_id} start: query={run['query']!r} sources={sources}"))
    db.set_run_status(conn, run_id, "RUNNING", started=True)

    seen = set()  # within-run dedup across sources
    totals = {"new": 0, "skip": 0, "fail": 0, "found": 0}

    for source in sources:
        searcher = SEARCHERS.get(source)
        if not searcher:
            db.set_run_site(conn, run_id, source, status="ERROR", error="unsupported source")
            continue
        db.set_run_site(conn, run_id, source, status="RUNNING")
        s_stats = {"found": 0, "new_videos": 0, "skipped": 0, "failed": 0}
        try:
            results = searcher(run["query"], MAX_PER_SITE, 0, min_dur)
            s_stats["found"] = len(results)
            totals["found"] += len(results)
            for v in results:
                if v["url"] in seen:
                    s_stats["skipped"] += 1
                    totals["skip"] += 1
                    continue
                seen.add(v["url"])
                outcome = _process_one(conn, run, source, v)
                if outcome == "new":
                    s_stats["new_videos"] += 1; totals["new"] += 1
                elif outcome == "skip":
                    s_stats["skipped"] += 1; totals["skip"] += 1
                else:
                    s_stats["failed"] += 1; totals["fail"] += 1
                db.set_run_site(conn, run_id, source, status="RUNNING", **s_stats)
                db.update_run_totals(conn, run_id, totals["new"], totals["skip"], totals["fail"], totals["found"])
                time.sleep(2)
            db.set_run_site(conn, run_id, source, status="DONE", **s_stats)
        except Exception as e:
            log.warning(_j(f"source {source} error: {e}"))
            db.set_run_site(conn, run_id, source, status="ERROR", error=str(e)[:500], **s_stats)

    db.update_run_totals(conn, run_id, totals["new"], totals["skip"], totals["fail"], totals["found"])
    db.set_run_status(conn, run_id, "DONE", finished=True)
    log.info(_j(f"run {run_id} done: {totals}"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", help="Process a single existing ScrapeRun id and exit")
    args = parser.parse_args()

    conn = db.connect()

    if args.run:
        process_run(conn, args.run)
        return

    import redis as redis_lib
    r = redis_lib.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))
    log.info(_j("worker started, waiting for jobs"))
    while True:
        try:
            item = r.blpop(QUEUE_KEY, timeout=5)
            if not item:
                continue
            run_id = item[1].decode() if isinstance(item[1], bytes) else item[1]
            process_run(conn, run_id)
        except Exception as e:
            log.error(_j(f"worker loop error: {e}"))
            time.sleep(3)


if __name__ == "__main__":
    main()
