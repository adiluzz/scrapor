#!/usr/bin/env python3
"""
Pure search functions for each supported source site.

Each searcher returns a list of normalized dicts:
  {
    "url": str,                 # canonical source page URL (dedup key)
    "title": str,
    "description": str,
    "tags": list[str],
    "categories": list[str],
    "pornstars": list[str],
    "thumbnail": str,           # remote thumbnail URL (may be empty)
    "duration_sec": int | None,
    "_m3u8_base_url": str | None,   # XHamster HLS fast path
    "_cdn_url": str | None,         # HQPorner direct MP4 fast path
    "_part_urls": list[str] | None, # ParadiseHill multi-part MP4 fast path
  }

Site names match src/lib/source-sites.ts.

Each searcher returns a pagination tuple:
  (results, next_cursor, exhausted)
where `next_cursor` is passed back on the next batch (page number for HTML /
Eporner / ParadiseHill; result offset for API libraries), and `exhausted` is True
when the source has no more result pages.

The "EchterAlsFake" site-API libraries (phub, xnxx_api, xvideos_api,
youporn_api, hqporner_api) are async-first: their
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
import json
import os
import re
import sys

_XH_BASE = "https://xhamster.com"
# Age-verification interstitials are ~50 KB; real search pages are 300 KB+.
_XH_MIN_SEARCH_BYTES = 100_000
# Proactive cookies help on some regions; US datacenter IPs still need VPN (see docker-compose.vpn.yml).
_XH_COOKIES = {"x_age_verified": "1", "cookie_accept": "1"}
# CDN host varies by region (video-am, video-h, video-nss, …). Prefer h264 over av1.
_XH_M3U8_TPL_RES = (
    re.compile(r"https://video-[a-z0-9.-]+[^\"'\s]+_TPL_\.h264\.mp4\.m3u8", re.I),
    re.compile(r"https://video-[a-z0-9.-]+[^\"'\s]+_TPL_\.av1\.mp4\.m3u8", re.I),
    re.compile(r"https://[^\"'\s]+_TPL_\.h264\.mp4\.m3u8", re.I),
    re.compile(r"https://[^\"'\s]+_TPL_\.av1\.mp4\.m3u8", re.I),
)


def _norm(url, title, duration_sec, thumbnail="", tags=None, pornstars=None,
          categories=None, description="", m3u8=None, cdn=None):
    return {
        "url": str(url or ""),
        "title": str(title or "Unknown"),
        "description": str(description or ""),
        "tags": [str(t) for t in (tags or [])],
        "pornstars": [str(p) for p in (pornstars or [])],
        "categories": [str(c) for c in (categories or [])],
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
    apply the duration/url/dedup filters, and stop once `need` items are gathered.

    Returns (items, saw_any) where saw_any is True if the generator yielded at
    least one video object (even if all were filtered out).
    """
    out = []
    saw_any = False
    async for v in _aiter_any(agen):
        saw_any = True
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
    return out, saw_any


async def _aiter_any(obj):
    """Yield from async generators, awaitables that return iterables, or sync iterables."""
    if inspect.isawaitable(obj):
        obj = await obj
    if hasattr(obj, "__aiter__"):
        async for item in obj:
            yield item
        return
    if obj is None:
        return
    for item in obj:
        yield item


def _page_cursor(cursor):
    """HTML searchers use 1-based page cursors; 0 means page 1."""
    return max(1, int(cursor or 0))


def _category_slug(text: str) -> str:
    """Normalize a category name into a URL slug used by most tube sites."""
    s = re.sub(r"[^\w\s-]", "", (text or "").strip().lower())
    return re.sub(r"[\s_]+", "-", s).strip("-")


def _is_category_mode(mode) -> bool:
    return str(mode or "query").strip().lower() == "category"


def _offset_cursor(cursor):
    """API searchers use a running result offset (number of hits already consumed)."""
    return max(0, int(cursor or 0))


