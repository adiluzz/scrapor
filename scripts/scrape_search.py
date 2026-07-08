#!/usr/bin/env python3
"""
Search source sites for scrape-run preview (no downloads).

Used by the admin interactive scrape UI via:
  • stdin/stdout CLI (local dev)
  • worker Redis queue handler (production Docker)

Returns up to `limit` unique candidates across selected sources, with pagination
cursors per source for "load 50 more".
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "worker"))

import db  # noqa: E402
from site_searchers import (  # noqa: E402
    SEARCHERS,
    _eporner_parse_detail,
    _html_get,
    _ph_parse_detail,
    _po_parse_detail,
)

PREVIEW_BATCH = int(os.environ.get("SCRAPE_PAGE_BATCH", "50"))
SCRAPE_PROXY = os.environ.get("SCRAPE_HTTP_PROXY") or os.environ.get("HTTPS_PROXY") or ""

SITE_BY_HOST = (
    ("pornhub", "PornHub"),
    ("xvideos", "XVideos"),
    ("xhamster", "XHamster"),
    ("xnxx", "XNXX"),
    ("youporn", "YouPorn"),
    ("eporner", "Eporner"),
    ("hqporner", "HQPorner"),
    ("redtube", "RedTube"),
    ("spankbang", "SpankBang"),
    ("paradisehill", "ParadiseHill"),
    ("pornone", "PornOne"),
)


def _public_video(v: dict, source: str, in_catalog: bool) -> dict:
    return {
        "url": v.get("url") or "",
        "title": v.get("title") or "Unknown",
        "thumbnail": v.get("thumbnail") or "",
        "durationSec": v.get("duration_sec"),
        "sourceSite": source,
        "inCatalog": in_catalog,
        "description": v.get("description") or "",
        "tags": v.get("tags") or [],
        "pornstars": v.get("pornstars") or [],
        "_m3u8_base_url": v.get("_m3u8_base_url"),
        "_cdn_url": v.get("_cdn_url"),
        "_part_urls": v.get("_part_urls"),
    }


def detect_source_site(url: str) -> str | None:
    """Map a video page URL to a supported source site name."""
    try:
        host = (urlparse(url.strip()).netloc or "").lower()
    except Exception:
        return None
    host = re.sub(r"^(?:www\d*|m|mobile|[a-z]{2})\.", "", host.split("@")[-1].split(":")[0])
    for needle, site in SITE_BY_HOST:
        if needle in host:
            return site
    return None


def _yt_dlp_env() -> dict:
    env = os.environ.copy()
    if SCRAPE_PROXY:
        env["HTTP_PROXY"] = SCRAPE_PROXY
        env["HTTPS_PROXY"] = SCRAPE_PROXY
        env["http_proxy"] = SCRAPE_PROXY
        env["https_proxy"] = SCRAPE_PROXY
    return env


def _yt_dlp_metadata(url: str) -> dict:
    cmd = [
        "yt-dlp",
        "--dump-single-json",
        "--no-playlist",
        "--no-warnings",
        "--skip-download",
        url,
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("SCRAPE_URL_RESOLVE_TIMEOUT_SEC", "120")),
        env=_yt_dlp_env(),
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "yt-dlp failed").strip()
        raise ValueError(err[:400])
    info = json.loads(result.stdout)
    cast = info.get("cast") or []
    return {
        "url": info.get("webpage_url") or info.get("original_url") or url,
        "title": info.get("title") or "Unknown",
        "thumbnail": info.get("thumbnail") or "",
        "duration_sec": int(info["duration"]) if info.get("duration") else None,
        "description": info.get("description") or "",
        "tags": info.get("tags") or info.get("categories") or [],
        "pornstars": [str(c) for c in cast if c],
    }


_DETAIL_REFRESH_PARSERS: dict[str, tuple] = {
    "Eporner": _eporner_parse_detail,
    "ParadiseHill": _ph_parse_detail,
    "PornOne": _po_parse_detail,
}

_DOWNLOAD_URL_KEYS = ("_cdn_url", "_m3u8_base_url", "_part_urls")


def refresh_download_urls(url: str, source_site: str | None = None) -> dict:
    """Fetch fresh direct-download URLs from the source page (called before each download)."""
    raw = (url or "").strip()
    if not raw:
        return {}
    source = source_site or detect_source_site(raw)
    if not source:
        return {}
    parse_fn = _DETAIL_REFRESH_PARSERS.get(source)
    if not parse_fn:
        return {}
    html = _html_get(raw)
    if not html:
        return {}
    meta = parse_fn(html, raw)
    return {key: meta.get(key) for key in _DOWNLOAD_URL_KEYS}


def apply_download_urls(target: dict, refreshed: dict) -> None:
    """Merge refreshed download URLs into a worker/search video dict."""
    if not refreshed:
        return
    for key in _DOWNLOAD_URL_KEYS:
        if key not in refreshed:
            continue
        val = refreshed[key]
        if val:
            target[key] = val
        else:
            target.pop(key, None)


def resolve_video_url(url: str, conn) -> dict:
    """Resolve one supported source-site video URL into a scrape candidate."""
    raw = url.strip()
    if not raw:
        raise ValueError("Empty URL")
    source = detect_source_site(raw)
    if not source:
        raise ValueError("URL is not from a supported scrape site")

    meta: dict = {"url": raw}
    if source == "Eporner":
        html = _html_get(raw)
        if html:
            meta.update(_eporner_parse_detail(html, raw))
    elif source == "ParadiseHill":
        html = _html_get(raw)
        if html:
            meta.update(_ph_parse_detail(html, raw))
    elif source == "PornOne":
        html = _html_get(raw)
        if html:
            meta.update(_po_parse_detail(html, raw))

    if not meta.get("title") or meta.get("title") == "Unknown":
        meta.update(_yt_dlp_metadata(raw))

    canonical = meta.get("url") or raw
    in_catalog = db.video_exists(conn, canonical)
    return _public_video(meta, source, in_catalog)


def resolve_urls(urls: list[str]) -> dict:
    """Resolve pasted video page URLs from supported scrape sites."""
    videos: list[dict] = []
    errors: list[dict] = []
    seen: set[str] = set()

    conn = db.connect()
    try:
        for raw in urls:
            url = (raw or "").strip()
            if not url:
                continue
            key = db.canonical_key(url) or url
            if url in seen or key in seen:
                continue
            seen.add(url)
            seen.add(key)
            try:
                videos.append(resolve_video_url(url, conn))
            except Exception as e:  # noqa: BLE001
                errors.append({"url": url, "error": str(e)[:400]})
    finally:
        conn.close()

    return {"videos": videos, "cursors": {}, "hasMore": False, "errors": errors}


def search_candidates(
    query: str,
    sources: list[str],
    min_duration_sec: int = 600,
    cursors: dict | None = None,
    limit: int = 50,
    exclude_urls: list[str] | None = None,
) -> dict:
    """Collect up to `limit` unique video candidates across `sources`."""
    cursors = dict(cursors or {})
    exhausted: dict[str, bool] = {s: False for s in sources}
    exclude = set(exclude_urls or [])
    seen: set[str] = set(exclude)
    videos: list[dict] = []

    conn = db.connect()
    try:
        while len(videos) < limit:
            progressed = False
            for source in sources:
                if len(videos) >= limit:
                    break
                if exhausted.get(source):
                    continue
                searcher = SEARCHERS.get(source)
                if not searcher:
                    exhausted[source] = True
                    continue

                cursor = cursors.get(source, 0)
                need = min(PREVIEW_BATCH, limit - len(videos))
                batch, next_cursor, is_exhausted = searcher(query, need, cursor, min_duration_sec)
                cursors[source] = next_cursor
                if is_exhausted:
                    exhausted[source] = True
                if not batch:
                    exhausted[source] = True
                    continue

                progressed = True
                for v in batch:
                    url = v.get("url") or ""
                    if not url:
                        continue
                    key = db.canonical_key(url) or url
                    if url in seen or key in seen:
                        continue
                    seen.add(url)
                    seen.add(key)
                    in_catalog = db.video_exists(conn, url)
                    videos.append(_public_video(v, source, in_catalog))
                    if len(videos) >= limit:
                        break

            if not progressed:
                break
    finally:
        conn.close()

    has_more = any(not exhausted.get(s, True) for s in sources)
    return {"videos": videos, "cursors": cursors, "hasMore": has_more}


def main() -> None:
    req = json.load(sys.stdin)
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
        )
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
