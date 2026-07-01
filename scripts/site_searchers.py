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

The "EchterAlsFake" site-API libraries (phub, xnxx_api, xvideos_api,
xhamster_api, youporn_api, eporner_api, hqporner_api) are async-first: their
`search`/`search_videos` methods return async generators (xnxx returns an
awaitable Search object). The worker calls these searchers synchronously, so
each one drives its async work through `asyncio.run(...)` and collects results
into a plain list. Video metadata attributes are read synchronously once the
objects come back from search.

Any source whose library is momentarily broken (site HTML changed, empty search
page, etc.) returns [] instead of raising, so one bad source can't fail the run.
"""

import asyncio
import datetime
import inspect
import re
import sys


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
        "_m3u8_base_url": (str(m3u8) if m3u8 else None),
        "_cdn_url": (str(cdn) if cdn else None),
    }


def _sget(obj, name, default=None):
    """getattr that swallows *any* exception (some libs raise from properties)."""
    try:
        val = getattr(obj, name)
    except Exception:
        return default
    return default if val is None else val


def _dur(value):
    """Parse a duration into seconds. Accepts ints/floats and strings like
    '27m 2s', '6 min', '1h 5m', '01:23:45', '12:34' or a bare number (seconds)."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip().lower()
    if not s:
        return 0
    # clock format hh:mm:ss / mm:ss
    if ":" in s and re.fullmatch(r"[\d:]+", s):
        parts = [int(p) for p in s.split(":") if p != ""]
        total = 0
        for p in parts:
            total = total * 60 + p
        return total
    h = re.search(r"(\d+)\s*h", s)
    m = re.search(r"(\d+)\s*m", s)   # matches 'm' and 'min'
    sec = re.search(r"(\d+)\s*s", s)  # matches 's' and 'sec'
    if h or m or sec:
        return ((int(h.group(1)) * 3600 if h else 0)
                + (int(m.group(1)) * 60 if m else 0)
                + (int(sec.group(1)) if sec else 0))
    nums = re.findall(r"\d+", s)
    return int(nums[0]) if nums else 0


async def _collect(agen, extract, need, min_duration, seen=None):
    """Iterate an async generator of video objects, run `extract` (async) on each,
    apply the duration/url/dedup filters, and stop once `need` items are gathered."""
    out = []
    async for v in agen:
        try:
            item = await extract(v)
        except Exception:
            continue
        if not item or not item.get("url"):
            continue
        d = item.get("duration_sec")
        if d and d < min_duration:
            continue
        u = item["url"]
        if seen is not None:
            if u in seen:
                continue
            seen.add(u)
        out.append(item)
        if len(out) >= need:
            break
    return out


def _run(source, coro_factory, skip, count):
    """Run an async searcher coroutine, degrading to [] (never raising) so a
    broken library can't turn the whole run red."""
    try:
        results = asyncio.run(coro_factory())
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] {source} failed: {e!r}", file=sys.stderr, flush=True)
        return []
    return results[skip:skip + count]


