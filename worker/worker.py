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
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import NamedTuple
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db  # noqa: E402
import storage  # noqa: E402
import media  # noqa: E402
import tpdb  # noqa: E402
from site_searchers import SEARCHERS  # noqa: E402
from scrape_search import apply_download_urls, refresh_download_urls, resolve_urls, search_candidates  # noqa: E402

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


class ProcessOutcome(NamedTuple):
    result: str  # new | skip | fail
    reason: str = ""
    stage: str = ""


def _apply_process_outcome(conn, run_id, video, source_site, po: ProcessOutcome, record_fn):
    record_fn(po.result)
    if po.result != "new":
        db.record_run_outcome(
            conn,
            run_id,
            video,
            source_site,
            po.result,
            po.reason or ("Skipped" if po.result == "skip" else "Failed"),
            po.stage or None,
        )


# How many videos to download+save concurrently.
DOWNLOAD_CONCURRENCY = int(os.environ.get("SCRAPE_DOWNLOAD_CONCURRENCY", "5"))
# Page size when paginating a source for a run.
PAGE_BATCH = int(os.environ.get("SCRAPE_PAGE_BATCH", "50"))
# Safety upper bound when maxPerSite is null (download ALL) so a run can't loop forever.
ALL_CAP = int(os.environ.get("SCRAPE_ALL_MAX", "100000"))
QUEUE_KEY = "scrape:queue"
CREATOR_QUEUE_KEY = "creator:queue"
PREVIEW_QUEUE_KEY = "preview:queue"
REDOWNLOAD_QUEUE_KEY = "redownload:queue"
SCRAPE_SEARCH_QUEUE_KEY = "scrape:search:queue"
PORNSTAR_TPDB_QUEUE_KEY = "pornstar:tpdb:queue"
SCRAPE_SEARCH_RESULT_PREFIX = "scrape:search:result:"
# Shared volume the web app writes creator uploads to (see docker-compose).
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(ROOT, "uploads"))
# Optional HTTP(S) proxy for source downloads (or use docker-compose.vpn.yml).
SCRAPE_PROXY = os.environ.get("SCRAPE_HTTP_PROXY") or os.environ.get("HTTPS_PROXY") or ""
# Per-file wget / m3u8 attempt timeout (ParadiseHill parts can be 100MB+ on slow links).
DOWNLOAD_TIMEOUT = int(os.environ.get("SCRAPE_DOWNLOAD_TIMEOUT_SEC", "900"))
# ffmpeg concat / yt-dlp timeout (full multi-part merge or site extract).
DOWNLOAD_LONG_TIMEOUT = int(os.environ.get("SCRAPE_DOWNLOAD_LONG_TIMEOUT_SEC", "3600"))
# Fast-path download attempts with a fresh page URL each time; final attempt uses yt-dlp.
DOWNLOAD_ATTEMPTS = max(1, int(os.environ.get("SCRAPE_DOWNLOAD_ATTEMPTS", "3")))
DOWNLOAD_RETRY_DELAY_SEC = float(os.environ.get("SCRAPE_DOWNLOAD_RETRY_DELAY_SEC", "5"))
# yt-dlp: best available video+audio; m3u8 fast path tries highest HLS rung first.
YTDLP_FORMAT = "bestvideo+bestaudio/best"
M3U8_QUALITIES = ("1080p", "720p", "480p", "240p")
# ParadiseHill CDN (vN.paradisehill.cc) returns 503 to NordVPN exits; download it
# direct (no SCRAPE_HTTP_PROXY) when the worker uses proxy-mode VPN.
_PH_CDN_HOST_RE = re.compile(r"(?:^|\.)paradisehill\.cc$", re.I)
# CDN also rate-limits parallel connections (wget exit 8 → empty file). Serialize
# PH media downloads across the worker's thread pool.
_PH_CDN_CONCURRENCY = max(1, int(os.environ.get("SCRAPE_PH_CDN_CONCURRENCY", "1")))
_PH_CDN_SEMAPHORE = threading.Semaphore(_PH_CDN_CONCURRENCY)
_PH_CDN_RETRIES = max(1, int(os.environ.get("SCRAPE_PH_CDN_RETRIES", "3")))
_DOWNLOAD_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _download_m3u8(
    m3u8: str,
    dest: str,
    dl_env: dict,
    timeout: int | None = None,
    duration_sec: int | float | None = None,
):
    """Download XHamster-style HLS template URLs, preferring highest quality."""
    timeout = timeout if timeout is not None else DOWNLOAD_TIMEOUT
    last_result = None
    for quality in M3U8_QUALITIES:
        stream_url = m3u8.replace("_TPL_", quality)
        cmd = ["ffmpeg", "-y", "-i", stream_url, "-c", "copy", dest]
        last_result = subprocess.run(cmd, capture_output=True, timeout=timeout, env=dl_env)
        ok, _reason = _download_looks_complete(dest, duration_sec)
        if ok:
            return True, last_result, quality
        if os.path.exists(dest):
            os.remove(dest)
    return False, last_result, None


