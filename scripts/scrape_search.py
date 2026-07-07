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
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "worker"))

import db  # noqa: E402
from site_searchers import SEARCHERS  # noqa: E402

PREVIEW_BATCH = int(os.environ.get("SCRAPE_PAGE_BATCH", "50"))


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