def _pages(need, per_page):
    return max(2, -(-need // max(1, per_page)))


async def _fetch_until(collect_fn, need, per_page):
    """Keep widening page depth until at least `need` items or the source stops growing."""
    pages = max(1, _pages(need, per_page))
    prev_len = -1
    results = []
    while True:
        results = await collect_fn(pages)
        if len(results) >= need:
            return results
        if len(results) == prev_len:
            break
        prev_len = len(results)
        pages += 1
    return results


async def _run_paginated(source, coro_factory, offset, count):
    """Run an async paginated search; return (batch, next_offset, exhausted)."""
    need = offset + count
    try:
        full = await coro_factory(need)
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] {source} failed: {e!r}", file=sys.stderr, flush=True)
        return [], offset, True
    batch = full[offset:offset + count]
    next_offset = offset + len(batch)
    exhausted = len(full) < need
    return batch, next_offset, exhausted


# ── HTML search fallback (curl_cffi + bs4) ────────────────────────────
# Used for sources that have no working library search (RedTube, SpankBang)
# and as a fallback when a library returns nothing (XHamster, YouPorn).
# We only extract video-page URLs (+ best-effort title/duration/thumbnail)
# from the search-results HTML; the worker downloads each via yt-dlp.
_HTML_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
_DUR_RE = re.compile(r"\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b")


def _scrape_proxy():
    """Optional HTTP(S) proxy for scrape fetches (or Gluetun HTTP proxy on :8888)."""
    return os.environ.get("SCRAPE_HTTP_PROXY") or os.environ.get("HTTPS_PROXY") or ""


def _html_get(url):
    """Fetch a page, preferring curl_cffi (chrome impersonation beats most bot
    protection), then httpx, then urllib. Returns "" on any failure."""
    proxy = _scrape_proxy()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    try:
        from curl_cffi import requests as _cr
        r = _cr.get(url, impersonate="chrome120", timeout=30, proxies=proxies)
        if r.status_code == 200 and r.text:
            return r.text
    except Exception:
        pass
    try:
        import httpx
        kw = {"headers": _HTML_HEADERS, "timeout": 30, "follow_redirects": True}
        if proxy:
            kw["proxy"] = proxy
        r = httpx.get(url, **kw)
        if r.status_code == 200 and r.text:
            return r.text
    except Exception:
        pass
    try:
        import urllib.request
        handlers = []
        if proxy:
            handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
        opener = urllib.request.build_opener(*handlers)
        req = urllib.request.Request(url, headers=_HTML_HEADERS)
        with opener.open(req, timeout=30) as resp:
            return resp.read().decode("utf-8", "ignore")
    except Exception:
        return ""


def _xhamster_get(url):
    """Fetch an xHamster page with age/cookie headers, then fall back to _html_get."""
    proxy = _scrape_proxy()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    try:
        from curl_cffi import requests as _cr
        session = _cr.Session(impersonate="chrome120")
        session.cookies.update(_XH_COOKIES)
        r = session.get(url, timeout=30, proxies=proxies)
        if r.status_code == 200 and r.text:
            return r.text
    except Exception:
        pass
    return _html_get(url)


def _extract_initials_json(html):
    """Parse window.initials={...} embedded in xHamster pages."""
    start = html.find("window.initials=")
    if start < 0:
        return None
    json_start = html.find("{", start)
    if json_start < 0:
        return None
    depth = 0
    end = json_start
    for i in range(json_start, len(html)):
        c = html[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    try:
        return json.loads(html[json_start:end].replace("\\/", "/"))
    except Exception:
        return None


def _is_xhamster_age_gate(html):
    """True when xHamster returns the age-verification interstitial instead of results."""
    if not html:
        return False
    if "age-verification" in html or "ageVerificationBannerProps" in html:
        return True
    if "searchResult" not in html and html.count("/videos/") == 0:
        if len(html) < _XH_MIN_SEARCH_BYTES or "start-modal" in html:
            return True
    return False


def _xhamster_canonical_url(url_or_path):
    from urllib.parse import urlparse
    if not url_or_path:
        return ""
    if str(url_or_path).startswith("http"):
        path = urlparse(url_or_path).path or ""
    else:
        path = url_or_path if str(url_or_path).startswith("/") else f"/{url_or_path}"
    if "/videos/" not in path:
        return ""
    return f"{_XH_BASE}{path.rstrip('/')}"


def _xhamster_min_duration_param(min_duration):
    min_min = max(1, min_duration // 60)
    return next((c for c in ("40", "30", "10", "5", "2") if int(c) <= min_min), "10")


def _xhamster_from_initials(html, need, min_duration, seen):
    """Extract search hits from window.initials.searchResult.videoThumbProps."""
    data = _extract_initials_json(html)
    if not data:
        return []
    sr = data.get("searchResult")
    if not isinstance(sr, dict):
        return []
    items = sr.get("videoThumbProps") or []
    out = []
    for v in items:
        if not isinstance(v, dict):
            continue
        url = _xhamster_canonical_url(v.get("pageURL") or "")
        if not url or url in seen:
            continue
        dur_raw = v.get("duration")
        dur_s = int(dur_raw) if dur_raw else None
        if dur_s and dur_s < min_duration:
            continue
        seen.add(url)
        thumb = str(v.get("thumbURL") or v.get("imageURL") or "")
        title = str(v.get("title") or "Unknown")
        out.append(_norm(url, title, dur_s, thumbnail=thumb))
        if len(out) >= need:
            break
    return out


def _xhamster_from_links(html, need, min_duration, seen):
    """Anchor-based fallback when initials JSON is missing or incomplete."""
    from urllib.parse import urljoin, urlparse
    try:
        from bs4 import BeautifulSoup
    except Exception:
        return []
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.find_all("a", href=True):
        full = urljoin(_XH_BASE, a["href"])
        parsed = urlparse(full)
        if "xhamster" not in (parsed.netloc or ""):
            continue
        if not re.search(r"^/videos/", parsed.path or ""):
            continue
        clean = _xhamster_canonical_url(parsed.path)
        if not clean or clean in seen:
            continue
        dur = _find_duration(a)
        if dur and dur < min_duration:
            continue
        seen.add(clean)
        title = (a.get("title") or a.get("data-title")
                 or a.get_text(" ", strip=True) or "").strip()
        out.append(_norm(clean, title or "Unknown", dur or None, thumbnail=_find_thumb(a)))
        if len(out) >= need:
            break
    return out


def _xhamster_videos_from_html(html, need, min_duration, seen):
    out = _xhamster_from_initials(html, need, min_duration, seen)
    if len(out) >= need:
        return out
    out.extend(_xhamster_from_links(html, need - len(out), min_duration, seen))
    return out[:need]


def _find_duration(node):
    for _ in range(4):
        if node is None or not hasattr(node, "get_text"):
            break
        m = _DUR_RE.search(node.get_text(" ", strip=True))
        if m:
            if m.group(3):
                return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
            return int(m.group(1)) * 60 + int(m.group(2))
        node = getattr(node, "parent", None)
    return 0


def _find_thumb(node):
    for _ in range(3):
        if node is None or not hasattr(node, "find"):
            break
        img = node.find("img")
        if img:
            for attr in ("data-original", "data-src", "data-thumb_url", "data-thumb", "src"):
                v = img.get(attr)
                if v and str(v).startswith("http"):
                    return str(v)
        node = getattr(node, "parent", None)
    return ""


def _html_search(source, query, count, min_duration, *, cursor,
                 domain, base, page_url, link_re, per_page=36):
    """HTML search starting at page `cursor`. Returns (results, next_page, exhausted)."""
    from urllib.parse import quote_plus, urljoin, urlparse
    try:
        from bs4 import BeautifulSoup
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] {source} html: bs4 unavailable: {e!r}", file=sys.stderr)
        return [], _page_cursor(cursor), True
    q = quote_plus(query)
    out, seen = [], set()
    page = _page_cursor(cursor)
    try:
        while len(out) < count:
            html = _html_get(page_url(q, page))
            if not html:
                return out, page, page == _page_cursor(cursor)
            soup = BeautifulSoup(html, "html.parser")
            matching = 0
            new_urls = 0
            for a in soup.find_all("a", href=True):
                full = urljoin(base, a["href"])
                parsed = urlparse(full)
                if domain not in (parsed.netloc or ""):
                    continue
                if not link_re.search(parsed.path):
                    continue
                matching += 1
                # Keep query string when it carries the video id (Pornhub viewkey).
                if parsed.query and re.search(r"(?:^|&)(?:viewkey|v)=", parsed.query, re.I):
                    clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{parsed.query}"
                else:
                    clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                if clean in seen:
                    continue
                seen.add(clean)
                new_urls += 1
                dur = _find_duration(a)
                if dur and dur < min_duration:
                    continue
                title = (a.get("title") or a.get("data-title")
                         or a.get_text(" ", strip=True) or "").strip()
                out.append(_norm(clean, title or "Unknown", dur or None,
                                 thumbnail=_find_thumb(a)))
                if len(out) >= count:
                    break
            if matching == 0:
                return out, page, True
            # No new URLs on this page => past the last page (or site is looping).
            if new_urls == 0:
                return out, page, True
            page += 1
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] {source} html failed: {e!r}", file=sys.stderr, flush=True)
    exhausted = len(out) < count
    return out, page, exhausted


def _html_redtube(query, count, cursor=0, min_duration=600, mode="query"):
    if _is_category_mode(mode):
        slug = _category_slug(query)
        return _html_search(
            "RedTube", query, count, min_duration, cursor=cursor,
            domain="redtube.com", base="https://www.redtube.com",
            page_url=lambda q, n: (
                f"https://www.redtube.com/redtube/{slug}"
                if n <= 1 else f"https://www.redtube.com/redtube/{slug}?page={n}"
            ),
            link_re=re.compile(r"^/\d{4,}$"),
        )
    return _html_search(
        "RedTube", query, count, min_duration, cursor=cursor,
        domain="redtube.com", base="https://www.redtube.com",
        page_url=lambda q, n: f"https://www.redtube.com/?search={q}&page={n}",
        link_re=re.compile(r"^/\d{4,}$"),
    )


def _html_spankbang(query, count, cursor=0, min_duration=600, mode="query"):
    # Category browse URLs are geo/CF fragile; fall back to keyword search path.
    if _is_category_mode(mode):
        slug = _category_slug(query)
        out = _html_search(
            "SpankBang", query, count, min_duration, cursor=cursor,
            domain="spankbang.com", base="https://spankbang.com",
            page_url=lambda q, n: (
                f"https://spankbang.com/category/{slug}/"
                if n <= 1 else f"https://spankbang.com/category/{slug}/{n}/"
            ),
            link_re=re.compile(r"^/[0-9a-z]+/video/"),
        )
        if out[0]:
            return out
        return _html_search(
            "SpankBang", query, count, min_duration, cursor=cursor,
            domain="spankbang.com", base="https://spankbang.com",
            page_url=lambda q, n: f"https://spankbang.com/s/{slug}/{n}/",
            link_re=re.compile(r"^/[0-9a-z]+/video/"),
        )
    return _html_search(
        "SpankBang", query, count, min_duration, cursor=cursor,
        domain="spankbang.com", base="https://spankbang.com",
        page_url=lambda q, n: f"https://spankbang.com/s/{q}/{n}/",
        link_re=re.compile(r"^/[0-9a-z]+/video/"),
    )


def _xhamster_new_urls_on_page(html, seen):
    """Count never-before-seen video URLs on this page (before duration filtering)."""
    data = _extract_initials_json(html)
    if data:
        sr = data.get("searchResult")
        if isinstance(sr, dict):
            n = 0
            for v in sr.get("videoThumbProps") or []:
                if not isinstance(v, dict):
                    continue
                url = _xhamster_canonical_url(v.get("pageURL") or "")
                if url and url not in seen:
                    n += 1
            if n:
                return n
    from urllib.parse import urljoin, urlparse
    try:
        from bs4 import BeautifulSoup
    except Exception:
        return 0
    soup = BeautifulSoup(html or "", "html.parser")
    n = 0
    for a in soup.find_all("a", href=True):
        full = urljoin(_XH_BASE, a["href"])
        parsed = urlparse(full)
        if "xhamster" not in (parsed.netloc or ""):
            continue
        if not re.search(r"^/videos/", parsed.path or ""):
            continue
        clean = _xhamster_canonical_url(parsed.path)
        if clean and clean not in seen:
            n += 1
    return n


def _xh_extract_m3u8(html):
    """Best-effort HLS template URL for the worker ffmpeg fast path."""
    for pat in _XH_M3U8_TPL_RES:
        m = pat.search(html or "")
        if m:
            return m.group(0)
    return None


def _xh_tag_kind(tag: dict) -> str:
    """Classify an xHamster videoTagsComponent entry: category | tag | pornstar | other."""
    from urllib.parse import urlparse

    url = str(tag.get("url") or tag.get("link") or tag.get("pageURL") or "").lower()
    path = urlparse(url).path if url else ""
    if "/categories/" in path or "/categories/" in url:
        return "category"
    if "/pornstars/" in path or "/pornstars/" in url:
        return "pornstar"
    if "/creators/" in path or "/channels/" in path or "/creators/" in url or "/channels/" in url:
        return "other"
    if "/tags/" in path or "/tags/" in url:
        return "tag"
    if tag.get("isPornstar"):
        return "pornstar"
    if tag.get("isCreator"):
        return "other"
    return "tag"


def _xh_parse_detail(html, url):
    """Parse a video page for metadata and download URLs (window.initials JSON)."""
    m3u8 = _xh_extract_m3u8(html)
    data = _extract_initials_json(html)
    if not data:
        return {"_m3u8_base_url": m3u8} if m3u8 else {}
    vm = data.get("videoModel") if isinstance(data.get("videoModel"), dict) else {}
    ve = data.get("videoEntity") if isinstance(data.get("videoEntity"), dict) else {}
    vtc = data.get("videoTagsComponent") if isinstance(data.get("videoTagsComponent"), dict) else {}

    title = str(vm.get("title") or ve.get("title") or "")
    dur_raw = vm.get("duration") or ve.get("duration")
    dur_s = int(dur_raw) if dur_raw else None
    description = str(vm.get("description") or ve.get("description") or "")
    thumb = str(
        vm.get("thumbURL") or ve.get("thumbBig") or vm.get("previewThumbURL") or ""
    )

    tags: list[str] = []
    categories: list[str] = []
    pornstars: list[str] = []
    for t in vtc.get("tags") or []:
        if not isinstance(t, dict):
            continue
        name = t.get("name")
        if not name:
            continue
        name = str(name)
        kind = _xh_tag_kind(t)
        if kind == "category":
            if name not in categories:
                categories.append(name)
        elif kind == "pornstar":
            if name not in pornstars:
                pornstars.append(name)
        elif kind == "tag":
            if name not in tags:
                tags.append(name)
    for p in ve.get("pornstarModels") or []:
        if not isinstance(p, dict):
            continue
        name = p.get("name") or p.get("title")
        if name:
            name = str(name)
            if name not in pornstars:
                pornstars.append(name)

    return {
        "url": url,
        "title": title,
        "duration_sec": dur_s,
        "tags": tags,
        "categories": categories,
        "pornstars": pornstars,
        "thumbnail": thumb,
        "description": description,
        "_m3u8_base_url": m3u8 or _xh_extract_m3u8(html),
    }


def _xhamster_list_search(query, count, cursor=0, min_duration=600, mode="query"):
    """Listing-only xHamster search via embedded JSON + HTML links."""
    from urllib.parse import quote_plus

    md = _xhamster_min_duration_param(min_duration)
    q = quote_plus(query)
    slug = _category_slug(query)
    out, seen = [], set()
    age_gate = False
    page = _page_cursor(cursor)
    try:
        while len(out) < count:
            if _is_category_mode(mode):
                url = (
                    f"{_XH_BASE}/categories/{slug}"
                    f"?sort=longest&min-duration={md}&page={page}"
                )
            else:
                url = f"{_XH_BASE}/search/{q}?sort=longest&min-duration={md}&page={page}"
            html = _xhamster_get(url)
            if not html:
                return out, page, page == _page_cursor(cursor), age_gate
            if _is_xhamster_age_gate(html):
                age_gate = True
                if page == _page_cursor(cursor):
                    print(
                        "[site_searchers] XHamster: age-verification wall (US datacenter IP). "
                        "Run the worker through NordVPN — see docker-compose.vpn.yml",
                        file=sys.stderr, flush=True,
                    )
                return out, page, True, age_gate
            new_urls = _xhamster_new_urls_on_page(html, seen)
            batch = _xhamster_videos_from_html(html, count - len(out), min_duration, seen)
            if batch:
                out.extend(batch)
            if new_urls == 0:
                return out, page, True, age_gate
            page += 1
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] XHamster search failed: {e!r}", file=sys.stderr, flush=True)
    exhausted = len(out) < count or age_gate
    return out, page, exhausted, age_gate


