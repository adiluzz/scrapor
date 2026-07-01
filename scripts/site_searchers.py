#!/usr/bin/env python3
"""
Pure search functions for each supported source site.

Each searcher returns a list of normalized dicts:
  {
    "url": str,                 # canonical source page URL (dedup key)
    "title": str,
    "description": str,
    "tags": list[str],
    "pornstars": list[str],
    "thumbnail": str,           # remote thumbnail URL (may be empty)
    "duration_sec": int | None,
    "_m3u8_base_url": str | None,   # XHamster HLS fast path
    "_cdn_url": str | None,         # HQPorner direct MP4 fast path
  }

Site names match src/lib/source-sites.ts.
"""

import datetime


def _norm(url, title, duration_sec, thumbnail="", tags=None, pornstars=None,
          description="", m3u8=None, cdn=None):
    return {
        "url": str(url or ""),
        "title": str(title or "Unknown"),
        "description": str(description or ""),
        "tags": [str(t) for t in (tags or [])],
        "pornstars": [str(p) for p in (pornstars or [])],
        "thumbnail": str(thumbnail or ""),
        "duration_sec": int(duration_sec) if duration_sec else None,
        "_m3u8_base_url": m3u8,
        "_cdn_url": cdn,
    }


def search_xnxx(query, count, skip=0, min_duration=600):
    need = count + skip
    import xnxx_api
    from xnxx_api.modules.search_filters import Length
    client = xnxx_api.Client()
    result = client.search(query, length=Length.X_10min_plus)
    out = []
    for v in result.videos():
        try:
            url = str(getattr(v, "url", "") or "")
            if not url:
                continue
            dur_min = int(getattr(v, "length", 0) or 0)
            dur_s = dur_min * 60
            if dur_s and dur_s < min_duration:
                continue
            thumb_list = getattr(v, "thumbnail_url", []) or []
            out.append(_norm(
                url, v.title, dur_s or None,
                thumbnail=str(thumb_list[0]) if thumb_list else "",
                tags=getattr(v, "tags", []) or [],
                pornstars=getattr(v, "pornstars", []) or [],
                description=getattr(v, "description", "") or "",
            ))
            if len(out) >= need:
                break
        except Exception:
            continue
    return out[skip:skip + count]


def search_pornhub(query, count, skip=0, min_duration=600):
    need = count + skip
    import phub
    client = phub.Client()
    out = []
    for v in client.search(query):
        try:
            dur = v.duration
            dur_s = int(dur.total_seconds()) if isinstance(dur, datetime.timedelta) else int(dur or 0)
            if dur_s < min_duration:
                continue
            url = str(getattr(v, "url", "") or "")
            if not url:
                continue
            try:
                tags = [t.name for t in (getattr(v, "tags", []) or [])]
            except Exception:
                tags = []
            try:
                raw_ps = v.fetch("data@pornstars") or []
                pornstars = [ps["pornstar_name"] for ps in raw_ps if ps.get("pornstar_name")]
            except Exception:
                pornstars = []
            out.append(_norm(
                url, v.title, dur_s,
                thumbnail=str(getattr(getattr(v, "image", None), "url", "") or ""),
                tags=tags, pornstars=pornstars,
            ))
            if len(out) >= need:
                break
        except Exception:
            continue
    return out[skip:skip + count]