def _is_paradisehill_cdn(url: str) -> bool:
    """True for ParadiseHill video CDN hosts (not the HTML site)."""
    host = (urlparse(url or "").hostname or "").lower()
    if not host:
        return False
    # HTML is en.paradisehill.cc; media is v1/v2/...paradisehill.cc
    if host == "en.paradisehill.cc" or host == "paradisehill.cc" or host.startswith("www."):
        return False
    return bool(_PH_CDN_HOST_RE.search(host))


def _dl_env_for_url(base_env: dict, url: str) -> dict:
    """Drop HTTP(S) proxy for ParadiseHill CDN — NordVPN exits get HTTP 503 there."""
    env = base_env.copy()
    if _is_paradisehill_cdn(url):
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
            env.pop(key, None)
        # Force direct connect even if a process-wide proxy is set.
        existing = env.get("NO_PROXY") or env.get("no_proxy") or ""
        bypass = "paradisehill.cc,.paradisehill.cc"
        env["NO_PROXY"] = f"{existing},{bypass}" if existing else bypass
        env["no_proxy"] = env["NO_PROXY"]
    return env


def _wget_cdn_cmd(dest: str, cdn_url: str, referer: str = "") -> list[str]:
    """wget with browser-like headers; Referer helps some adult CDNs."""
    cmd = ["wget", "-q", "--no-check-certificate", "--timeout=60", "--tries=1"]
    if referer:
        cmd += ["--referer", referer]
    cmd += [
        "--header", f"User-Agent: {_DOWNLOAD_UA}",
        "--header", "Accept: */*",
        "-O", dest, str(cdn_url),
    ]
    return cmd


def _run_wget_cdn(
    dest: str,
    cdn_url: str,
    dl_env: dict,
    referer: str = "",
    timeout: int | None = None,
) -> subprocess.CompletedProcess | None:
    """
    Download one CDN URL with wget. ParadiseHill hosts are serialized and
    retried — parallel hits return HTTP errors and 0-byte files.
    """
    timeout = timeout if timeout is not None else DOWNLOAD_TIMEOUT
    env = _dl_env_for_url(dl_env, cdn_url)
    cmd = _wget_cdn_cmd(dest, cdn_url, referer=referer)
    is_ph = _is_paradisehill_cdn(cdn_url)
    attempts = _PH_CDN_RETRIES if is_ph else 1
    last: subprocess.CompletedProcess | None = None
    lock = _PH_CDN_SEMAPHORE if is_ph else None

    for attempt in range(1, attempts + 1):
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except OSError:
                pass
        if lock:
            lock.acquire()
        try:
            last = subprocess.run(cmd, capture_output=True, timeout=timeout, env=env)
        finally:
            if lock:
                lock.release()
        size = os.path.getsize(dest) if os.path.exists(dest) else 0
        if size > 100_000:
            return last
        if attempt < attempts:
            time.sleep(min(30.0, 2.0 * attempt))
    return last


def _disk_free_mb(path: str = "/tmp") -> int:
    try:
        st = os.statvfs(path)
        return (st.f_bavail * st.f_frsize) // (1024 * 1024)
    except OSError:
        return 0


def _min_download_bytes(duration_sec: int | float | None) -> int:
    """
    Reject truncated downloads that still clear a tiny absolute floor.

    Failed/interrupted HLS often leaves 128KiB–512KiB stubs that used to pass
    the old 100KB check and get marked READY — those play as broken videos.
    """
    floor = 2_000_000  # 2 MiB absolute minimum
    if duration_sec and float(duration_sec) > 0:
        # ~200 kbps ≈ 25 KB/s — below any real 480p encode for the claimed length
        return max(floor, int(float(duration_sec) * 25_000))
    return floor