def _html_xhamster(query, count, cursor=0, min_duration=600, mode="query"):
    """Legacy listing-only entry (tests); prefer search_xhamster for enrichment."""
    out, page, exhausted, age_gate = _xhamster_list_search(
        query, count, cursor, min_duration, mode=mode,
    )
    if age_gate and not out:
        return [], page, True
    return out, page, exhausted


def _html_youporn(query, count, cursor=0, min_duration=600, mode="query"):
    if _is_category_mode(mode):
        slug = _category_slug(query)
        return _html_search(
            "YouPorn", query, count, min_duration, cursor=cursor,
            domain="youporn.com", base="https://www.youporn.com",
            page_url=lambda q, n: (
                f"https://www.youporn.com/category/{slug}/"
                if n <= 1 else f"https://www.youporn.com/category/{slug}/?page={n}"
            ),
            link_re=re.compile(r"^/watch/\d+"),
        )
    return _html_search(
        "YouPorn", query, count, min_duration, cursor=cursor,
        domain="youporn.com", base="https://www.youporn.com",
        page_url=lambda q, n: f"https://www.youporn.com/search/?query={q}&page={n}",
        link_re=re.compile(r"^/watch/\d+"),
    )


# ── ParadiseHill ──────────────────────────────────────────────────────
_PH_BASE = "https://en.paradisehill.cc"
_PH_HEX_RE = re.compile(r"^/[0-9a-f]{10,}/?$", re.I)
# Slug film URLs: /pissing-coffee-brown.../ or /abnorm_20_piss_baby_piss/
_PH_SLUG_RE = re.compile(r"^/[^/?#]+/?$", re.I)
_PH_RESERVED_PATH = re.compile(
    r"^/(?:search|actor|actors|category|categories|porn|studios|news|help|"
    r"upload|login|signup|order|for-advertisers|about|terms|confidentiality|dmca)(?:/|$)",
    re.I,
)
_PH_LINK_RE = _PH_HEX_RE  # legacy alias
_PH_VIDEO_LIST_RE = re.compile(r"var videoList = (\[.*?\]);", re.S)
_PH_ACTOR_RE = re.compile(r"^/actor/\d+/?$", re.I)
_PH_CATEGORY_RE = re.compile(r"^/category/[^/?#]+", re.I)

# User-facing names → ParadiseHill /category/{slug}/ paths.
_PH_CATEGORY_ALIASES = {
    "milf": "mature",
    "milfs": "mature",
    "mature": "mature",
    "anal": "anal-sex",
    "anal-sex": "anal-sex",
    "amateur": "amateur-porn",
    "blowjob": "blow-job",
    "blow-job": "blow-job",
    "lesbian": "lesbian-porn",
    "hentai": "hentai-animation",
    "bbw": "fat",
    "asian": "asians",
    "ebony": "blacks-women",
}


def _ph_resolve_category_slug(query: str) -> str:
    """Map a free-text category to a ParadiseHill /category/{slug} path segment."""
    slug = _category_slug(query)
    if not slug:
        return slug
    if slug in _PH_CATEGORY_ALIASES:
        return _PH_CATEGORY_ALIASES[slug]
    # Exact match against live categories index when available.
    html = _html_get(f"{_PH_BASE}/categories/") or ""
    paths = set(re.findall(r'href="(/category/[^"?#]+)', html, re.I))
    want = f"/category/{slug}"
    if want in paths or want + "/" in paths:
        return slug
    compact = slug.replace("-", "")
    for path in paths:
        name = path.rstrip("/").rsplit("/", 1)[-1].lower()
        if name.replace("-", "") == compact:
            return name
    return slug


def _ph_abs(url_or_path):
    from urllib.parse import urljoin
    if not url_or_path:
        return ""
    if str(url_or_path).startswith("http"):
        return str(url_or_path)
    return urljoin(_PH_BASE, str(url_or_path))


def _ph_is_film_path(path):
    """True for ParadiseHill film page paths (hex id or slug), not site nav."""
    path = path or ""
    if not path or path == "/":
        return False
    if _PH_RESERVED_PATH.match(path):
        return False
    return bool(_PH_HEX_RE.match(path) or _PH_SLUG_RE.match(path))


def _ph_parse_video_list(html):
    """Extract ordered MP4 part URLs from the embedded videoList JS array."""
    m = _PH_VIDEO_LIST_RE.search(html or "")
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except Exception:
        return []
    out = []
    for item in data:
        if not isinstance(item, dict):
            continue
        sources = item.get("sources") or []
        if not sources or not isinstance(sources[0], dict):
            continue
        src = sources[0].get("src") or ""
        if src:
            out.append(str(src).replace("\\/", "/"))
    return out


