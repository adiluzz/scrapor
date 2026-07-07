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
from scrape_search import search_candidates  # noqa: E402

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
PREVIEW_QUEUE_KEY = "preview:queue"
SCRAPE_SEARCH_QUEUE_KEY = "scrape:search:queue"
SCRAPE_SEARCH_RESULT_PREFIX = "scrape:search:result:"
# Shared volume the web app writes creator uploads to (see docker-compose).
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(ROOT, "uploads"))
# Optional HTTP(S) proxy for source downloads (or use docker-compose.vpn.yml).
SCRAPE_PROXY = os.environ.get("SCRAPE_HTTP_PROXY") or os.environ.get("HTTPS_PROXY") or ""
# Per-file wget / m3u8 attempt timeout (ParadiseHill parts can be 100MB+ on slow links).
DOWNLOAD_TIMEOUT = int(os.environ.get("SCRAPE_DOWNLOAD_TIMEOUT_SEC", "900"))
# ffmpeg concat / yt-dlp timeout (full multi-part merge or site extract).
DOWNLOAD_LONG_TIMEOUT = int(os.environ.get("SCRAPE_DOWNLOAD_LONG_TIMEOUT_SEC", "3600"))
# yt-dlp: best available video+audio; m3u8 fast path tries highest HLS rung first.
YTDLP_FORMAT = "bestvideo+bestaudio/best"
M3U8_QUALITIES = ("1080p", "720p", "480p", "240p")


def _download_m3u8(m3u8: str, dest: str, dl_env: dict, timeout: int | None = None):
    """Download XHamster-style HLS template URLs, preferring highest quality."""
    timeout = timeout if timeout is not None else DOWNLOAD_TIMEOUT
    last_result = None
    for quality in M3U8_QUALITIES:
        stream_url = m3u8.replace("_TPL_", quality)
        cmd = ["ffmpeg", "-y", "-i", stream_url, "-c", "copy", dest]
        last_result = subprocess.run(cmd, capture_output=True, timeout=timeout, env=dl_env)
        if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
            return True, last_result, quality
        if os.path.exists(dest):
            os.remove(dest)
    return False, last_result, None


def _disk_free_mb(path: str = "/tmp") -> int:
    try:
        st = os.statvfs(path)
        return (st.f_bavail * st.f_frsize) // (1024 * 1024)
    except OSError:
        return 0


def _download_eporner(page_url: str, dload_url: str, dest: str, dl_env: dict) -> tuple[bool, subprocess.CompletedProcess | None]:
    """Download via Eporner /dload/ redirect using a browser-impersonated session."""
    import time
    last_err = ""
    for attempt in range(3):
        ok, err = _download_eporner_once(page_url, dload_url, dest, dl_env)
        if ok:
            return True, None
        last_err = err
        if attempt < 2:
            time.sleep(5 * (attempt + 1))
    return False, None