def _download_looks_complete(path: str, duration_sec: int | float | None = None) -> tuple[bool, str]:
    """Return (ok, reason) after size (+ optional duration) sanity checks."""
    if not os.path.exists(path):
        return False, "missing"
    size = os.path.getsize(path)
    need = _min_download_bytes(duration_sec)
    if size < need:
        return False, f"too small ({size} bytes, need >= {need})"
    if duration_sec and float(duration_sec) >= 120:
        probed = media.probe_duration(path)
        if probed and probed < float(duration_sec) * 0.5:
            return False, f"duration too short (probed {probed:.0f}s vs expected {int(duration_sec)}s)"
    return True, "ok"


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


def _clean_download_artifacts(dest_dir: str) -> None:
    """Remove partial downloads before a retry."""
    dest = os.path.join(dest_dir, "video.mp4")
    if os.path.exists(dest):
        try:
            os.remove(dest)
        except OSError:
            pass
    try:
        names = os.listdir(dest_dir)
    except OSError:
        return
    for name in names:
        if name.startswith("part_") or name.startswith("dl.") or name == "concat.txt":
            try:
                os.remove(os.path.join(dest_dir, name))
            except OSError:
                pass


def _refresh_video_download_urls(video: dict, source_site: str, attempt: int) -> None:
    url = video.get("url") or ""
    refreshed = refresh_download_urls(url, source_site)
    if refreshed:
        apply_download_urls(video, refreshed)
    _event(
        "info",
        "download_urls_refreshed",
        attempt=attempt,
        hasCdn=bool(video.get("_cdn_url")),
        hasM3u8=bool(video.get("_m3u8_base_url")),
        hasParts=bool(video.get("_part_urls")),
        url=url[:200],
    )


def _download_with_retries(video, dest_dir, source_site, run) -> tuple[bool, str, dict]:
    """Download with fresh source URLs on each attempt; yt-dlp after fast-path retries."""
    last_reason = "unknown"
    last_extra: dict = {}

    for attempt in range(1, DOWNLOAD_ATTEMPTS + 1):
        if attempt > 1:
            _clean_download_artifacts(dest_dir)
            time.sleep(DOWNLOAD_RETRY_DELAY_SEC * (attempt - 1))

        _refresh_video_download_urls(video, source_site, attempt)
        ok, reason, extra = _download(video, dest_dir, force_ytdlp=False)
        if ok:
            if attempt > 1:
                extra = {**extra, "attempt": attempt}
            return True, reason, extra

        last_reason = reason
        last_extra = {**extra, "attempt": attempt}
        _event(
            "warning",
            "download_attempt_failed",
            attempt=attempt,
            maxAttempts=DOWNLOAD_ATTEMPTS,
            reason=str(reason)[:300],
            method=extra.get("method"),
            exitCode=extra.get("exitCode"),
            stderr=str(extra.get("stderr") or "")[:400] or None,
            **_video_ctx(video, run, source_site),
        )

    # yt-dlp cannot extract ParadiseHill film pages; skip the useless fallback.
    if source_site == "ParadiseHill" and (
        video.get("_part_urls") or video.get("_cdn_url")
    ):
        return False, last_reason, {
            **last_extra,
            "attempts": DOWNLOAD_ATTEMPTS,
            "fallback": "skipped-ytdlp",
        }

    _clean_download_artifacts(dest_dir)
    _refresh_video_download_urls(video, source_site, DOWNLOAD_ATTEMPTS + 1)
    ok, reason, extra = _download(video, dest_dir, force_ytdlp=True)
    if ok:
        return True, reason, {**extra, "attempt": DOWNLOAD_ATTEMPTS + 1, "fallback": "yt-dlp"}

    return False, reason, {**extra, "attempts": DOWNLOAD_ATTEMPTS + 1, "fallback": "yt-dlp"}