def _ph_parse_detail(html, url):
    """Parse a ParadiseHill film page for metadata and download URLs."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html or "", "html.parser")
    title_el = soup.select_one("h1")
    title = title_el.get_text(strip=True) if title_el else "Unknown"

    description = ""
    desc_p = soup.select_one(".opisanie p")
    if desc_p:
        description = re.sub(r"^Description:\s*", "", desc_p.get_text(" ", strip=True))
    if not description:
        meta_desc = soup.select_one('meta[name="description"]')
        if meta_desc and meta_desc.get("content"):
            description = str(meta_desc["content"]).strip()

    pornstars = []
    for a in soup.select('a[href*="/actor/"]'):
        href = a.get("href") or ""
        if _PH_ACTOR_RE.match(href.split("?", 1)[0]):
            name = a.get_text(strip=True)
            if name and name not in pornstars:
                pornstars.append(name)

    tags = []
    for a in soup.select('a[href*="/category/"]'):
        href = a.get("href") or ""
        if _PH_CATEGORY_RE.match(href.split("?", 1)[0]):
            name = a.get_text(strip=True)
            if name and name not in tags:
                tags.append(name)

    thumbnail = ""
    og = soup.select_one('meta[property="og:image"]')
    if og and og.get("content"):
        thumbnail = _ph_abs(og["content"])
    if not thumbnail:
        img = soup.select_one(".poster img, .block-poster img, picture img")
        if img:
            for attr in ("src", "data-src"):
                if img.get(attr):
                    thumbnail = _ph_abs(img[attr])
                    break

    part_urls = _ph_parse_video_list(html)
    return {
        "title": title,
        "description": description,
        "tags": [],
        "categories": tags,
        "pornstars": pornstars,
        "thumbnail": thumbnail,
        "_part_urls": part_urls or None,
        "_cdn_url": part_urls[0] if len(part_urls) == 1 else None,
    }


def _ph_search_items(html):
    """Extract film cards from a ParadiseHill search/home listing page."""
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin, urlparse
    soup = BeautifulSoup(html or "", "html.parser")
    out = []
    seen = set()
    for item in soup.select(".list-film-item"):
        a = item.select_one("a[href]")
        if not a:
            continue
        full = urljoin(_PH_BASE, a["href"])
        parsed = urlparse(full)
        if "paradisehill.cc" not in (parsed.netloc or ""):
            continue
        if not _ph_is_film_path(parsed.path or ""):
            continue
        clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}/"
        if clean in seen:
            continue
        seen.add(clean)
        name_el = item.select_one('[itemprop="name"]')
        title = name_el.get_text(strip=True) if name_el else ""
        if not title:
            title = (a.get("title") or a.get_text(" ", strip=True) or "").strip()
        genre_el = item.select_one('[itemprop="genre"]')
        tags = [genre_el.get_text(strip=True)] if genre_el else []
        thumb = ""
        img = item.select_one("img")
        if img:
            for attr in ("src", "data-src"):
                if img.get(attr):
                    thumb = _ph_abs(img[attr])
                    break
        out.append((clean, title, tags, thumb))
    return out


def search_paradisehill(query, count, cursor=0, min_duration=600, mode="query"):
    """Search ParadiseHill and enrich each hit with detail-page metadata + MP4 parts."""
    from urllib.parse import quote_plus
    offset = _offset_cursor(cursor)
    need = offset + count
    q = quote_plus(query)
    slug = _ph_resolve_category_slug(query) if _is_category_mode(mode) else _category_slug(query)
    all_stubs, seen = [], set()
    page = 1
    try:
        while len(all_stubs) < need:
            if _is_category_mode(mode):
                page_url = (
                    f"{_PH_BASE}/category/{slug}/"
                    if page == 1 else f"{_PH_BASE}/category/{slug}/?page={page}"
                )
            else:
                page_url = (
                    f"{_PH_BASE}/search/?pattern={q}&what=1"
                    if page == 1 else f"{_PH_BASE}/search/?pattern={q}&what=1&page={page}"
                )
            html = _html_get(page_url)
            # Unknown category slug → fall back to keyword search once.
            if _is_category_mode(mode) and page == 1 and not html:
                page_url = f"{_PH_BASE}/search/?pattern={q}&what=1"
                html = _html_get(page_url)
                mode = "query"  # stay on search pagination for subsequent pages
            if not html:
                break
            batch = _ph_search_items(html)
            if not html:
                break
            batch = _ph_search_items(html)
            if not batch:
                break
            new_urls = 0
            for clean, title, tags, thumb in batch:
                if clean in seen:
                    continue
                seen.add(clean)
                new_urls += 1
                all_stubs.append((clean, title, tags, thumb))
                if len(all_stubs) >= need:
                    break
            if new_urls == 0:
                break
            page += 1
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] ParadiseHill search failed: {e!r}", file=sys.stderr, flush=True)
        return [], offset, True

    stubs = all_stubs[offset:offset + count]
    out = []
    for clean, title, tags, thumb in stubs:
        try:
            detail_html = _html_get(clean)
            if not detail_html:
                out.append(_norm(clean, title, None, thumbnail=thumb, categories=tags))
                continue
            meta = _ph_parse_detail(detail_html, clean)
            item = _norm(
                clean,
                meta.get("title") or title,
                None,
                thumbnail=meta.get("thumbnail") or thumb,
                tags=meta.get("tags"),
                categories=meta.get("categories") or tags,
                pornstars=meta.get("pornstars"),
                description=meta.get("description") or "",
                cdn=meta.get("_cdn_url"),
            )
            parts = meta.get("_part_urls")
            if parts and len(parts) > 1:
                item["_part_urls"] = parts
            out.append(item)
        except Exception:
            out.append(_norm(clean, title, None, thumbnail=thumb, categories=tags))
    next_cursor = offset + len(stubs)
    exhausted = len(all_stubs) < need
    return out, next_cursor, exhausted


# ── XNXX ──────────────────────────────────────────────────────────────
def _xnxx_is_redundant_desc(description: str, title: str) -> bool:
    """True when description is empty or just a copy/truncation of the title.

    XNXX JSON-LD / meta description usually repeats the title (sometimes with
    ', free sex video' appended). The real blurb lives in the page body.
    """
    d = re.sub(r"\s+", " ", (description or "").strip().lower())
    t = re.sub(r"\s+", " ", (title or "").strip().lower())
    if not d:
        return True
    if not t:
        return False
    if d == t:
        return True
    # "{title}, free sex video" / "{title}."
    if d.startswith(t) and re.fullmatch(
        re.escape(t) + r"(?:,?\s*free sex video)?\.?", d
    ):
        return True
    # Truncated title used as description
    if len(d) >= 24 and t.startswith(d):
        return True
    return False


def _xnxx_parse_detail(html, url=""):
    """Parse an XNXX video page for title, real description, tags, pornstars.

    Prefer `.metadata-row.video-description` over JSON-LD `description`, which
    almost always duplicates the title.
    """
    import html as html_lib
    from bs4 import BeautifulSoup

    raw = html or ""
    soup = BeautifulSoup(raw, "html.parser")

    title = ""
    m = re.search(r"html5player\.setVideoTitle\('([^']*)'\);", raw)
    if m:
        title = html_lib.unescape(m.group(1)).strip()
    if not title:
        h = soup.select_one("h1, .clear-infobar strong, .video-title")
        if h:
            title = h.get_text(" ", strip=True)

    description = ""
    desc_el = soup.select_one(".metadata-row.video-description")
    if desc_el:
        for br in desc_el.find_all("br"):
            br.replace_with("\n")
        description = desc_el.get_text("\n", strip=True)
        # Some pages embed literal "<br>" text instead of real tags.
        description = re.sub(r"(?i)<br\s*/?>", "\n", description)
        description = re.sub(r"\n{3,}", "\n\n", description).strip()
    if _xnxx_is_redundant_desc(description, title):
        description = ""

    pornstars = []
    for a in soup.select('a.is-pornstar[href*="/search/"]'):
        name = a.get_text(strip=True) or ""
        if not name:
            href = a.get("href") or ""
            slug = href.rstrip("/").rsplit("/", 1)[-1]
            name = slug.replace("+", " ").strip()
        if name and name not in pornstars:
            pornstars.append(name)

    tags = []
    for a in soup.select('a.is-keyword[href*="/search/"]'):
        name = a.get_text(strip=True) or ""
        if not name:
            href = a.get("href") or ""
            slug = href.rstrip("/").rsplit("/", 1)[-1]
            name = slug.replace("+", " ").strip()
        if name and name not in tags:
            tags.append(name)

    thumbnail = ""
    og = soup.select_one('meta[property="og:image"]')
    if og and og.get("content"):
        thumbnail = str(og["content"]).strip()

    m3u8 = None
    hm = re.search(r"html5player\.setVideoHLS\('([^']+)'\);", raw)
    if hm:
        m3u8 = hm.group(1).strip() or None

    return {
        "title": title or "Unknown",
        "description": description,
        "tags": tags,
        "categories": [],
        "pornstars": pornstars,
        "thumbnail": thumbnail,
        "_m3u8_base_url": m3u8,
        "url": url or None,
    }


def search_xnxx(query, count, cursor=0, min_duration=600, mode="query"):
    # xnxx_api has no category browse; category mode uses /tags/{slug} listings.
    if _is_category_mode(mode):
        slug = _category_slug(query)
        return _html_search(
            "XNXX", query, count, min_duration, cursor=cursor,
            domain="xnxx.com", base="https://www.xnxx.com",
            page_url=lambda q, n: (
                f"https://www.xnxx.com/tags/{slug}/{n - 1}"
                if n > 1 else f"https://www.xnxx.com/tags/{slug}"
            ),
            link_re=re.compile(r"^/video-[a-z0-9]+/"),
            per_page=28,
        )

    offset = _offset_cursor(cursor)

    async def run(need):
        import xnxx_api
        from xnxx_api.modules.search_filters import Length
        client = xnxx_api.Client()
        res = await client.search(query, length=Length.X_10min_plus)
        try:
            total_p = int(_sget(res, "total_pages", 1) or 1)
        except Exception:
            total_p = 1

        async def extract(v):
            length_min = _dur(_sget(v, "length", 0))
            dur_s = length_min * 60 if length_min else 0
            thumbs = _sget(v, "thumbnail_url", []) or []
            if isinstance(thumbs, (list, tuple)):
                thumb = str(thumbs[0]) if thumbs else ""
            else:
                thumb = str(thumbs)
            title = str(_sget(v, "title", "") or "")
            # xnxx_api.Video.description reads JSON-LD, which duplicates the title.
            # Prefer the on-page `.video-description` block from html_content.
            page_html = _sget(v, "html_content", "") or ""
            page_meta = _xnxx_parse_detail(page_html, _sget(v, "url", "")) if page_html else {}
            description = page_meta.get("description") or ""
            tags = page_meta.get("tags") or list(_sget(v, "tags", []) or [])
            pornstars = page_meta.get("pornstars") or list(_sget(v, "pornstars", []) or [])
            if page_meta.get("thumbnail"):
                thumb = page_meta["thumbnail"] or thumb
            return _norm(
                _sget(v, "url", ""), title or page_meta.get("title") or "",
                dur_s or None,
                thumbnail=thumb,
                tags=tags,
                pornstars=pornstars,
                description=description,
                m3u8=page_meta.get("_m3u8_base_url"),
            )

        async def collect_fn(pages):
            pages_eff = min(pages, total_p)
            vids = _sget(res, "videos")
            if callable(vids):
                agen = vids(pages=pages_eff)
            else:
                agen = vids
            if inspect.iscoroutine(agen):
                agen = await agen
            items, _ = await _collect(agen, extract, need, min_duration)
            return items

        return await _fetch_until(collect_fn, need, 28)

    return asyncio.run(_run_paginated("XNXX", run, offset, count))


# ── PornHub (phub) ────────────────────────────────────────────────────
def _pornhub_category_slug(query: str):
    """Map a free-text category to a phub category literal, or None."""
    slug = _category_slug(query).replace("_", "-")
    # Common aliases → phub literals
    aliases = {
        "teen": "teen",
        "teens": "teen",
        "redhead": "red-head",
        "red-head": "red-head",
        "hd": "hd-porn",
        "hd-porn": "hd-porn",
        "old-young": "old-young",
        "step-fantasy": "step-fantasy",
        "rough": "rough-sex",
        "rough-sex": "rough-sex",
    }
    if slug in aliases:
        return aliases[slug]
    # Accept any phub-like slug characters; phub asserts on invalid literals.
    if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        return slug
    return None


def _html_pornhub(query, count, cursor=0, min_duration=600, mode="query"):
    """HTML search/category listing fallback when the phub library fails."""
    from urllib.parse import quote_plus
    q = quote_plus(query)
    slug = _category_slug(query)
    if _is_category_mode(mode):
        # Category-flavored listing via search (stable without category IDs).
        page_url = lambda _q, n: (
            f"https://www.pornhub.com/video/search?search={quote_plus(slug)}&page={n}"
        )
    else:
        page_url = lambda _q, n: f"https://www.pornhub.com/video/search?search={q}&page={n}"
    return _html_search(
        "PornHub", query, count, min_duration, cursor=cursor,
        domain="pornhub.com", base="https://www.pornhub.com",
        page_url=page_url,
        link_re=re.compile(r"/view_video\.php"),
        per_page=20,
    )


def _phub_search_agen(client, query, pages, category=None):
    """Return an iterable/async-iterable of videos across phub API versions."""
    search_videos = getattr(client, "search_videos", None)
    if callable(search_videos):
        try:
            if category:
                return search_videos(query or category, pages=pages, category=category)
            return search_videos(query, pages=pages)
        except TypeError:
            return search_videos(query or (category or ""), pages=pages)

    # Newer phub: Client.search → Query with .pages / .sample
    kwargs = {}
    if category:
        kwargs["category"] = category
    try:
        result = client.search(query or (category or ""), **kwargs)
    except TypeError:
        result = client.search(query or (category or ""))
    except Exception:
        return []

    def _iter_pages():
        yielded_pages = 0
        pages_obj = getattr(result, "pages", None)
        if pages_obj is None:
            sample = getattr(result, "sample", None)
            if callable(sample):
                yield from sample(pages * 12)
            return
        try:
            for page in pages_obj:
                yielded_pages += 1
                if page is None:
                    continue
                # page may be a list of videos or a single page object
                try:
                    for v in page:
                        yield v
                except TypeError:
                    yield page
                if yielded_pages >= max(1, pages):
                    break
        except Exception:
            sample = getattr(result, "sample", None)
            if callable(sample):
                yield from sample(pages * 12)

    return _iter_pages()


def search_pornhub(query, count, cursor=0, min_duration=600, mode="query"):
    # Category mode: prefer HTML listings (stable without phub category IDs / geo blocks).
    if _is_category_mode(mode):
        batch, next_cursor, exhausted = _html_pornhub(
            query, count, cursor, min_duration, mode=mode,
        )
        if batch:
            return batch, next_cursor, exhausted

    offset = _offset_cursor(cursor)
    cat = _pornhub_category_slug(query) if _is_category_mode(mode) else None

    async def run(need):
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

        async def collect_fn(pages):
            agen = _phub_search_agen(client, query, pages, category=cat)
            items, _ = await _collect(agen, extract, need, min_duration)
            return items

        return await _fetch_until(collect_fn, need, 12)

    batch, next_cursor, exhausted = asyncio.run(_run_paginated("PornHub", run, offset, count))
    if batch:
        return batch, next_cursor, exhausted
    return _html_pornhub(query, count, cursor, min_duration, mode=mode)


# ── XHamster ──────────────────────────────────────────────────────────
def search_xhamster(query, count, cursor=0, min_duration=600, mode="query"):
    """Search xHamster via HTML + window.initials; enrich each hit from its video page."""
    stubs, page, exhausted, age_gate = _xhamster_list_search(
        query, count, cursor, min_duration, mode=mode,
    )
    if age_gate and not stubs:
        return [], page, True

    out = []
    for stub in stubs[:count]:
        clean = stub.get("url") or ""
        if not clean:
            continue
        try:
            detail_html = _xhamster_get(clean)
            if not detail_html:
                out.append(stub)
                continue
            meta = _xh_parse_detail(detail_html, clean)
            out.append(_norm(
                clean,
                meta.get("title") or stub.get("title"),
                meta.get("duration_sec") or stub.get("duration_sec"),
                thumbnail=meta.get("thumbnail") or stub.get("thumbnail"),
                tags=meta.get("tags"),
                pornstars=meta.get("pornstars"),
                categories=meta.get("categories"),
                description=meta.get("description") or "",
                m3u8=meta.get("_m3u8_base_url"),
            ))
        except Exception:
            out.append(stub)

    return out, page, exhausted


# ── XVideos ───────────────────────────────────────────────────────────
def search_xvideos(query, count, cursor=0, min_duration=600, mode="query"):
    if _is_category_mode(mode):
        slug = _category_slug(query)
        return _html_search(
            "XVideos", query, count, min_duration, cursor=cursor,
            domain="xvideos.com", base="https://www.xvideos.com",
            page_url=lambda q, n: (
                f"https://www.xvideos.com/tags/{slug}"
                if n <= 1 else f"https://www.xvideos.com/tags/{slug}/{n - 1}"
            ),
            link_re=re.compile(r"^/video\."),
            per_page=20,
        )

    offset = _offset_cursor(cursor)

    async def run(need):
        import xvideos_api
        from xvideos_api.modules.sorting import SortVideoTime
        client = xvideos_api.Client()

        async def extract(v):
            dur_s = _dur(_sget(v, "length", ""))
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                thumbnail=str(_sget(v, "thumbnail_url", "") or ""),
                tags=list(_sget(v, "tags", []) or []),
                description=str(_sget(v, "description", "") or ""),
            )

        async def collect_fn(pages):
            seen, out = set(), []
            for st in (SortVideoTime.Sort_really_long, SortVideoTime.Sort_long_10_20min):
                agen = client.search(query, sorting_time=st, pages=pages)
                batch, _ = await _collect(agen, extract, need - len(out), min_duration, seen=seen)
                out.extend(batch)
                if len(out) >= need:
                    break
            return out

        return await _fetch_until(collect_fn, need, 20)

    return asyncio.run(_run_paginated("XVideos", run, offset, count))


# ── Eporner (HTML + browser-impersonated session; bypasses yt-dlp) ─────
_EP_BASE = "https://www.eporner.com"
_EP_VIDEO_RE = re.compile(r"^/video-[A-Za-z0-9]+/")


def _eporner_tag_slug(query):
    return re.sub(r"\s+", "-", (query or "").strip().lower())


def _eporner_search_url(query, page, mode="query"):
    from urllib.parse import quote_plus
    if _is_category_mode(mode):
        slug = _category_slug(query)
        if page <= 1:
            return f"{_EP_BASE}/cat/{slug}/"
        return f"{_EP_BASE}/cat/{slug}/{page}/"
    q = quote_plus(query)
    slug = _eporner_tag_slug(query)
    if page <= 1:
        return f"{_EP_BASE}/search/{q}/"
    return f"{_EP_BASE}/tag/{slug}/{page}/"


def _eporner_search_items(html):
    """Extract video cards from an Eporner search/tag listing page."""
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin, urlparse
    soup = BeautifulSoup(html or "", "html.parser")
    out = []
    seen = set()
    for item in soup.select(".mb"):
        a = item.select_one('a[href*="/video-"]')
        if not a:
            continue
        full = urljoin(_EP_BASE, a.get("href", ""))
        parsed = urlparse(full)
        if "eporner.com" not in (parsed.netloc or ""):
            continue
        if not _EP_VIDEO_RE.search(parsed.path or ""):
            continue
        clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}/"
        if clean in seen:
            continue
        seen.add(clean)
        title_el = item.select_one(".mbtit a")
        title = (title_el.get_text(strip=True) if title_el
                 else a.get("title") or a.get_text(" ", strip=True) or "")
        dur_el = item.select_one(".mbtim")
        dur_s = _dur(dur_el.get_text()) if dur_el else None
        thumb = ""
        img = item.select_one("img")
        if img:
            for attr in ("src", "data-src"):
                val = img.get(attr)
                if val and str(val).startswith("http"):
                    thumb = str(val)
                    break
        out.append((clean, title, dur_s, thumb))
    return out


def _eporner_best_dload(html, max_quality=720):
    """Pick the highest-quality h264 MP4 download link that does not require login."""
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin
    soup = BeautifulSoup(html or "", "html.parser")
    best_q, best_url = -1, ""
    for a in soup.select(".download-h264 a[href]"):
        href = a.get("href", "")
        if not href.endswith(".mp4"):
            continue
        m = re.search(r"(\d+)p", a.get_text(" ", strip=True))
        q = int(m.group(1)) if m else 0
        if q <= 0 or q > max_quality:
            continue
        if q >= best_q:
            best_q = q
            best_url = urljoin(_EP_BASE, href)
    return best_url


def _eporner_parse_detail(html, url):
    """Parse an Eporner video page for metadata and a session-gated dload URL."""
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin
    soup = BeautifulSoup(html or "", "html.parser")
    h1 = soup.select_one("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    if title:
        title = re.sub(r"\s+\d+min\s*$", "", title, flags=re.I)
        title = re.sub(r"\s+\d+p(?:\([^)]+\))?\s*$", "", title, flags=re.I)
        title = re.sub(r"\s+\d+fps\s*$", "", title, flags=re.I).strip()
    dur_s = None
    dur_el = soup.select_one(".vid-length")
    if dur_el:
        dur_s = _dur(dur_el.get_text()) or None
    if not dur_s:
        for node in soup.select('script[type="application/ld+json"]'):
            try:
                data = json.loads(node.string or "")
            except Exception:
                continue
            if isinstance(data, dict) and data.get("duration"):
                dur_s = _dur(data["duration"]) or dur_s
    tags = []
    categories = []
    for a in soup.select('a[href*="/cat/"], a[href*="/tag/"]'):
        name = a.get_text(strip=True)
        if not name:
            continue
        href = (a.get("href") or "").lower()
        if "/cat/" in href:
            if name not in categories:
                categories.append(name)
        elif name not in tags:
            tags.append(name)
    pornstars = []
    info = soup.select_one("#video-info")
    if info:
        for a in info.select('a[href^="/pornstar/"]'):
            name = a.get_text(strip=True)
            if name and name not in pornstars:
                pornstars.append(name)
    thumb = ""
    og = soup.select_one('meta[property="og:image"]')
    if og and og.get("content"):
        thumb = str(og["content"])
    desc = ""
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(node.string or "")
        except Exception:
            continue
        if isinstance(data, dict) and data.get("description"):
            desc = str(data["description"]).strip()
            break
    dload = _eporner_best_dload(html)
    return {
        "title": title,
        "duration_sec": dur_s,
        "tags": tags,
        "categories": categories,
        "pornstars": pornstars,
        "thumbnail": thumb,
        "description": desc,
        "_cdn_url": dload or None,
    }


def search_eporner(query, count, cursor=0, min_duration=600, mode="query"):
    """Search Eporner via HTML listings; enrich each hit with a dload fast-path URL."""
    page = _page_cursor(cursor)
    stubs, seen = [], set()
    try:
        while len(stubs) < count:
            html = _html_get(_eporner_search_url(query, page, mode=mode))
            if not html:
                break
            batch = _eporner_search_items(html)
            if not batch:
                break
            new_urls = 0
            for clean, title, dur_s, thumb in batch:
                if clean in seen:
                    continue
                seen.add(clean)
                new_urls += 1
                if dur_s and dur_s < min_duration:
                    continue
                stubs.append((clean, title, dur_s, thumb))
                if len(stubs) >= count:
                    break
            if new_urls == 0:
                break
            page += 1
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] Eporner search failed: {e!r}", file=sys.stderr, flush=True)
        return [], page, True

    out = []
    for clean, title, dur_s, thumb in stubs[:count]:
        try:
            detail_html = _html_get(clean)
            if not detail_html:
                out.append(_norm(clean, title, dur_s, thumbnail=thumb))
                continue
            meta = _eporner_parse_detail(detail_html, clean)
            out.append(_norm(
                clean,
                meta.get("title") or title,
                meta.get("duration_sec") or dur_s,
                thumbnail=meta.get("thumbnail") or thumb,
                tags=meta.get("tags"),
                categories=meta.get("categories"),
                pornstars=meta.get("pornstars"),
                description=meta.get("description") or "",
                cdn=meta.get("_cdn_url"),
            ))
        except Exception:
            out.append(_norm(clean, title, dur_s, thumbnail=thumb))
    next_page = page
    exhausted = len(stubs) < count
    return out, next_page, exhausted


# ── PornOne ───────────────────────────────────────────────────────────
_PO_BASE = "https://pornone.com"
_PO_VIDEO_RE = re.compile(r"^/[^/]+/[^/]+/\d+/?$", re.I)
_PO_RESERVED = re.compile(
    r"^(?:search|login|signup|pornstars|categories|shorts|tags|upload|help|"
    r"terms|cookie-policy|dmca|about|contact|privacy|for-advertisers)$",
    re.I,
)
_PO_ISO_DUR_RE = re.compile(
    r"P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?",
    re.I,
)


def _po_abs(url_or_path):
    from urllib.parse import urljoin
    if not url_or_path:
        return ""
    if str(url_or_path).startswith("http"):
        return str(url_or_path)
    return urljoin(_PO_BASE, str(url_or_path))


def _po_is_video_path(path):
    path = (path or "").split("?", 1)[0].rstrip("/") or "/"
    if not _PO_VIDEO_RE.match(path + "/"):
        return False
    first = path.strip("/").split("/", 1)[0]
    return not _PO_RESERVED.match(first)


def _po_iso_duration(value):
    if not value:
        return None
    m = _PO_ISO_DUR_RE.search(str(value))
    if not m:
        return None
    days, hours, minutes, seconds = m.groups()
    total = 0
    if days:
        total += int(days) * 86400
    if hours:
        total += int(hours) * 3600
    if minutes:
        total += int(minutes) * 60
    if seconds:
        total += int(float(seconds))
    return total or None


def _po_search_url(query, page, mode="query"):
    from urllib.parse import quote_plus
    if _is_category_mode(mode):
        slug = _category_slug(query)
        if page <= 1:
            return f"{_PO_BASE}/{slug}"
        return f"{_PO_BASE}/{slug}/{page}"
    q = quote_plus(query)
    if page <= 1:
        return f"{_PO_BASE}/search?q={q}"
    return f"{_PO_BASE}/search/{page}?q={q}"


def _po_next_search_page(html, current_page):
    """Follow PornOne's bottom pagination nav (gosearch / Next Page) to the next page."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html or "", "html.parser")
    for nav in soup.select('nav[aria-label="Pagination"]'):
        nxt = nav.select_one('span[title="Next Page"]')
        if not nxt:
            continue
        onclick = nxt.get("onclick") or ""
        m = re.search(r"gosearch\((\d+)\)", onclick)
        if not m:
            continue
        page = int(m.group(1))
        if page > current_page:
            return page
    return None