def _download_eporner_once(page_url: str, dload_url: str, dest: str, dl_env: dict) -> tuple[bool, str]:
    proxy = SCRAPE_PROXY or None
    proxies = {"http": proxy, "https": proxy} if proxy else None
    try:
        from curl_cffi import requests as cr
        session = cr.Session(impersonate="chrome120")
        session.get(page_url, timeout=30, proxies=proxies)
        resp = session.get(
            dload_url, timeout=DOWNLOAD_LONG_TIMEOUT, proxies=proxies,
            allow_redirects=True, stream=True,
        )
        ctype = (resp.headers.get("content-type") or "").lower()
        if resp.status_code != 200 or "text/html" in ctype:
            return False, f"HTTP {resp.status_code} ctype={ctype[:40]}"
        expected = int(resp.headers.get("content-length") or 0)
        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(1024 * 1024):
                if chunk:
                    fh.write(chunk)
        size = os.path.getsize(dest) if os.path.exists(dest) else 0
        if size <= 100_000:
            return False, f"too small ({size} bytes)"
        if expected and size < expected * 0.95:
            return False, f"incomplete ({size}/{expected} bytes)"
        return True, ""
    except Exception as e:
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except OSError:
                pass
        return False, str(e)


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

    free_mb = _disk_free_mb(dest_dir)
    if free_mb and free_mb < 2048:
        return False, f"insufficient disk space ({free_mb}MB free)", {"method": "disk-check"}

    m3u8 = video.get("_m3u8_base_url")
    cdn = video.get("_cdn_url")
    parts = video.get("_part_urls")
    url = video.get("url") or ""
    last_result = None
    dl_env = os.environ.copy()
    if SCRAPE_PROXY:
        dl_env["HTTP_PROXY"] = SCRAPE_PROXY
        dl_env["HTTPS_PROXY"] = SCRAPE_PROXY
        dl_env["http_proxy"] = SCRAPE_PROXY
        dl_env["https_proxy"] = SCRAPE_PROXY
    try:
        if parts and isinstance(parts, list) and len(parts) > 1:
            method = "wget-concat"
            part_files = []
            for i, part_url in enumerate(parts):
                if not part_url:
                    continue
                pf = os.path.join(dest_dir, f"part_{i:03d}.mp4")
                cmd = ["wget", "-q", "--no-check-certificate", "-O", pf, str(part_url)]
                last_result = subprocess.run(cmd, capture_output=True, timeout=DOWNLOAD_TIMEOUT, env=dl_env)
                if not (os.path.exists(pf) and os.path.getsize(pf) > 100_000):
                    size = os.path.getsize(pf) if os.path.exists(pf) else 0
                    return False, f"part {i + 1} missing or too small ({size} bytes)", {
                        "method": method,
                        "exitCode": last_result.returncode if last_result else None,
                        "stderr": _stderr_tail(last_result),
                    }
                part_files.append(pf)
            if len(part_files) < 2:
                return False, "multi-part download produced fewer than 2 files", {"method": method}
            list_file = os.path.join(dest_dir, "concat.txt")
            with open(list_file, "w", encoding="utf-8") as fh:
                for pf in part_files:
                    fh.write(f"file '{pf}'\n")
            cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", dest]
            last_result = subprocess.run(cmd, capture_output=True, timeout=DOWNLOAD_LONG_TIMEOUT, env=dl_env)
        elif m3u8:
            method = "ffmpeg-m3u8"
            ok, last_result, quality = _download_m3u8(m3u8, dest, dl_env)
            if not ok:
                return False, "m3u8 download failed at all qualities", {
                    "method": method,
                    "exitCode": last_result.returncode if last_result else None,
                    "stderr": _stderr_tail(last_result),
                }
            method = f"ffmpeg-m3u8-{quality}"
        elif cdn:
            if "eporner.com/dload/" in cdn:
                method = "curl-dload"
                ok, last_result = _download_eporner(url, cdn, dest, dl_env)
                if not ok:
                    return False, "eporner dload download failed", {
                        "method": method,
                        "stderr": _stderr_tail(last_result),
                    }
            else:
                method = "wget-cdn"
                cmd = ["wget", "-q", "--no-check-certificate", "-O", dest, cdn]
                last_result = subprocess.run(cmd, capture_output=True, timeout=DOWNLOAD_TIMEOUT, env=dl_env)
        else:
            method = "yt-dlp"
            tmp = os.path.join(dest_dir, "dl.%(ext)s")
            cmd = ["yt-dlp", "--no-playlist", "--merge-output-format", "mp4",
                   "-f", YTDLP_FORMAT,
                   "-o", tmp, "--socket-timeout", "30", "--retries", "3", url]
            if SCRAPE_PROXY:
                cmd[1:1] = ["--proxy", SCRAPE_PROXY]
            last_result = subprocess.run(cmd, capture_output=True, timeout=DOWNLOAD_LONG_TIMEOUT, env=dl_env)
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
        if db.get_run_status(conn, run["id"]) == "STOPPED":
            return "skip"
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

        if not media.make_preview(video_path, preview, duration=duration):
            _log_video_fail("make_preview", video, run, source_site, "ffmpeg preview generation failed")
            return "fail"
        if not media.make_thumbnail(video_path, thumb, video.get("thumbnail", "")):
            _log_video_fail("make_thumbnail", video, run, source_site, "thumbnail generation failed")
            return "fail"
        storyboard_ok = media.make_storyboard(video_path, sprite, vtt, duration)
        if not storyboard_ok:
            _event("warning", "storyboard_skipped", reason="storyboard generation failed",
                   **_video_ctx(video, run, source_site))

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
                    '"s3StoryboardKey"=%s,"s3StoryboardVttKey"=%s,"previewVersion"=%s WHERE id=%s',
                    (keys["v"], keys["t"], keys["p"], keys["sb"], keys["vtt"], media.PREVIEW_VERSION, vid),
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
        media.make_preview(video_path, preview, duration=duration or 0)
        media.make_thumbnail(video_path, thumb, "")
        media.make_storyboard(video_path, sprite, vtt, duration or 0)

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
            preview_version=media.PREVIEW_VERSION,
        )
        _event("info", "creator_ready", videoId=video_id, durationSec=duration)
    except Exception as e:
        _event("warning", "creator_failed", videoId=video_id, reason=str(e)[:500],
               errorType=type(e).__name__, traceback=traceback.format_exc()[-800:])
        db.set_video_status(conn, video_id, "FAILED")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        shutil.rmtree(os.path.join(UPLOAD_DIR, video_id), ignore_errors=True)