# ── Downloaders ───────────────────────────────────────────────────────
def _download(video, dest_dir, force_ytdlp: bool = False) -> tuple[bool, str, dict]:
    """
    Download source video to dest_dir/video.mp4.
    Returns (ok, reason, extra) where extra may hold method/stderr for logging.
    """
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, "video.mp4")
    duration_hint = video.get("duration_sec")
    cached_ok, cached_reason = _download_looks_complete(dest, duration_hint)
    if cached_ok:
        return True, "cached", {"method": "cache"}
    if os.path.exists(dest):
        # Stale truncated cache from a prior failed attempt.
        try:
            os.remove(dest)
        except OSError:
            pass

    free_mb = _disk_free_mb(dest_dir)
    if free_mb and free_mb < 2048:
        return False, f"insufficient disk space ({free_mb}MB free)", {"method": "disk-check"}

    m3u8 = None if force_ytdlp else video.get("_m3u8_base_url")
    cdn = None if force_ytdlp else video.get("_cdn_url")
    parts = None if force_ytdlp else video.get("_part_urls")
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
                last_result = _run_wget_cdn(pf, str(part_url), dl_env, referer=url)
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
            ok, last_result, quality = _download_m3u8(
                m3u8, dest, dl_env, duration_sec=duration_hint,
            )
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
                last_result = _run_wget_cdn(dest, cdn, dl_env, referer=url)
        else:
            method = "yt-dlp"
            tmp = os.path.join(dest_dir, "dl.%(ext)s")
            cmd = ["yt-dlp", "--no-playlist", "--merge-output-format", "mp4",
                   "-f", YTDLP_FORMAT,
                   "-o", tmp, "--socket-timeout", "30", "--retries", "3", url]
            if SCRAPE_PROXY:
                cmd[1:1] = ["--proxy", SCRAPE_PROXY]
            last_result = subprocess.run(cmd, capture_output=True, timeout=DOWNLOAD_LONG_TIMEOUT, env=dl_env)
            ok_dest, _ = _download_looks_complete(dest, duration_hint)
            if not ok_dest:
                for f in os.listdir(dest_dir):
                    if f.startswith("dl."):
                        shutil.move(os.path.join(dest_dir, f), dest)
                        break

        ok, reason = _download_looks_complete(dest, duration_hint)
        if ok:
            return True, "ok", {"method": method}

        size = os.path.getsize(dest) if os.path.exists(dest) else 0
        stderr = _stderr_tail(last_result)
        rc = last_result.returncode if last_result else None
        return False, reason if reason != "missing" else f"output missing or too small ({size} bytes)", {
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


def _process_one(run, source_site, video) -> ProcessOutcome:
    """
    Download + save one video. Returns outcome with optional reason/stage.

    Opens short-lived DB connections around DB work only so threads do not hold
    a Postgres slot for the duration of multi-hour CDN downloads.
    """
    url = video.get("url") or ""
    conn = db.connect()
    try:
        if db.get_run_status(conn, run["id"]) == "STOPPED":
            return ProcessOutcome("skip", "Run stopped by admin", "stopped")
        if db.video_exists(conn, url):
            return ProcessOutcome("skip", "Already in catalog", "catalog")
    except Exception as e:
        _log_video_fail("process", video, run, source_site, e,
                        errorType=type(e).__name__,
                        traceback=traceback.format_exc()[-800:])
        return ProcessOutcome("fail", str(e)[:500], "process")
    finally:
        try:
            conn.close()
        except Exception:
            pass

    site_id = run["siteId"]
    tmp_dir = tempfile.mkdtemp(prefix="scrape_")
    try:
        ok, reason, dl_extra = _download_with_retries(video, tmp_dir, source_site, run)
        if not ok:
            _log_video_fail("download", video, run, source_site, reason, **dl_extra)
            return ProcessOutcome("fail", str(reason)[:500], "download")

        video_path = os.path.join(tmp_dir, "video.mp4")
        duration = video.get("duration_sec") or media.probe_duration(video_path)
        if not duration:
            _log_video_fail("probe_duration", video, run, source_site,
                            "could not determine video duration")
            return ProcessOutcome("fail", "Could not determine video duration", "probe_duration")

        preview = os.path.join(tmp_dir, "preview.mp4")
        thumb = os.path.join(tmp_dir, "thumbnail.jpg")
        sprite = os.path.join(tmp_dir, "storyboard.jpg")
        vtt = os.path.join(tmp_dir, "storyboard.vtt")

        if not media.make_preview(video_path, preview, duration=duration):
            _log_video_fail("make_preview", video, run, source_site, "ffmpeg preview generation failed")
            return ProcessOutcome("fail", "Preview generation failed", "make_preview")
        if not media.make_thumbnail(video_path, thumb, video.get("thumbnail", "")):
            _log_video_fail("make_thumbnail", video, run, source_site, "thumbnail generation failed")
            return ProcessOutcome("fail", "Thumbnail generation failed", "make_thumbnail")
        storyboard_ok = media.make_storyboard(video_path, sprite, vtt, duration)
        if not storyboard_ok:
            _event("warning", "storyboard_skipped", reason="storyboard generation failed",
                   **_video_ctx(video, run, source_site))

        conn = db.connect()
        try:
            if db.get_run_status(conn, run["id"]) == "STOPPED":
                return ProcessOutcome("skip", "Run stopped by admin", "stopped")
            if db.video_exists(conn, url):
                return ProcessOutcome("skip", "Already in catalog", "catalog")

            keys = dict(v=None, t=None, p=None, sb=None, vtt=None)
            # site_id = run storage/origin (S3 paths); VideoSite covers all publish targets.
            vid, slug, new_pornstar_ids = db.create_video(
                conn, site_id=site_id, source_url=url, title=video["title"],
                description=video.get("description"), duration_sec=duration,
                source_site=source_site, scrape_run_id=run["id"],
                s3_video_key=None, s3_thumb_key=None, s3_preview_key=None,
                s3_storyboard_key=None, s3_storyboard_vtt_key=None,
                tags=video.get("tags"), pornstars=video.get("pornstars"),
                categories=video.get("categories"),
                target_site_ids=run.get("targetSiteIds") or [site_id],
            )
            _enqueue_pornstar_tpdb(new_pornstar_ids)

            if storage.configured():
                keys["v"] = storage.upload(video_path, storage.key_video(site_id, vid), "video/mp4")
                if not keys["v"]:
                    _log_video_fail("upload", video, run, source_site, "S3 video upload failed", videoId=vid)
                    return ProcessOutcome("fail", "S3 video upload failed", "upload")
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
            return ProcessOutcome("new")
        except Exception as e:
            _log_video_fail("process", video, run, source_site, e,
                            errorType=type(e).__name__,
                            traceback=traceback.format_exc()[-800:])
            return ProcessOutcome("fail", str(e)[:500], "process")
        finally:
            try:
                conn.close()
            except Exception:
                pass
    except Exception as e:
        _log_video_fail("process", video, run, source_site, e,
                        errorType=type(e).__name__,
                        traceback=traceback.format_exc()[-800:])
        return ProcessOutcome("fail", str(e)[:500], "process")
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


def process_redownload(conn, video_id: str):
    """Re-download a video from its source URL and replace stored media."""
    v = db.load_video_redownload(conn, video_id)
    if not v:
        _event("warning", "redownload_not_found", videoId=video_id)
        return
    source_url = (v.get("sourceUrl") or "").strip()
    if not source_url or source_url.startswith("upload://"):
        _event("warning", "redownload_no_source", videoId=video_id)
        db.set_video_status(conn, video_id, "FAILED")
        return

    site_id = v["siteId"]
    source_site = v.get("sourceSite") or ""
    db.set_video_status(conn, video_id, "PROCESSING")
    _event("info", "redownload_start", videoId=video_id, sourceUrl=source_url[:200])

    video = {
        "url": source_url,
        "title": v.get("title") or "Unknown",
        "description": v.get("description") or "",
        "tags": [],
        "pornstars": [],
        "thumbnail": "",
        "duration_sec": v.get("durationSec"),
    }

    try:
        resolved = resolve_urls([source_url])
        for item in resolved.get("videos") or []:
            video["title"] = item.get("title") or video["title"]
            video["description"] = item.get("description") or video["description"]
            video["thumbnail"] = item.get("thumbnail") or video.get("thumbnail") or ""
            if item.get("durationSec"):
                video["duration_sec"] = item["durationSec"]
            elif item.get("duration_sec"):
                video["duration_sec"] = item["duration_sec"]
            apply_download_urls(video, item)
            break
    except Exception as e:  # noqa: BLE001
        _event("warning", "redownload_resolve_failed", videoId=video_id, reason=str(e)[:300])

    tmp_dir = tempfile.mkdtemp(prefix="redownload_")
    try:
        ok, reason, dl_extra = _download_with_retries(video, tmp_dir, source_site, {})
        if not ok:
            _event("warning", "redownload_failed", videoId=video_id, stage="download",
                   reason=str(reason)[:500], **dl_extra)
            db.set_video_status(conn, video_id, "FAILED")
            return

        video_path = os.path.join(tmp_dir, "video.mp4")
        duration = video.get("duration_sec") or media.probe_duration(video_path)
        if not duration:
            _event("warning", "redownload_failed", videoId=video_id, stage="probe_duration",
                   reason="could not determine duration")
            db.set_video_status(conn, video_id, "FAILED")
            return

        preview = os.path.join(tmp_dir, "preview.mp4")
        thumb = os.path.join(tmp_dir, "thumbnail.jpg")
        sprite = os.path.join(tmp_dir, "storyboard.jpg")
        vtt = os.path.join(tmp_dir, "storyboard.vtt")

        if not media.make_preview(video_path, preview, duration=duration, force=True):
            _event("warning", "redownload_failed", videoId=video_id, stage="make_preview")
            db.set_video_status(conn, video_id, "FAILED")
            return
        if not media.make_thumbnail(video_path, thumb, video.get("thumbnail", "")):
            _event("warning", "redownload_failed", videoId=video_id, stage="make_thumbnail")
            db.set_video_status(conn, video_id, "FAILED")
            return
        storyboard_ok = media.make_storyboard(video_path, sprite, vtt, duration, force=True)

        keys = {
            "v": v.get("s3VideoKey"),
            "t": v.get("s3ThumbKey"),
            "p": v.get("s3PreviewKey"),
            "sb": v.get("s3StoryboardKey"),
            "vtt": v.get("s3StoryboardVttKey"),
        }
        if storage.configured():
            keys["v"] = storage.upload(video_path, storage.key_video(site_id, video_id), "video/mp4") or keys["v"]
            if os.path.exists(thumb):
                keys["t"] = storage.upload(thumb, storage.key_thumb(site_id, video_id), "image/jpeg") or keys["t"]
            if os.path.exists(preview):
                keys["p"] = storage.upload(preview, storage.key_preview(site_id, video_id), "video/mp4") or keys["p"]
            if storyboard_ok:
                keys["sb"] = storage.upload(sprite, storage.key_storyboard(site_id, video_id), "image/jpeg") or keys["sb"]
                keys["vtt"] = storage.upload(vtt, storage.key_storyboard_vtt(site_id, video_id), "text/vtt") or keys["vtt"]
        else:
            local = os.path.join(ROOT, "downloads", video_id)
            os.makedirs(local, exist_ok=True)
            shutil.copy(video_path, os.path.join(local, "video.mp4"))
            if os.path.exists(preview):
                shutil.copy(preview, os.path.join(local, "preview.mp4"))
            if os.path.exists(thumb):
                shutil.copy(thumb, os.path.join(local, "thumbnail.jpg"))
            if storyboard_ok:
                shutil.copy(sprite, os.path.join(local, "storyboard.jpg"))
                shutil.copy(vtt, os.path.join(local, "storyboard.vtt"))

        db.update_video_media(
            conn,
            video_id,
            s3_video_key=keys["v"],
            s3_thumb_key=keys["t"],
            s3_preview_key=keys["p"],
            s3_storyboard_key=keys["sb"] if storyboard_ok else v.get("s3StoryboardKey"),
            s3_storyboard_vtt_key=keys["vtt"] if storyboard_ok else v.get("s3StoryboardVttKey"),
            duration_sec=duration,
            status="READY",
            preview_version=media.PREVIEW_VERSION,
        )
        _event("info", "redownload_done", videoId=video_id, durationSec=duration)
    except Exception as e:  # noqa: BLE001
        _event("warning", "redownload_failed", videoId=video_id, reason=str(e)[:500],
               errorType=type(e).__name__, traceback=traceback.format_exc()[-800:])
        db.set_video_status(conn, video_id, "FAILED")
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
        "categories": c.get("categories") or [],
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
                reason = "Duplicate in this run" if key in seen else "Missing URL"
                db.record_run_outcome(conn, run_id, v, source, "skip", reason, "dedup")
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
                        po = fut.result()
                    except Exception as e:  # noqa: BLE001
                        _log_video_fail("thread", v, run, source, e,
                                        errorType=type(e).__name__,
                                        traceback=traceback.format_exc()[-800:])
                        po = ProcessOutcome("fail", str(e)[:500], "thread")
                    _apply_process_outcome(conn, run_id, v, source, po, record)
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


def process_scrape_search(r, payload_json: str):
    """Handle interactive scrape preview search requests from the web app."""
    req = json.loads(payload_json)
    rid = req.get("id") or ""
    result_key = f"{SCRAPE_SEARCH_RESULT_PREFIX}{rid}"
    try:
        if req.get("urls"):
            result = resolve_urls(req["urls"])
        else:
            result = search_candidates(
                query=req["query"],
                sources=req["sources"],
                min_duration_sec=int(req.get("minDurationSec", 600)),
                cursors=req.get("cursors"),
                limit=int(req.get("limit", 50)),
                exclude_urls=req.get("excludeUrls"),
                skip=int(req.get("skip", 0) or 0),
                search_mode=str(req.get("searchMode") or "query"),
            )
        payload = {"ok": True, **result}
    except Exception as e:  # noqa: BLE001
        payload = {"ok": False, "error": str(e)[:500]}
    # Keep result long enough for the web app's 30-minute poll window.
    r.set(result_key, json.dumps(payload), ex=3600)
    _event("info", "scrape_search_done", requestId=rid, videos=len(payload.get("videos") or []),
           ok=payload.get("ok", True))


def _redis():
    import redis as redis_lib
    return redis_lib.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))