def _po_clean_name(text):
    return re.sub(r"[,\s]+$", "", str(text or "").strip())


def _po_search_items(html):
    """Extract video cards from a PornOne search listing page."""
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin, urlparse
    soup = BeautifulSoup(html or "", "html.parser")
    out = []
    seen = set()
    for item in soup.select("a.videocard, a.popbop.vidLinkFX.videocard"):
        href = item.get("href") or ""
        if not href or href.startswith("#"):
            continue
        full = urljoin(_PO_BASE, href)
        parsed = urlparse(full)
        if "pornone.com" not in (parsed.netloc or ""):
            continue
        if not _po_is_video_path(parsed.path or ""):
            continue
        clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}/"
        if clean in seen:
            continue
        seen.add(clean)
        title_el = item.select_one(".videotitle")
        title = title_el.get_text(strip=True) if title_el else ""
        if not title:
            title = (item.get("title") or item.get_text(" ", strip=True) or "").strip()
        dur_el = item.select_one(".durlabel")
        dur_s = _dur(dur_el.get_text()) if dur_el else None
        thumb = ""
        img = item.select_one("img.thumbimg, img.imgvideo, img")
        if img:
            for attr in ("src", "data-src"):
                val = img.get(attr)
                if val and str(val).startswith("http"):
                    thumb = str(val)
                    break
        out.append((clean, title, dur_s, thumb))
    return out