def search_xhamster(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = max(2, -(-need // 32))
    from xhamster_api import Client
    client = Client()
    out = []
    min_min = max(1, min_duration // 60)
    for v in client.search_videos(query=query, min_duration=str(min_min), sort_by="longest", pages=pages):
        try:
            url = str(getattr(v, "url", "") or "")
            if not url:
                continue
            out.append(_norm(
                url, v.title, None,
                thumbnail=str(getattr(v, "thumbnail", "") or ""),
                pornstars=[str(p) for p in (getattr(v, "pornstars", []) or [])],
                m3u8=str(getattr(v, "m3u8_base_url", "") or ""),
            ))
            if len(out) >= need:
                break
        except Exception:
            continue
    return out[skip:skip + count]


def search_xvideos(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = max(1, -(-need // 28))
    import xvideos_api
    from xvideos_api.modules.sorting import SortVideoTime
    client = xvideos_api.Client()
    out, seen = [], set()
    for sort_time in [SortVideoTime.Sort_really_long, SortVideoTime.Sort_long_10_20min]:
        for v in client.search(query, sorting_time=sort_time, pages=pages):
            try:
                url = str(getattr(v, "url", "") or "")
                if not url or url in seen:
                    continue
                seen.add(url)
                dur_s = int(getattr(v, "duration", 0) or 0)
                if dur_s and dur_s < min_duration:
                    continue
                out.append(_norm(
                    url, v.title, dur_s or None,
                    thumbnail=str(getattr(v, "thumbnail", "") or ""),
                    tags=getattr(v, "tags", []) or [],
                    pornstars=getattr(v, "pornstars", []) or [],
                    description=getattr(v, "description", "") or "",
                ))
                if len(out) >= need:
                    break
            except Exception:
                continue
        if len(out) >= need:
            break
    return out[skip:skip + count]


def search_eporner(query, count, skip=0, min_duration=600):
    need = count + skip
    per_page = min(need, 60)
    from eporner_api import Client, Order, Gay, LowQuality
    client = Client()
    out, page = [], 1
    while len(out) < need:
        batch = list(client.search_videos(
            query=query, sorting_gay=Gay.exclude_gay_content, sorting_order=Order.longest,
            sorting_low_quality=LowQuality.exclude_low_quality_content,
            page=page, per_page=per_page, enable_html_scraping=True,
        ))
        if not batch:
            break
        for v in batch:
            try:
                dur_s = int(getattr(v, "length", 0) or 0)
                if dur_s < min_duration:
                    continue
                url = str(getattr(v, "url", "") or "")
                if not url:
                    continue
                out.append(_norm(
                    url, v.title, dur_s,
                    thumbnail=str(getattr(v, "thumbnail", "") or ""),
                    tags=getattr(v, "tags", []) or [],
                ))
                if len(out) >= need:
                    break
            except Exception:
                continue
        page += 1
    return out[skip:skip + count]


def search_youporn(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = max(1, -(-need // 20))
    from youporn_api import Client
    client = Client()
    out = []
    min_min = max(1, min_duration // 60)
    for v in client.search_videos(query, filter_duration_minimum=str(min_min), filter_relevance='duration', pages=pages):
        try:
            url = str(getattr(v, "url", "") or "")
            if not url:
                continue
            out.append(_norm(
                url, v.title, None,
                thumbnail=str(getattr(v, "thumbnail", "") or ""),
                tags=getattr(v, "categories", []) or [],
                pornstars=getattr(v, "pornstars", []) or [],
            ))
            if len(out) >= need:
                break
        except Exception:
            continue
    return out[skip:skip + count]


def search_hqporner(query, count, skip=0, min_duration=600):
    need = count + skip
    from hqporner_api import Client
    client = Client()
    out = []
    for v in client.search_videos(query):
        try:
            length_str = str(getattr(v, "length", "") or "")
            parts = length_str.replace("m", "").replace("s", "").split()
            if len(parts) == 2:
                dur_s = int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                dur_s = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            elif len(parts) == 1:
                dur_s = int(parts[0])
            else:
                dur_s = 0
            if dur_s < min_duration:
                continue
            url = str(getattr(v, "url", "") or "")
            if not url:
                continue
            try:
                dl_urls = v.direct_download_urls()
                cdn_url = next((u for u in dl_urls if "360" in str(u)), dl_urls[0] if dl_urls else "")
                cdn_url = f"https://{cdn_url}" if cdn_url and not str(cdn_url).startswith("http") else cdn_url
            except Exception:
                cdn_url = ""
            out.append(_norm(
                url, v.title, dur_s,
                tags=getattr(v, "tags", []) or [],
                pornstars=getattr(v, "pornstars", []) or [],
                cdn=cdn_url,
            ))
            if len(out) >= need:
                break
        except Exception:
            continue
    return out[skip:skip + count]


def search_ytdlp(query, count, skip=0, min_duration=600, prefix="ytsearch"):
    """Generic yt-dlp search fallback (used for RedTube/SpankBang)."""
    import json
    import subprocess
    need = count + skip
    cmd = ["yt-dlp", f"{prefix}{need}:{query}", "--flat-playlist", "-J", "--no-warnings"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        data = json.loads(r.stdout or "{}")
    except Exception:
        return []
    out = []
    for e in data.get("entries", []) or []:
        url = e.get("url") or e.get("webpage_url") or ""
        if not url:
            continue
        dur_s = int(e.get("duration") or 0)
        if dur_s and dur_s < min_duration:
            continue
        out.append(_norm(url, e.get("title"), dur_s or None,
                         thumbnail=e.get("thumbnail") or ""))
        if len(out) >= need:
            break
    return out[skip:skip + count]


# Registry keyed by the site names used in the app (src/lib/source-sites.ts).
SEARCHERS = {
    "XNXX": search_xnxx,
    "PornHub": search_pornhub,
    "XHamster": search_xhamster,
    "XVideos": search_xvideos,
    "Eporner": search_eporner,
    "YouPorn": search_youporn,
    "HQPorner": search_hqporner,
    "RedTube": lambda q, c, s=0, m=600: search_ytdlp(q, c, s, m, prefix="rtsearch"),
    "SpankBang": lambda q, c, s=0, m=600: search_ytdlp(q, c, s, m, prefix="sbsearch"),
}