def _enqueue_pornstar_tpdb(pornstar_ids: list[str] | None) -> None:
    """Queue newly created pornstars for ThePornDB enrichment (non-blocking)."""
    ids = [pid for pid in (pornstar_ids or []) if pid]
    if not ids or not tpdb.configured():
        return
    try:
        r = _redis()
        for pid in ids:
            r.rpush(PORNSTAR_TPDB_QUEUE_KEY, pid)
        _event("info", "pornstar_tpdb_enqueued", count=len(ids), pornstarIds=ids[:20])
    except Exception as e:  # noqa: BLE001
        _event("warning", "pornstar_tpdb_enqueue_failed", reason=str(e)[:300], count=len(ids))


def process_pornstar_tpdb(conn, pornstar_id: str) -> None:
    result = tpdb.enrich_pornstar(conn, pornstar_id)
    if result.get("ok"):
        _event(
            "info",
            "pornstar_tpdb_enriched",
            pornstarId=pornstar_id,
            tpdbId=result.get("tpdbId"),
            imageSaved=result.get("imageSaved"),
        )
    else:
        _event(
            "warning",
            "pornstar_tpdb_enrich_failed",
            pornstarId=pornstar_id,
            reason=(result.get("error") or "unknown")[:300],
        )


def backfill_pornstar_tpdb(conn, limit: int | None = None, delay_sec: float = 0.4) -> None:
    """Enrich all pornstars missing TPDB data (used by --backfill-tpdb)."""
    if not tpdb.configured():
        log.error(_j("TPDB_API_KEY not configured — cannot backfill"))
        return
    rows = tpdb.list_pornstars_without_data(conn, limit=limit)
    _event("info", "pornstar_tpdb_backfill_start", total=len(rows), limit=limit)
    ok = fail = 0
    for i, (pid, name) in enumerate(rows, start=1):
        result = tpdb.enrich_pornstar(conn, pid)
        if result.get("ok"):
            ok += 1
            _event(
                "info",
                "pornstar_tpdb_backfill_ok",
                index=i,
                total=len(rows),
                pornstarId=pid,
                name=name,
                tpdbId=result.get("tpdbId"),
                imageSaved=result.get("imageSaved"),
            )
        else:
            fail += 1
            _event(
                "warning",
                "pornstar_tpdb_backfill_fail",
                index=i,
                total=len(rows),
                pornstarId=pid,
                name=name,
                reason=(result.get("error") or "unknown")[:300],
            )
        if delay_sec > 0:
            time.sleep(delay_sec)
    _event("info", "pornstar_tpdb_backfill_done", ok=ok, fail=fail, total=len(rows))