def _po_best_mp4(html):
    """Pick the highest-resolution MP4 source from the video player."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html or "", "html.parser")
    best_res, best_url = -1, ""
    for src in soup.select('video source[type="video/mp4"], source[type="video/mp4"]'):
        href = src.get("src") or ""
        if not href or ".mp4" not in href:
            continue
        res = 0
        if src.get("res"):
            try:
                res = int(src["res"])
            except Exception:
                res = 0
        if not res:
            label = src.get("label") or ""
            m = re.search(r"(\d+)p", label, re.I)
            if m:
                res = int(m.group(1))
        if res >= best_res:
            best_res = res
            best_url = href
    return best_url


def _po_parse_detail(html, url):
    """Parse a PornOne video page for metadata and the best MP4 download URL."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html or "", "html.parser")

    title = ""
    h1 = soup.select_one("h1")
    if h1:
        title = h1.get_text(" ", strip=True)
    if not title:
        og = soup.select_one('meta[property="og:title"]')
        if og and og.get("content"):
            title = str(og["content"]).strip()
            title = re.sub(r"\s*[—-]\s*PornOne.*$", "", title, flags=re.I).strip()

    description = ""
    desc_el = soup.select_one("#prepdesc")
    if desc_el:
        description = desc_el.get_text(" ", strip=True)
    if not description:
        meta_desc = soup.select_one('meta[name="description"]')
        if meta_desc and meta_desc.get("content"):
            description = str(meta_desc["content"]).strip()

    categories = []
    for a in soup.select("a[id^='cat']"):
        name = _po_clean_name(a.get_text(" ", strip=True))
        if name and name not in categories:
            categories.append(name)

    tags = []
    for a in soup.select("a[id^='tag']"):
        name = _po_clean_name(a.get_text(" ", strip=True))
        if name and name not in tags:
            tags.append(name)

    pornstars = []
    for a in soup.select("a[id^='star']"):
        name = _po_clean_name(a.get_text(" ", strip=True))
        if name and name not in pornstars:
            pornstars.append(name)

    dur_s = None
    m = re.search(r"videoLength\s*=\s*(\d+)", html or "")
    if m:
        dur_s = int(m.group(1))
    if not dur_s:
        for node in soup.select('script[type="application/ld+json"]'):
            try:
                data = json.loads(node.string or "")
            except Exception:
                continue
            if isinstance(data, dict) and data.get("@type") == "VideoObject":
                dur_s = _po_iso_duration(data.get("duration")) or dur_s
                break

    thumb = ""
    og = soup.select_one('meta[property="og:image"]')
    if og and og.get("content"):
        thumb = _po_abs(og["content"])
    if not thumb:
        for node in soup.select('script[type="application/ld+json"]'):
            try:
                data = json.loads(node.string or "")
            except Exception:
                continue
            if isinstance(data, dict) and data.get("@type") == "VideoObject":
                thumbs = data.get("thumbnailUrl") or []
                if isinstance(thumbs, list) and thumbs:
                    thumb = _po_abs(thumbs[0])
                elif isinstance(thumbs, str):
                    thumb = _po_abs(thumbs)
                break

    return {
        "title": title,
        "duration_sec": dur_s,
        "tags": tags,
        "categories": categories,
        "pornstars": pornstars,
        "thumbnail": thumb,
        "description": description,
        "_cdn_url": _po_best_mp4(html) or None,
    }


