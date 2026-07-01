#!/usr/bin/env python3
"""
Backfill the canonical `dedupeKey` for existing videos so the scraper's dedup
also catches videos scraped before this column existed — including soft-deleted
ones (we intentionally do not filter on isDeleted).

Run inside the worker container (it has DATABASE_URL + psycopg + the db module):
    docker compose exec worker python scripts/backfill-dedupe-keys.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))

import db  # noqa: E402


def main():
    conn = db.connect()
    updated = 0
    with conn.cursor() as cur:
        cur.execute('SELECT id, "sourceUrl" FROM "Video" WHERE "dedupeKey" IS NULL')
        rows = cur.fetchall()

    print(f"scanning {len(rows)} videos with no dedupeKey")
    for vid, source_url in rows:
        key = db.canonical_key(source_url or "")
        if not key:
            continue
        with conn.cursor() as cur:
            cur.execute('UPDATE "Video" SET "dedupeKey" = %s WHERE id = %s', (key, vid))
        updated += 1

    print(f"done: set dedupeKey on {updated} videos")


if __name__ == "__main__":
    main()