def _resolve_source_video(conn, video_id: str, site_id: str, s3_video_key: str | None, dest: str) -> bool:
    """Copy or download the full video to dest for media regeneration."""
    if storage.configured() and s3_video_key:
        if storage.download(s3_video_key, dest):
            return True
    for name in ("video.mp4", "preview.mp4"):
        local = os.path.join(ROOT, "downloads", video_id, name)
        if os.path.exists(local) and os.path.getsize(local) > 10_000:
            shutil.copy(local, dest)
            return True
    return False


def process_regenerate_preview(conn, video_id: str):
    """Rebuild hover preview (v2) and adaptive storyboard for an existing video."""
    v = db.load_video_media(conn, video_id)
    if not v:
        _event("warning", "preview_regen_not_found", videoId=video_id)
        return

    site_id = v["siteId"]
    duration = v.get("durationSec") or 0
    _event("info", "preview_regen_start", videoId=video_id, durationSec=duration,
           previewVersion=v.get("previewVersion"))

    tmp_dir = tempfile.mkdtemp(prefix="preview_regen_")
    try:
        video_path = os.path.join(tmp_dir, "video.mp4")
        if not _resolve_source_video(conn, video_id, site_id, v.get("s3VideoKey"), video_path):
            _event("warning", "preview_regen_no_source", videoId=video_id)
            return

        if duration <= 0:
            duration = media.probe_duration(video_path)

        preview = os.path.join(tmp_dir, "preview.mp4")
        sprite = os.path.join(tmp_dir, "storyboard.jpg")
        vtt = os.path.join(tmp_dir, "storyboard.vtt")

        if not media.make_preview(video_path, preview, duration=duration, force=True):
            _event("warning", "preview_regen_failed", videoId=video_id, stage="make_preview")
            return

        storyboard_ok = media.make_storyboard(video_path, sprite, vtt, duration, force=True)

        preview_key = v.get("s3PreviewKey")
        storyboard_key = v.get("s3StoryboardKey")
        vtt_key = v.get("s3StoryboardVttKey")

        if storage.configured():
            preview_key = storage.upload(
                preview, storage.key_preview(site_id, video_id), "video/mp4"
            ) or preview_key
            if storyboard_ok:
                storyboard_key = storage.upload(
                    sprite, storage.key_storyboard(site_id, video_id), "image/jpeg"
                ) or storyboard_key
                vtt_key = storage.upload(
                    vtt, storage.key_storyboard_vtt(site_id, video_id), "text/vtt"
                ) or vtt_key
        else:
            local_dir = os.path.join(ROOT, "downloads", video_id)
            os.makedirs(local_dir, exist_ok=True)
            shutil.copy(preview, os.path.join(local_dir, "preview.mp4"))
            if storyboard_ok:
                shutil.copy(sprite, os.path.join(local_dir, "storyboard.jpg"))
                shutil.copy(vtt, os.path.join(local_dir, "storyboard.vtt"))
            preview_key = preview_key or f"local:{video_id}/preview.mp4"

        db.update_video_preview_media(
            conn,
            video_id,
            s3_preview_key=preview_key,
            s3_storyboard_key=storyboard_key if storyboard_ok else v.get("s3StoryboardKey"),
            s3_storyboard_vtt_key=vtt_key if storyboard_ok else v.get("s3StoryboardVttKey"),
            preview_version=media.PREVIEW_VERSION,
        )
        _event("info", "preview_regen_done", videoId=video_id, previewVersion=media.PREVIEW_VERSION,
               storyboard=storyboard_ok)
    except Exception as e:
        _event("warning", "preview_regen_failed", videoId=video_id, reason=str(e)[:500],
               errorType=type(e).__name__, traceback=traceback.format_exc()[-800:])
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _run_stopped(conn, run_id: str) -> bool:
    """True when an admin has stopped the run (polled to make STOP take effect)."""
    return db.get_run_status(conn, run_id) == "STOPPED"