def search_pornone(query, count, cursor=0, min_duration=600, mode="query"):
    """Search PornOne via HTML listings; enrich each hit with detail-page metadata."""
    page = _page_cursor(cursor)
    stubs, seen = [], set()
    has_next_page = True
    try:
        while len(stubs) < count and has_next_page:
            html = _html_get(_po_search_url(query, page, mode=mode))
            if not html:
                has_next_page = False
                break
            batch = _po_search_items(html)
            if not batch:
                has_next_page = False
                break
            new_urls = 0
            for clean, title, dur_s, thumb in batch:
                if clean in seen:
                    continue
                seen.add(clean)
                new_urls += 1
                if dur_s and dur_s < min_duration:
                    continue
                stubs.append((clean, title, dur_s, thumb))
                if len(stubs) >= count:
                    break
            if new_urls == 0:
                has_next_page = False
                break
            next_page = _po_next_search_page(html, page)
            if not next_page:
                has_next_page = False
                break
            page = next_page
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] PornOne search failed: {e!r}", file=sys.stderr, flush=True)
        return [], page, True

    out = []
    for clean, title, dur_s, thumb in stubs[:count]:
        try:
            detail_html = _html_get(clean)
            if not detail_html:
                out.append(_norm(clean, title, dur_s, thumbnail=thumb))
                continue
            meta = _po_parse_detail(detail_html, clean)
            out.append(_norm(
                clean,
                meta.get("title") or title,
                meta.get("duration_sec") or dur_s,
                thumbnail=meta.get("thumbnail") or thumb,
                tags=meta.get("tags"),
                categories=meta.get("categories"),
                pornstars=meta.get("pornstars"),
                description=meta.get("description") or "",
                cdn=meta.get("_cdn_url"),
            ))
        except Exception:
            out.append(_norm(clean, title, dur_s, thumbnail=thumb))
    next_page = page
    exhausted = len(stubs) < count or not has_next_page
    return out, next_page, exhausted


# ── ABXXX ─────────────────────────────────────────────────────────────
_AX_BASE = "https://abxxx.com"
_AX_VIDEO_RE = re.compile(r"/video/(\d+)/([^/?#]+)", re.I)
_AX_BASE164_CHARS = (
    "АВСDЕFGHIJKLМNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,~"
)
_AX_API_LIFETIME = 86400
_AX_SEARCH_BATCH = 60


def _ax_abs(path):
    from urllib.parse import urljoin
    if not path:
        return ""
    if str(path).startswith("http"):
        return str(path)
    return urljoin(_AX_BASE, str(path))


def _ax_video_page_url(video_id, slug):
    slug = (slug or "video").strip("/") or "video"
    return f"{_AX_BASE}/video/{video_id}/{slug}/"


def _ax_video_api_prefix(video_id):
    vid = int(video_id)
    return f"{vid // 1_000_000}/{vid // 1_000}"


def _ax_base164_decode(value):
    """Decode ABXXX's obfuscated CDN paths (custom base64 alphabet)."""
    from urllib.parse import unquote

    s = re.sub(r"[^АВСЕМA-Za-z0-9\.,~]", "", str(value or ""))
    out = []
    n = 0
    while n < len(s):
        o = _AX_BASE164_CHARS.index(s[n])
        n += 1
        r = _AX_BASE164_CHARS.index(s[n])
        n += 1
        a = _AX_BASE164_CHARS.index(s[n])
        n += 1
        c = _AX_BASE164_CHARS.index(s[n])
        n += 1
        o = (o << 2) | (r >> 4)
        r = ((r & 15) << 4) | (a >> 2)
        i = ((a & 3) << 6) | c
        out.append(chr(o))
        if a != 64:
            out.append(chr(r))
        if c != 64:
            out.append(chr(i))
    return unquote("".join(out))


def _ax_api_json(path):
    """Fetch a JSON API endpoint; returns a dict/list or None."""
    url = path if str(path).startswith("http") else _ax_abs(path)
    text = _html_get(url)
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _ax_unescape(text):
    if not text:
        return ""
    import html as _html
    return _html.unescape(str(text).strip())


def _ax_csv_names(value):
    out = []
    for part in re.split(r"[,;|]", str(value or "")):
        name = _ax_unescape(part.strip())
        if name and name not in out:
            out.append(name)
    return out


def _ax_models_from_data(value):
    out = []
    for chunk in str(value or "").split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        parts = chunk.split("|")
        if len(parts) >= 3:
            name = _ax_unescape(parts[2].strip())
            if name and name not in out:
                out.append(name)
    return out


