#!/usr/bin/env python3
"""
Queue-consuming media worker.

Consumes two Redis queues:
  • `scrape:queue`  — ScrapeRun ids: searches admin-selected sources, dedups by
    sourceUrl, downloads new videos, generates preview/thumbnail/storyboard,
    uploads to S3, links pornstars/tags, updates per-site + run totals.
  • `creator:queue` — Video ids for creator uploads the web app streamed to the
    shared `uploads` volume: normalize to MP4, generate the same media assets,
    upload to S3 under the video id, then flip the video to READY.

Run modes:
  python worker/worker.py                 # long-running queue consumer (container)
  python worker/worker.py --run <runId>   # process one existing scrape run and exit
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
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

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
    return json.dumps(msg, default=str)


def _event(level: str, event: str, **fields):
    """Structured log line — one JSON object per message for ELK / docker logs."""
    payload = {"event": event, **fields}
    getattr(log, level)(_j(payload))


def _stderr_tail(result: subprocess.CompletedProcess | None, limit: int = 400) -> str:
    if not result:
        return ""
    parts = []
    if result.stderr:
        parts.append(result.stderr.decode("utf-8", "ignore") if isinstance(result.stderr, bytes) else result.stderr)
    if result.stdout:
        parts.append(result.stdout.decode("utf-8", "ignore") if isinstance(result.stdout, bytes) else result.stdout)
    text = "\n".join(p.strip() for p in parts if p and p.strip())
    return text[-limit:] if len(text) > limit else text


def _video_ctx(video, run, source_site) -> dict:
    return {
        "runId": run.get("id"),
        "sourceSite": source_site,
        "url": video.get("url") or "",
        "title": (video.get("title") or "")[:200],
    }


def _log_video_fail(stage: str, video, run, source_site, reason, **extra):
    _event("warning", "video_failed", stage=stage, reason=str(reason)[:500], **_video_ctx(video, run, source_site), **extra)


# How many videos to download+save concurrently.
DOWNLOAD_CONCURRENCY = int(os.environ.get("SCRAPE_DOWNLOAD_CONCURRENCY", "5"))
# Page size when paginating a source for a run.
PAGE_BATCH = int(os.environ.get("SCRAPE_PAGE_BATCH", "50"))
# Safety upper bound when maxPerSite is null (download ALL) so a run can't loop forever.
ALL_CAP = int(os.environ.get("SCRAPE_ALL_MAX", "100000"))
QUEUE_KEY = "scrape:queue"
CREATOR_QUEUE_KEY = "creator:queue"
# Shared volume the web app writes creator uploads to (see docker-compose).
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(ROOT, "uploads"))
# Optional HTTP(S) proxy for source downloads (or use docker-compose.vpn.yml).
SCRAPE_PROXY = os.environ.get("SCRAPE_HTTP_PROXY") or os.environ.get("HTTPS_PROXY") or ""


# ── Downloaders ───────────────────────────────────────────────────────
def _download(video, dest_dir) -> tuple[bool, str, dict]:
    """
    Download source video to dest_dir/video.mp4.
    Returns (ok, reason, extra) where extra may hold method/stderr for logging.
    """
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, "video.mp4")
    if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
        return True, "cached", {"method": "cache"}

    m3u8 = video.get("_m3u8_base_url")
    cdn = video.get("_cdn_url")
    url = video.get("url") or ""
    last_result = None
    dl_env = os.environ.copy()
    if SCRAPE_PROXY:
        dl_env["HTTP_PROXY"] = SCRAPE_PROXY
        dl_env["HTTPS_PROXY"] = SCRAPE_PROXY
        dl_env["http_proxy"] = SCRAPE_PROXY
        dl_env["https_proxy"] = SCRAPE_PROXY
    try:
        if m3u8:
            method = "ffmpeg-m3u8"
            stream_url = m3u8.replace("_TPL_", "240p")
            cmd = ["ffmpeg", "-y", "-i", stream_url, "-c", "copy", dest]
            last_result = subprocess.run(cmd, capture_output=True, timeout=900, env=dl_env)
        elif cdn:
            method = "wget-cdn"
            cmd = ["wget", "-q", "--no-check-certificate", "-O", dest, cdn]
            last_result = subprocess.run(cmd, capture_output=True, timeout=900, env=dl_env)
        else:
            method = "yt-dlp"
            tmp = os.path.join(dest_dir, "dl.%(ext)s")
            cmd = ["yt-dlp", "--no-playlist", "--merge-output-format", "mp4",
                   "-f", "bestvideo[height<=720]+bestaudio/best",
                   "-o", tmp, "--socket-timeout", "30", "--retries", "3", url]
            if SCRAPE_PROXY:
                cmd[1:1] = ["--proxy", SCRAPE_PROXY]
            last_result = subprocess.run(cmd, capture_output=True, timeout=1800, env=dl_env)
            if not (os.path.exists(dest) and os.path.getsize(dest) > 100_000):
                for f in os.listdir(dest_dir):
                    if f.startswith("dl."):
                        shutil.move(os.path.join(dest_dir, f), dest)
                        break

        if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
            return True, "ok", {"method": method}

        size = os.path.getsize(dest) if os.path.exists(dest) else 0
        stderr = _stderr_tail(last_result)
        rc = last_result.returncode if last_result else None
        return False, f"output missing or too small ({size} bytes)", {
            "method": method,
            "exitCode": rc,
            "stderr": stderr,
        }
    except subprocess.TimeoutExpired as e:
        err = ""
        if e.stderr:
            err = (e.stderr.decode("utf-8", "ignore") if isinstance(e.stderr, bytes) else str(e.stderr))[-400:]
        return False, f"timeout after {e.timeout}s", {
            "method": locals().get("method", "unknown"),
            "stderr": err,
        }
    except Exception as e:
        return False, str(e), {"method": locals().get("method", "unknown"), "stderr": _stderr_tail(last_result)}


def _process_one(run, source_site, video) -> str:
    """
    Download + save one video. Returns 'new' | 'skip' | 'fail'.

    Opens its own DB connection so it is safe to run concurrently inside a thread
    pool (psycopg connections must not be shared across threads).
    """
    conn = db.connect()
    try:
        return _process_one_inner(conn, run, source_site, video)
    except Exception as e:
        _log_video_fail("process", video, run, source_site, e,
                        errorType=type(e).__name__,
                        traceback=traceback.format_exc()[-800:])
        return "fail"
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _process_one_inner(conn, run, source_site, video) -> str:
    url = video["url"]
    if db.video_exists(conn, url):
        return "skip"

    site_id = run["siteId"]
    tmp_dir = tempfile.mkdtemp(prefix="scrape_")
    try:
        ok, reason, dl_extra = _download(video, tmp_dir)
        if not ok:
            _log_video_fail("download", video, run, source_site, reason, **dl_extra)
            return "fail"

        video_path = os.path.join(tmp_dir, "video.mp4")
        duration = video.get("duration_sec") or media.probe_duration(video_path)
        if not duration:
            _log_video_fail("probe_duration", video, run, source_site,
                            "could not determine video duration")
            return "fail"

        preview = os.path.join(tmp_dir, "preview.mp4")
        thumb = os.path.join(tmp_dir, "thumbnail.jpg")
        sprite = os.path.join(tmp_dir, "storyboard.jpg")
        vtt = os.path.join(tmp_dir, "storyboard.vtt")

        if not media.make_preview(video_path, preview):
            _log_video_fail("make_preview", video, run, source_site, "ffmpeg preview generation failed")
            return "fail"
        if not media.make_thumbnail(video_path, thumb, video.get("thumbnail", "")):
            _log_video_fail("make_thumbnail", video, run, source_site, "thumbnail generation failed")
            return "fail"
        if not media.make_storyboard(video_path, sprite, vtt, duration):
            _log_video_fail("make_storyboard", video, run, source_site, "storyboard generation failed")
            return "fail"

        keys = dict(v=None, t=None, p=None, sb=None, vtt=None)
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
            if not keys["v"]:
                _log_video_fail("upload", video, run, source_site, "S3 video upload failed", videoId=vid)
                return "fail"
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
            local = os.path.join(ROOT, "downloads", vid)
            os.makedirs(local, exist_ok=True)
            for src, name in [(video_path, "video.mp4"), (preview, "thumbnail.mp4"), (thumb, "thumbnail.jpg")]:
                if os.path.exists(src):
                    shutil.copy(src, os.path.join(local, name))

        _event("info", "video_added", slug=slug, videoId=vid, durationSec=duration, **_video_ctx(video, run, source_site))
        return "new"
    except Exception as e:
        _log_video_fail("process", video, run, source_site, e,
                        errorType=type(e).__name__,
                        traceback=traceback.format_exc()[-800:])
        return "fail"
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def process_creator_upload(conn, video_id: str):
    """
    Process a creator upload that the web app streamed to the shared volume:
    normalize to MP4, generate preview/thumbnail/storyboard, upload to S3 under
    the video id (matching the CDN key scheme), then mark the video READY.
    """
    v = db.load_video(conn, video_id)
    if not v:
        _event("warning", "creator_not_found", videoId=video_id)
        return
    src = os.path.join(UPLOAD_DIR, video_id, "source")
    if not os.path.exists(src):
        _event("warning", "creator_source_missing", videoId=video_id, path=src)
        db.set_video_status(conn, video_id, "FAILED")
        return

    site_id = v["siteId"]
    db.set_video_status(conn, video_id, "PROCESSING")
    _event("info", "creator_start", videoId=video_id)
    tmp_dir = tempfile.mkdtemp(prefix="upload_")
    try:
        video_path = os.path.join(tmp_dir, "video.mp4")
        if not media.transcode_to_mp4(src, video_path):
            # Fallback: keep the original bytes if transcode failed but the file
            # is likely already a playable mp4.
            shutil.copy(src, video_path)
        duration = v.get("durationSec") or media.probe_duration(video_path)

        preview = os.path.join(tmp_dir, "preview.mp4")
        thumb = os.path.join(tmp_dir, "thumbnail.jpg")
        sprite = os.path.join(tmp_dir, "storyboard.jpg")
        vtt = os.path.join(tmp_dir, "storyboard.vtt")
        media.make_preview(video_path, preview)
        media.make_thumbnail(video_path, thumb, "")
        media.make_storyboard(video_path, sprite, vtt, duration)

        keys = dict(v=None, t=None, p=None, sb=None, vtt=None)
        if storage.configured():
            keys["v"] = storage.upload(video_path, storage.key_video(site_id, video_id), "video/mp4")
            if os.path.exists(thumb):
                keys["t"] = storage.upload(thumb, storage.key_thumb(site_id, video_id), "image/jpeg")
            if os.path.exists(preview):
                keys["p"] = storage.upload(preview, storage.key_preview(site_id, video_id), "video/mp4")
            if os.path.exists(sprite):
                keys["sb"] = storage.upload(sprite, storage.key_storyboard(site_id, video_id), "image/jpeg")
            if os.path.exists(vtt):
                keys["vtt"] = storage.upload(vtt, storage.key_storyboard_vtt(site_id, video_id), "text/vtt")
        else:
            # Dev fallback: keep files under downloads/{id}/ for local API routes.
            local = os.path.join(ROOT, "downloads", video_id)
            os.makedirs(local, exist_ok=True)
            for s, name in [(video_path, "video.mp4"), (preview, "thumbnail.mp4"), (thumb, "thumbnail.jpg")]:
                if os.path.exists(s):
                    shutil.copy(s, os.path.join(local, name))

        db.update_video_media(
            conn, video_id,
            s3_video_key=keys["v"], s3_thumb_key=keys["t"], s3_preview_key=keys["p"],
            s3_storyboard_key=keys["sb"], s3_storyboard_vtt_key=keys["vtt"],
            duration_sec=duration, status="READY",
        )
        _event("info", "creator_ready", videoId=video_id, durationSec=duration)
    except Exception as e:
        _event("warning", "creator_failed", videoId=video_id, reason=str(e)[:500],
               errorType=type(e).__name__, traceback=traceback.format_exc()[-800:])
        db.set_video_status(conn, video_id, "FAILED")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        shutil.rmtree(os.path.join(UPLOAD_DIR, video_id), ignore_errors=True)


def _run_stopped(conn, run_id: str) -> bool:
    """True when an admin has stopped the run (polled to make STOP take effect)."""
    return db.get_run_status(conn, run_id) == "STOPPED"


def _process_source(conn, run, source, min_dur, max_per_site, seen, totals) -> str:
    """
    Process one source for a run: paginate the source API, download new videos
    (up to DOWNLOAD_CONCURRENCY at once), and honor an admin STOP.

    `max_per_site` is None to download ALL results (bounded by ALL_CAP for safety).
    Returns 'done' | 'stopped'.
    """
    run_id = run["id"]
    searcher = SEARCHERS.get(source)
    if not searcher:
        db.set_run_site(conn, run_id, source, status="ERROR", error="unsupported source")
        return "done"

    db.set_run_site(conn, run_id, source, status="RUNNING")
    s = {"found": 0, "new_videos": 0, "skipped": 0, "failed": 0}
    download_all = max_per_site is None
    collected = 0  # search-result slots consumed (toward cap or ALL_CAP safety)
    skip = 0
    stopped = False

    def record(outcome):
        if outcome == "new":
            s["new_videos"] += 1; totals["new"] += 1
        elif outcome == "skip":
            s["skipped"] += 1; totals["skip"] += 1
        else:
            s["failed"] += 1; totals["fail"] += 1

    try:
        while not stopped:
            if _run_stopped(conn, run_id):
                stopped = True
                break
            if download_all:
                if collected >= ALL_CAP:
                    _event("warning", "source_all_cap", runId=run_id, sourceSite=source,
                           cap=ALL_CAP, collected=collected)
                    break
                batch_n = PAGE_BATCH
            else:
                if collected >= max_per_site:
                    break
                batch_n = min(PAGE_BATCH, max_per_site - collected)
            results = searcher(run["query"], batch_n, skip, min_dur)
            if not results:
                break

            # Cross-source within-run dedup by canonical key before downloading.
            fresh = []
            for v in results:
                key = db.canonical_key(v["url"]) or v["url"]
                if key in seen:
                    record("skip")
                    continue
                seen.add(key)
                fresh.append(v)
            s["found"] += len(results)
            totals["found"] += len(results)

            if fresh:
                with ThreadPoolExecutor(max_workers=DOWNLOAD_CONCURRENCY) as ex:
                    futures = {ex.submit(_process_one, run, source, v): v for v in fresh}
                    for fut in as_completed(futures):
                        v = futures[fut]
                        try:
                            outcome = fut.result()
                        except Exception as e:  # noqa: BLE001
                            _log_video_fail("thread", v, run, source, e,
                                            errorType=type(e).__name__,
                                            traceback=traceback.format_exc()[-800:])
                            outcome = "fail"
                        record(outcome)
                        db.set_run_site(conn, run_id, source, status="RUNNING", **s)
                        db.update_run_totals(conn, run_id, totals["new"], totals["skip"],
                                             totals["fail"], totals["found"])
                        if _run_stopped(conn, run_id):
                            stopped = True

            db.set_run_site(conn, run_id, source, status="RUNNING", **s)
            skip += len(results)
            collected += len(results)
            # Fewer hits than requested => source pagination exhausted.
            if len(results) < batch_n:
                break
            time.sleep(1)
    except Exception as e:  # noqa: BLE001
        _event("error", "source_error", runId=run_id, sourceSite=source,
               reason=str(e)[:500], traceback=traceback.format_exc()[-800:], **s)
        db.set_run_site(conn, run_id, source, status="ERROR", error=str(e)[:500], **s)
        return "done"

    if s["failed"]:
        _event("warning", "source_summary", runId=run_id, sourceSite=source,
               failed=s["failed"], newVideos=s["new_videos"], skipped=s["skipped"], found=s["found"])

    if stopped:
        # Re-queue this source so an admin "continue" re-runs it (dedup skips what
        # was already saved). Completed sources stay DONE.
        db.set_run_site(conn, run_id, source, status="QUEUED", **s)
        return "stopped"
    db.set_run_site(conn, run_id, source, status="DONE", **s)
    return "done"


def process_run(conn, run_id: str):
    run = db.load_run(conn, run_id)
    if not run:
        log.warning(_j(f"run {run_id} not found"))
        return
    # A run stopped by an admin (or already finished) must not be (re)started —
    # this guards duplicate queue entries and the startup resume path.
    if run["status"] in ("STOPPED", "DONE"):
        log.info(_j(f"run {run_id} is {run['status']}, skipping"))
        return

    sources = json.loads(run["selectedSites"])
    min_dur = run["minDurationSec"]
    max_per_site = run["maxPerSite"]  # None => download ALL
    cap = max_per_site if max_per_site else "all"
    _event("info", "run_start", runId=run_id, query=run["query"], sources=sources,
           perSite=cap, concurrency=DOWNLOAD_CONCURRENCY, minDurationSec=min_dur)
    db.set_run_status(conn, run_id, "RUNNING", started=True)

    # Warm the shared S3 client once before spawning threads (avoids a lazy-init race).
    if storage.configured():
        try:
            storage.s3()
        except Exception:  # noqa: BLE001
            pass

    seen = set()  # within-run dedup across sources
    totals = {"new": 0, "skip": 0, "fail": 0, "found": 0}
    stopped = False

    for source in sources:
        if _run_stopped(conn, run_id):
            stopped = True
            break
        outcome = _process_source(conn, run, source, min_dur, max_per_site, seen, totals)
        db.update_run_totals(conn, run_id, totals["new"], totals["skip"], totals["fail"], totals["found"])
        if outcome == "stopped":
            stopped = True
            break

    db.update_run_totals(conn, run_id, totals["new"], totals["skip"], totals["fail"], totals["found"])
    if stopped:
        db.set_run_status(conn, run_id, "STOPPED", finished=True)
        _event("info", "run_stopped", runId=run_id, **totals)
    else:
        db.set_run_status(conn, run_id, "DONE", finished=True)
        _event("info", "run_done", runId=run_id, **totals)


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

    # Resume runs interrupted by a restart: re-enqueue anything still RUNNING or
    # QUEUED. STOPPED/DONE/ERROR runs are excluded, and process_run guards against
    # duplicate queue entries, so this is safe even if some are still in the queue.
    try:
        resumable = db.list_active_runs(conn)
        for rid in resumable:
            r.rpush(QUEUE_KEY, rid)
        if resumable:
            log.info(_j(f"resuming {len(resumable)} interrupted run(s): {resumable}"))
    except Exception as e:  # noqa: BLE001
        log.error(_j(f"resume scan failed: {e}"))

    log.info(_j("worker started, waiting for jobs"))
    while True:
        try:
            item = r.blpop([QUEUE_KEY, CREATOR_QUEUE_KEY], timeout=5)
            if not item:
                continue
            queue = item[0].decode() if isinstance(item[0], bytes) else item[0]
            job_id = item[1].decode() if isinstance(item[1], bytes) else item[1]
            if queue == CREATOR_QUEUE_KEY:
                process_creator_upload(conn, job_id)
            else:
                process_run(conn, job_id)
        except Exception as e:
            log.error(_j(f"worker loop error: {e}"))
            time.sleep(3)


if __name__ == "__main__":
    main()