def _run_background(job_name: str, fn, *args):
    """Run a long job in a thread so the queue loop can still handle search requests."""

    def _wrapper():
        conn = db.connect()
        try:
            fn(conn, *args)
        except Exception as e:  # noqa: BLE001
            _event("error", "background_job_failed", job=job_name, reason=str(e)[:500],
                   traceback=traceback.format_exc()[-800:])
        finally:
            try:
                conn.close()
            except Exception:
                pass

    threading.Thread(target=_wrapper, name=f"worker-{job_name}", daemon=True).start()


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
            mode = run.get("searchMode") or "query"
            try:
                results, cursor, exhausted = searcher(
                    run["query"], batch_n, cursor, min_dur, mode
                )
            except TypeError:
                results, cursor, exhausted = searcher(
                    run["query"], batch_n, cursor, min_dur
                )
            if not results:
                break

            # Cross-source within-run dedup by canonical key before downloading.
            fresh = []
            for v in results:
                key = db.canonical_key(v["url"]) or v["url"]
                if key in seen:
                    record("skip")
                    db.record_run_outcome(
                        conn, run_id, v, source, "skip", "Duplicate in this run", "dedup"
                    )
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
                            po = fut.result()
                        except Exception as e:  # noqa: BLE001
                            _log_video_fail("thread", v, run, source, e,
                                            errorType=type(e).__name__,
                                            traceback=traceback.format_exc()[-800:])
                            po = ProcessOutcome("fail", str(e)[:500], "thread")
                        _apply_process_outcome(conn, run_id, v, source, po, record)
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
    parser.add_argument("--redownload", help="Re-download source video for a Video id and exit")
    parser.add_argument(
        "--backfill-tpdb",
        action="store_true",
        help="Enrich all pornstars missing ThePornDB data, then exit",
    )
    parser.add_argument(
        "--backfill-limit",
        type=int,
        default=None,
        help="Optional cap for --backfill-tpdb",
    )
    parser.add_argument(
        "--backfill-delay",
        type=float,
        default=0.4,
        help="Seconds between TPDB requests during backfill (default 0.4)",
    )
    args = parser.parse_args()

    conn = db.connect()

    if args.regenerate_preview:
        process_regenerate_preview(conn, args.regenerate_preview)
        return

    if args.redownload:
        process_redownload(conn, args.redownload)
        return

    if args.backfill_tpdb:
        backfill_pornstar_tpdb(conn, limit=args.backfill_limit, delay_sec=args.backfill_delay)
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
    # Search / TPDB enrich must not wait behind long scrape/creator jobs.
    queue_priority = [
        SCRAPE_SEARCH_QUEUE_KEY,
        PORNSTAR_TPDB_QUEUE_KEY,
        PREVIEW_QUEUE_KEY,
        REDOWNLOAD_QUEUE_KEY,
        CREATOR_QUEUE_KEY,
        QUEUE_KEY,
    ]
    while True:
        try:
            item = r.blpop(queue_priority, timeout=5)
            if not item:
                continue
            queue = item[0].decode() if isinstance(item[0], bytes) else item[0]
            job_id = item[1].decode() if isinstance(item[1], bytes) else item[1]
            if queue == SCRAPE_SEARCH_QUEUE_KEY:
                process_scrape_search(r, job_id)
            elif queue == PORNSTAR_TPDB_QUEUE_KEY:
                _run_background("pornstar-tpdb", process_pornstar_tpdb, job_id)
            elif queue == PREVIEW_QUEUE_KEY:
                _run_background("preview", process_regenerate_preview, job_id)
            elif queue == REDOWNLOAD_QUEUE_KEY:
                _run_background("redownload", process_redownload, job_id)
            elif queue == CREATOR_QUEUE_KEY:
                _run_background("creator", process_creator_upload, job_id)
            else:
                _run_background("scrape-run", process_run, job_id)
        except Exception as e:
            log.error(_j(f"worker loop error: {e}"))
            time.sleep(3)


if __name__ == "__main__":
    main()