def _ax_titled_dict(value):
    out = []
    if isinstance(value, dict):
        for item in value.values():
            if not isinstance(item, dict):
                continue
            name = _ax_unescape(item.get("title") or "")
            if name and name not in out:
                out.append(name)
    return out


def _ax_models_suggested(value):
    out = []
    if isinstance(value, dict):
        for name in value.values():
            name = _ax_unescape(str(name or "").strip())
            if name and name not in out:
                out.append(name)
    elif isinstance(value, list):
        for name in value:
            name = _ax_unescape(str(name or "").strip())
            if name and name not in out:
                out.append(name)
    return out


def _ax_search_url(query, page, mode="query"):
    from urllib.parse import quote_plus
    # ABXXX's public API is search-only; category mode searches the category name.
    q = quote_plus(query or "")
    _ = mode  # reserved for a future category-filter path
    return (
        f"{_AX_BASE}/api/videos2.php?params="
        f"{_AX_API_LIFETIME}/str/relevance/{_AX_SEARCH_BATCH}/search..{page}.all..&s={q}"
    )


def _ax_best_mp4(video_id):
    data = _ax_api_json(
        f"/api/videofile.php?video_id={video_id}&lifetime={_AX_API_LIFETIME}"
    )
    if not isinstance(data, list):
        return None
    best = None
    for item in data:
        if not isinstance(item, dict):
            continue
        if item.get("format") != ".mp4":
            continue
        encoded = item.get("video_url") or ""
        if not encoded:
            continue
        decoded = _ax_base164_decode(encoded)
        if decoded:
            best = _ax_abs(decoded)
    return best


def _ax_parse_detail_by_id(video_id, stub=None):
    """Load full metadata for one ABXXX video via the JSON detail API."""
    stub = stub or {}
    prefix = _ax_video_api_prefix(video_id)
    payload = _ax_api_json(
        f"/api/json/video/{_AX_API_LIFETIME}/{prefix}/{video_id}.json"
    )
    video = {}
    if isinstance(payload, dict):
        video = payload.get("video") or {}

    slug = video.get("dir") or stub.get("dir") or "video"
    url = _ax_video_page_url(video_id, slug)

    categories = _ax_titled_dict(video.get("categories"))
    if not categories:
        categories = _ax_csv_names(stub.get("categories"))

    tags = _ax_titled_dict(video.get("tags"))
    if not tags:
        tags = _ax_csv_names(stub.get("tags"))

    pornstars = _ax_models_suggested(video.get("models_suggested"))
    if not pornstars:
        pornstars = _ax_csv_names(stub.get("models"))
    if not pornstars:
        pornstars = _ax_models_from_data(stub.get("models_data"))

    description = _ax_unescape(video.get("description") or stub.get("description") or "")

    duration = video.get("duration") or stub.get("duration") or ""
    dur_s = _dur(duration)

    thumb = (
        video.get("thumb")
        or video.get("thumbsrc")
        or stub.get("scr")
        or stub.get("thumbnail")
        or ""
    )

    return {
        "url": url,
        "title": _ax_unescape(video.get("title") or stub.get("title") or "Unknown"),
        "duration_sec": dur_s or None,
        "tags": tags,
        "categories": categories,
        "pornstars": pornstars,
        "thumbnail": str(thumb or ""),
        "description": description,
        "_cdn_url": _ax_best_mp4(video_id),
    }


def _ax_parse_detail(html, url):
    """Resolve one ABXXX page URL into metadata + CDN fast path."""
    m = _AX_VIDEO_RE.search(str(url or ""))
    if not m:
        return {}
    return _ax_parse_detail_by_id(m.group(1))


def _ax_search_items(query, page, mode="query"):
    """Return (videos, total_pages) from ABXXX search API."""
    payload = _ax_api_json(_ax_search_url(query, page, mode=mode))
    if not isinstance(payload, dict):
        return [], 0
    videos = payload.get("videos") or []
    pages = int(payload.get("pages") or 0)
    return videos, pages


def search_abxxx(query, count, cursor=0, min_duration=600, mode="query"):
    """Search ABXXX via JSON API; enrich each hit with detail metadata."""
    page = _page_cursor(cursor)
    stubs, seen = [], set()
    total_pages = None
    try:
        while len(stubs) < count:
            batch, pages = _ax_search_items(query, page, mode=mode)
            if total_pages is None:
                total_pages = pages
            if not batch:
                break
            new_urls = 0
            for item in batch:
                vid = str(item.get("video_id") or "").strip()
                if not vid:
                    continue
                slug = item.get("dir") or "video"
                clean = _ax_video_page_url(vid, slug)
                if clean in seen:
                    continue
                seen.add(clean)
                new_urls += 1
                dur_s = _dur(item.get("duration"))
                if dur_s and dur_s < min_duration:
                    continue
                stubs.append((vid, item, dur_s, item.get("scr") or ""))
                if len(stubs) >= count:
                    break
            if new_urls == 0:
                break
            if total_pages and page >= total_pages:
                break
            page += 1
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] ABXXX search failed: {e!r}", file=sys.stderr, flush=True)
        return [], page, True

    out = []
    for vid, stub, dur_s, thumb in stubs[:count]:
        try:
            meta = _ax_parse_detail_by_id(vid, stub)
            out.append(_norm(
                meta.get("url") or _ax_video_page_url(vid, stub.get("dir") or "video"),
                meta.get("title") or stub.get("title") or "Unknown",
                meta.get("duration_sec") or dur_s,
                thumbnail=meta.get("thumbnail") or thumb,
                tags=meta.get("tags"),
                categories=meta.get("categories"),
                pornstars=meta.get("pornstars"),
                description=meta.get("description") or "",
                cdn=meta.get("_cdn_url"),
            ))
        except Exception:
            out.append(_norm(
                _ax_video_page_url(vid, stub.get("dir") or "video"),
                stub.get("title") or "Unknown",
                dur_s,
                thumbnail=thumb,
            ))

    exhausted = (
        len(stubs) < count
        or (total_pages is not None and page >= total_pages)
    )
    return out, page, exhausted


# ── YouPorn ───────────────────────────────────────────────────────────
def search_youporn(query, count, cursor=0, min_duration=600, mode="query"):
    if _is_category_mode(mode):
        return _html_youporn(query, count, cursor, min_duration, mode=mode)

    offset = _offset_cursor(cursor)

    async def run(need):
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

        async def collect_fn(pages):
            agen = client.search_videos(query, pages=pages, filter_relevance="duration",
                                        filter_duration_minimum=md)
            items, _ = await _collect(agen, extract, need, min_duration)
            return items

        return await _fetch_until(collect_fn, need, 15)

    batch, next_cursor, exhausted = asyncio.run(_run_paginated("YouPorn", run, offset, count))
    if batch:
        return batch, next_cursor, exhausted
    return _html_youporn(query, count, cursor, min_duration, mode=mode)


def _hqporner_category(query):
    """Resolve free text to an hqporner_api Category enum member, or None."""
    try:
        from hqporner_api.modules.locals import Category
    except Exception:
        return None
    slug = _category_slug(query)
    key = slug.replace("-", "_").upper()
    if hasattr(Category, key):
        return getattr(Category, key)
    # Match enum values like "anal-sex-hd" / "milf"
    want = slug.replace("_", "-")
    for name in dir(Category):
        if name.startswith("_"):
            continue
        val = getattr(Category, name)
        raw = str(getattr(val, "value", val)).lower().replace("_", "-")
        if raw == want or raw.replace("-", "") == want.replace("-", ""):
            return val
    return None


# ── HQPorner ──────────────────────────────────────────────────────────
def search_hqporner(query, count, cursor=0, min_duration=600, mode="query"):
    offset = _offset_cursor(cursor)
    category = _hqporner_category(query) if _is_category_mode(mode) else None

    async def run(need):
        import hqporner_api
        client = hqporner_api.Client()

        async def extract(v):
            dur_s = _dur(_sget(v, "length", ""))
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

        async def collect_fn(pages):
            if category is not None:
                agen = client.get_videos_by_category(category, pages=pages)
            else:
                agen = client.search_videos(query, pages=pages)
            items, _ = await _collect(agen, extract, need, min_duration)
            return items

        return await _fetch_until(collect_fn, need, 15)

    batch, next_cursor, exhausted = asyncio.run(_run_paginated("HQPorner", run, offset, count))
    if batch or not _is_category_mode(mode):
        return batch, next_cursor, exhausted
    # Unknown category enum → keyword search fallback.
    return search_hqporner(query, count, cursor, min_duration, mode="query")


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
    # No library and no yt-dlp search extractor exist for these two, so discover
    # via HTML search; the worker downloads each URL with yt-dlp.
    "RedTube": _html_redtube,
    "SpankBang": _html_spankbang,
    "ParadiseHill": search_paradisehill,
    "PornOne": search_pornone,
    "ABXXX": search_abxxx,
}