def _normalize_candidate(c: dict) -> dict:
    """Map API/camelCase candidate fields to the worker video dict shape."""
    return {
        "url": c.get("url") or "",
        "title": c.get("title") or "Unknown",
        "description": c.get("description") or "",
        "tags": c.get("tags") or [],
        "pornstars": c.get("pornstars") or [],
        "thumbnail": c.get("thumbnail") or "",
        "duration_sec": c.get("duration_sec") if c.get("duration_sec") is not None else c.get("durationSec"),
        "_m3u8_base_url": c.get("_m3u8_base_url"),
        "_cdn_url": c.get("_cdn_url"),
        "_part_urls": c.get("_part_urls"),
    }


def _process_selected(conn, run, candidates, totals) -> str:
    """Download admin-selected candidates from an interactive scrape run."""
    run_id = run["id"]
    by_source: dict[str, list] = {}
    for c in candidates:
        src = c.get("sourceSite") or c.get("source_site") or "unknown"
        by_source.setdefault(src, []).append(_normalize_candidate(c))

    seen: set[str] = set()
    stopped = False

    for source, vids in by_source.items():
        if _run_stopped(conn, run_id):
            stopped = True
            break

        db.set_run_site(conn, run_id, source, status="RUNNING")
        s = {"found": len(vids), "new_videos": 0, "skipped": 0, "failed": 0}
        totals["found"] += len(vids)

        def record(outcome):
            if outcome == "new":
                s["new_videos"] += 1
                totals["new"] += 1
            elif outcome == "skip":
                s["skipped"] += 1
                totals["skip"] += 1
            else:
                s["failed"] += 1
                totals["fail"] += 1

        fresh = []
        for v in vids:
            key = db.canonical_key(v.get("url") or "") or v.get("url") or ""
            if not key or key in seen:
                record("skip")
                continue
            seen.add(key)
            fresh.append(v)

        db.set_run_site(conn, run_id, source, status="RUNNING", **s)
        db.update_run_totals(conn, run_id, totals["new"], totals["skip"],
                             totals["fail"], totals["found"])

        if fresh:
            ex = ThreadPoolExecutor(max_workers=DOWNLOAD_CONCURRENCY)
            futures = {ex.submit(_process_one, run, source, v): v for v in fresh}
            try:
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
                        break
            finally:
                ex.shutdown(wait=not stopped, cancel_futures=stopped)

        if stopped:
            db.set_run_site(conn, run_id, source, status="QUEUED", **s)
            return "stopped"
        db.set_run_site(conn, run_id, source, status="DONE", **s)

    return "stopped" if stopped else "done"