def _pages(need, per_page):
    return max(2, -(-need // max(1, per_page)))


# ── XNXX ──────────────────────────────────────────────────────────────
def search_xnxx(query, count, skip=0, min_duration=600):
    need = count + skip

    async def run():
        import xnxx_api
        from xnxx_api.modules.search_filters import Length
        client = xnxx_api.Client()
        res = await client.search(query, length=Length.X_10min_plus)
        vids = _sget(res, "videos")
        agen = vids() if callable(vids) else vids
        if inspect.iscoroutine(agen):
            agen = await agen

        async def extract(v):
            # xnxx exposes duration in *minutes* as a string ('21').
            length_min = _dur(_sget(v, "length", 0))
            dur_s = length_min * 60 if length_min else 0
            thumbs = _sget(v, "thumbnail_url", []) or []
            if isinstance(thumbs, (list, tuple)):
                thumb = str(thumbs[0]) if thumbs else ""
            else:
                thumb = str(thumbs)
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                thumbnail=thumb,
                tags=list(_sget(v, "tags", []) or []),
                pornstars=list(_sget(v, "pornstars", []) or []),
                description=str(_sget(v, "description", "") or ""),
            )

        return await _collect(agen, extract, need, min_duration)

    return _run("XNXX", run, skip, count)


# ── PornHub (phub) ────────────────────────────────────────────────────
def search_pornhub(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = _pages(need, 12)

    async def run():
        import phub
        client = phub.Client(login=False)

        async def extract(v):
            dur = _sget(v, "duration", 0)
            if isinstance(dur, datetime.timedelta):
                dur_s = int(dur.total_seconds())
            else:
                dur_s = _dur(dur)
            thumb = str(_sget(v, "thumbnail", "") or "")
            if thumb in ("", "None"):
                data = _sget(v, "api_data", {}) or {}
                thumb = str(data.get("thumb", "") or "") if isinstance(data, dict) else ""
            tags = []
            for t in (_sget(v, "tags", []) or []):
                tags.append(t if isinstance(t, str) else _sget(t, "name", str(t)))
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                thumbnail=thumb, tags=tags,
            )

        return await _collect(client.search_videos(query, pages=pages), extract, need, min_duration)

    return _run("PornHub", run, skip, count)


# ── XHamster ──────────────────────────────────────────────────────────
def search_xhamster(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = _pages(need, 20)

    async def run():
        import xhamster_api
        client = xhamster_api.Client()
        min_min = max(1, min_duration // 60)
        md = next((c for c in ("40", "30", "10", "5", "2") if int(c) <= min_min), None)

        async def extract(v):
            dur_s = _dur(_sget(v, "length", _sget(v, "duration", 0)))
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                thumbnail=str(_sget(v, "thumbnail", "") or _sget(v, "thumbnail_url", "") or ""),
                pornstars=list(_sget(v, "pornstars", []) or []),
                m3u8=str(_sget(v, "m3u8_base_url", "") or "") or None,
            )

        agen = client.search_videos(query=query, sort_by="longest",
                                    min_duration=md, pages=pages)
        return await _collect(agen, extract, need, min_duration)

    return _run("XHamster", run, skip, count)


# ── XVideos ───────────────────────────────────────────────────────────
def search_xvideos(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = _pages(need, 20)

    async def run():
        import xvideos_api
        from xvideos_api.modules.sorting import SortVideoTime
        client = xvideos_api.Client()
        seen, out = set(), []

        async def extract(v):
            dur_s = _dur(_sget(v, "length", ""))
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                thumbnail=str(_sget(v, "thumbnail_url", "") or ""),
                tags=list(_sget(v, "tags", []) or []),
                description=str(_sget(v, "description", "") or ""),
            )

        for st in (SortVideoTime.Sort_really_long, SortVideoTime.Sort_long_10_20min):
            agen = client.search(query, sorting_time=st, pages=pages)
            out.extend(await _collect(agen, extract, need - len(out), min_duration, seen=seen))
            if len(out) >= need:
                break
        return out

    return _run("XVideos", run, skip, count)


# ── Eporner ───────────────────────────────────────────────────────────
def search_eporner(query, count, skip=0, min_duration=600):
    need = count + skip
    per_page = min(max(need, 20), 60)

    async def run():
        import eporner_api
        from eporner_api import Gay, Order, LowQuality
        client = eporner_api.Client()

        async def extract(v):
            # Many derived properties (thumbnail, rating, ...) raise behind the
            # age-verification wall, so only touch the safe fields.
            dur_s = _dur(_sget(v, "length", 0))
            tags = [t for t in (list(_sget(v, "tags", []) or [])) if t]
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                tags=tags,
            )

        out, page = [], 1
        while len(out) < need and page <= 6:
            agen = client.search_videos(
                query=query, sorting_gay=Gay.exclude_gay_content,
                sorting_order=Order.longest,
                sorting_low_quality=LowQuality.exclude_low_quality_content,
                page=page, per_page=per_page,
            )
            batch = await _collect(agen, extract, need - len(out), min_duration)
            if not batch:
                break
            out.extend(batch)
            page += 1
        return out

    return _run("Eporner", run, skip, count)


# ── YouPorn ───────────────────────────────────────────────────────────
def search_youporn(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = _pages(need, 15)

    async def run():
        import youporn_api
        client = youporn_api.Client()
        min_min = max(1, min_duration // 60)
        md = next((c for c in ("60", "50", "40", "30", "20", "10") if int(c) <= min_min), None)

        async def extract(v):
            dur_s = _dur(_sget(v, "length", _sget(v, "duration", 0)))
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                thumbnail=str(_sget(v, "thumbnail", "") or _sget(v, "thumbnail_url", "") or ""),
                tags=list(_sget(v, "categories", []) or _sget(v, "tags", []) or []),
                pornstars=list(_sget(v, "pornstars", []) or []),
            )

        agen = client.search_videos(query, pages=pages, filter_relevance="duration",
                                    filter_duration_minimum=md)
        return await _collect(agen, extract, need, min_duration)

    return _run("YouPorn", run, skip, count)


# ── HQPorner ──────────────────────────────────────────────────────────
def search_hqporner(query, count, skip=0, min_duration=600):
    need = count + skip
    pages = _pages(need, 15)

    async def run():
        import hqporner_api
        client = hqporner_api.Client()

        async def extract(v):
            dur_s = _dur(_sget(v, "length", ""))
            # Prefer real MP4 CDN links (now async); worker wgets _cdn_url.
            cdn = ""
            try:
                urls = await v.direct_download_urls()
                if urls:
                    pick = str(next((u for u in urls if "360" in str(u)), urls[0]))
                    cdn = pick if pick.startswith("http") else f"https://{pick}"
            except Exception:
                cdn = ""
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                tags=list(_sget(v, "tags", []) or []),
                pornstars=list(_sget(v, "pornstars", []) or []),
                cdn=cdn or None,
            )

        return await _collect(client.search_videos(query, pages=pages), extract, need, min_duration)

    return _run("HQPorner", run, skip, count)


# ── yt-dlp generic fallback (RedTube / SpankBang) ─────────────────────
def search_ytdlp(query, count, skip=0, min_duration=600, prefix="ytsearch"):
    """Generic yt-dlp search fallback. Note: only sites with a yt-dlp search
    extractor (e.g. 'ytsearch') actually return results; unsupported prefixes
    simply yield [] instead of crashing the run."""
    import json
    import subprocess
    need = count + skip
    cmd = ["yt-dlp", f"{prefix}{need}:{query}", "--flat-playlist", "-J", "--no-warnings"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        data = json.loads(r.stdout or "{}")
    except Exception:
        return []
    if not isinstance(data, dict):
        return []
    out = []
    for e in (data.get("entries") or []):
        if not isinstance(e, dict):
            continue
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
