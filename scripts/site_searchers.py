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
    "_part_urls": list[str] | None, # ParadiseHill multi-part MP4 fast path
  }

Site names match src/lib/source-sites.ts.

Each searcher returns a pagination tuple:
  (results, next_cursor, exhausted)
where `next_cursor` is passed back on the next batch (page number for HTML /
Eporner / ParadiseHill; result offset for API libraries), and `exhausted` is True
when the source has no more result pages.

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
import json
import os
import re
import sys

_XH_BASE = "https://xhamster.com"
# Age-verification interstitials are ~50 KB; real search pages are 300 KB+.
_XH_MIN_SEARCH_BYTES = 100_000


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
    apply the duration/url/dedup filters, and stop once `need` items are gathered.

    Returns (items, saw_any) where saw_any is True if the generator yielded at
    least one video object (even if all were filtered out).
    """
    out = []
    saw_any = False
    async for v in agen:
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


def _page_cursor(cursor):
    """HTML searchers use 1-based page cursors; 0 means page 1."""
    return max(1, int(cursor or 0))


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
        r = _cr.get(url, impersonate="chrome", timeout=30, proxies=proxies)
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


def _html_redtube(query, count, cursor=0, min_duration=600):
    return _html_search(
        "RedTube", query, count, min_duration, cursor=cursor,
        domain="redtube.com", base="https://www.redtube.com",
        page_url=lambda q, n: f"https://www.redtube.com/?search={q}&page={n}",
        link_re=re.compile(r"^/\d{4,}$"),
    )


def _html_spankbang(query, count, cursor=0, min_duration=600):
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


def _html_xhamster(query, count, cursor=0, min_duration=600):
    """Search xHamster via embedded JSON + HTML links.

    Skips the broken xhamster-api search_videos() (wrong HTML extractor in 2.2).
    Detects the US age-verification interstitial and logs a clear hint to use VPN.
    """
    from urllib.parse import quote_plus
    md = _xhamster_min_duration_param(min_duration)
    q = quote_plus(query)
    out, seen = [], set()
    age_gate = False
    page = _page_cursor(cursor)
    try:
        while len(out) < count:
            url = f"{_XH_BASE}/search/{q}?sort=longest&min-duration={md}&page={page}"
            html = _html_get(url)
            if not html:
                return out, page, page == _page_cursor(cursor)
            if _is_xhamster_age_gate(html):
                age_gate = True
                if page == _page_cursor(cursor):
                    print(
                        "[site_searchers] XHamster: age-verification wall (US datacenter IP). "
                        "Run the worker through NordVPN — see docker-compose.vpn.yml",
                        file=sys.stderr, flush=True,
                    )
                return out, page, True
            new_urls = _xhamster_new_urls_on_page(html, seen)
            batch = _xhamster_videos_from_html(html, count - len(out), min_duration, seen)
            if batch:
                out.extend(batch)
            if new_urls == 0:
                return out, page, True
            page += 1
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] XHamster html failed: {e!r}", file=sys.stderr, flush=True)
    if age_gate and not out:
        return [], page, True
    return out, page, len(out) < count


def _html_youporn(query, count, cursor=0, min_duration=600):
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
        "tags": tags,
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


def search_paradisehill(query, count, cursor=0, min_duration=600):
    """Search ParadiseHill and enrich each hit with detail-page metadata + MP4 parts."""
    from urllib.parse import quote_plus
    offset = _offset_cursor(cursor)
    need = offset + count
    q = quote_plus(query)
    all_stubs, seen = [], set()
    page = 1
    try:
        while len(all_stubs) < need:
            page_url = (
                f"{_PH_BASE}/search/?pattern={q}&what=1"
                if page == 1 else f"{_PH_BASE}/search/?pattern={q}&what=1&page={page}"
            )
            html = _html_get(page_url)
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
                out.append(_norm(clean, title, None, thumbnail=thumb, tags=tags))
                continue
            meta = _ph_parse_detail(detail_html, clean)
            item = _norm(
                clean,
                meta.get("title") or title,
                None,
                thumbnail=meta.get("thumbnail") or thumb,
                tags=meta.get("tags") or tags,
                pornstars=meta.get("pornstars"),
                description=meta.get("description") or "",
                cdn=meta.get("_cdn_url"),
            )
            parts = meta.get("_part_urls")
            if parts and len(parts) > 1:
                item["_part_urls"] = parts
            out.append(item)
        except Exception:
            out.append(_norm(clean, title, None, thumbnail=thumb, tags=tags))
    next_cursor = offset + len(stubs)
    exhausted = len(all_stubs) < need
    return out, next_cursor, exhausted


# ── XNXX ──────────────────────────────────────────────────────────────
def search_xnxx(query, count, cursor=0, min_duration=600):
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
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                thumbnail=thumb,
                tags=list(_sget(v, "tags", []) or []),
                pornstars=list(_sget(v, "pornstars", []) or []),
                description=str(_sget(v, "description", "") or ""),
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
def search_pornhub(query, count, cursor=0, min_duration=600):
    offset = _offset_cursor(cursor)

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
            items, _ = await _collect(
                client.search_videos(query, pages=pages), extract, need, min_duration,
            )
            return items

        return await _fetch_until(collect_fn, need, 12)

    return asyncio.run(_run_paginated("PornHub", run, offset, count))


# ── XHamster ──────────────────────────────────────────────────────────
def search_xhamster(query, count, cursor=0, min_duration=600):
    return _html_xhamster(query, count, cursor, min_duration)


# ── XVideos ───────────────────────────────────────────────────────────
def search_xvideos(query, count, cursor=0, min_duration=600):
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


# ── Eporner ───────────────────────────────────────────────────────────
def search_eporner(query, count, cursor=0, min_duration=600):
    async def run():
        import eporner_api
        from eporner_api import Gay, Order, LowQuality
        client = eporner_api.Client()
        per_page = min(max(count, 20), 60)

        async def extract(v):
            dur_s = _dur(_sget(v, "length", 0))
            tags = [t for t in (list(_sget(v, "tags", []) or [])) if t]
            return _norm(
                _sget(v, "url", ""), _sget(v, "title", ""), dur_s or None,
                tags=tags,
            )

        out, page = [], _page_cursor(cursor)
        while len(out) < count:
            agen = client.search_videos(
                query=query, sorting_gay=Gay.exclude_gay_content,
                sorting_order=Order.longest,
                sorting_low_quality=LowQuality.exclude_low_quality_content,
                page=page, per_page=per_page,
            )
            batch, saw_any = await _collect(agen, extract, count - len(out), min_duration)
            if not saw_any:
                return out, page, True
            if batch:
                out.extend(batch)
            page += 1
        return out, page, len(out) < count

    try:
        return asyncio.run(run())
    except Exception as e:  # noqa: BLE001
        print(f"[site_searchers] Eporner failed: {e!r}", file=sys.stderr, flush=True)
        return [], _page_cursor(cursor), True


# ── YouPorn ───────────────────────────────────────────────────────────
def search_youporn(query, count, cursor=0, min_duration=600):
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
    return _html_youporn(query, count, cursor, min_duration)


# ── HQPorner ──────────────────────────────────────────────────────────
def search_hqporner(query, count, cursor=0, min_duration=600):
    offset = _offset_cursor(cursor)

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
            items, _ = await _collect(client.search_videos(query, pages=pages), extract, need, min_duration)
            return items

        return await _fetch_until(collect_fn, need, 15)

    return asyncio.run(_run_paginated("HQPorner", run, offset, count))


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
}