def process_scrape_search(r, conn, payload_json: str):
    """Handle interactive scrape preview search requests from the web app."""
    req = json.loads(payload_json)
    rid = req.get("id") or ""
    result_key = f"{SCRAPE_SEARCH_RESULT_PREFIX}{rid}"
    try:
        result = search_candidates(
            query=req["query"],
            sources=req["sources"],
            min_duration_sec=int(req.get("minDurationSec", 600)),
            cursors=req.get("cursors"),
            limit=int(req.get("limit", 50)),
            exclude_urls=req.get("excludeUrls"),
        )
        payload = {"ok": True, **result}
    except Exception as e:  # noqa: BLE001
        payload = {"ok": False, "error": str(e)[:500]}
    r.set(result_key, json.dumps(payload), ex=120)


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
    cursor = 0  # page cursor (HTML / Eporner) or result offset (API libs)
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
            results, cursor, exhausted = searcher(run["query"], batch_n, cursor, min_dur)
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
            # Persist search hits before downloads so the admin UI doesn't show
            # Found: 0 while yt-dlp is pulling a large first video over VPN.
            db.set_run_site(conn, run_id, source, status="RUNNING", **s)
            db.update_run_totals(conn, run_id, totals["new"], totals["skip"],
                                 totals["fail"], totals["found"])
            _event("info", "search_batch", runId=run_id, sourceSite=source,
                   query=run["query"], batch=len(results), fresh=len(fresh),
                   skipDupes=len(results) - len(fresh))

            if fresh:
                ex = ThreadPoolExecutor(max_workers=DOWNLOAD_CONCURRENCY)
                futures = {ex.submit(_process_one, run, source, v): v for v in fresh}
                try:
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
                            break
                finally:
                    # Don't block the queue on in-flight downloads after an admin STOP.
                    ex.shutdown(wait=not stopped, cancel_futures=stopped)

            if stopped:
                break
            db.set_run_site(conn, run_id, source, status="RUNNING", **s)
            collected += len(results)
            if exhausted:
                break
            if not download_all and len(results) < batch_n:
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
    if run["status"] in ("STOPPED", "DONE", "ERROR"):
        log.info(_j(f"run {run_id} is {run['status']}, skipping"))
        return

    sources = json.loads(run["selectedSites"])
    min_dur = run["minDurationSec"]
    max_per_site = run["maxPerSite"]  # None => download ALL
    selected_raw = run.get("selectedCandidates")
    selected = json.loads(selected_raw) if selected_raw else None
    cap = max_per_site if max_per_site else "all"
    _event("info", "run_start", runId=run_id, query=run["query"], sources=sources,
           perSite=cap, concurrency=DOWNLOAD_CONCURRENCY, minDurationSec=min_dur,
           interactive=bool(selected))
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

    if selected:
        outcome = _process_selected(conn, run, selected, totals)
        db.update_run_totals(conn, run_id, totals["new"], totals["skip"], totals["fail"], totals["found"])
        if outcome == "stopped":
            stopped = True
    else:
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
    parser.add_argument("--regenerate-preview", help="Regenerate hover preview for a Video id and exit")
    args = parser.parse_args()

    conn = db.connect()

    if args.regenerate_preview:
        process_regenerate_preview(conn, args.regenerate_preview)
        return

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
            item = r.blpop([QUEUE_KEY, CREATOR_QUEUE_KEY, PREVIEW_QUEUE_KEY, SCRAPE_SEARCH_QUEUE_KEY], timeout=5)
            if not item:
                continue
            queue = item[0].decode() if isinstance(item[0], bytes) else item[0]
            job_id = item[1].decode() if isinstance(item[1], bytes) else item[1]
            if queue == CREATOR_QUEUE_KEY:
                process_creator_upload(conn, job_id)
            elif queue == PREVIEW_QUEUE_KEY:
                process_regenerate_preview(conn, job_id)
            elif queue == SCRAPE_SEARCH_QUEUE_KEY:
                process_scrape_search(r, conn, job_id)
            else:
                process_run(conn, job_id)
        except Exception as e:
            log.error(_j(f"worker loop error: {e}"))
            time.sleep(3)


if __name__ == "__main__":
    main()
