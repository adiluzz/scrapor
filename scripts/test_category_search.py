#!/usr/bin/env python3
"""Live smoke test: every SEARCHER in category mode returns results.

Usage:
  python3 scripts/test_category_search.py
  python3 scripts/test_category_search.py --category anal --count 2
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(__file__))
from site_searchers import SEARCHERS  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", default="milf")
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--min-duration", type=int, default=0)
    ap.add_argument("--sources", nargs="*", default=None)
    args = ap.parse_args()

    sources = args.sources or list(SEARCHERS)
    print(f"category={args.category!r} count={args.count} sources={len(sources)}")
    print("-" * 72)

    failed = []
    empty = []
    ok = []

    for name in sources:
        fn = SEARCHERS.get(name)
        if not fn:
            failed.append((name, "missing searcher"))
            print(f"{name:12} FAIL missing searcher")
            continue
        t0 = time.time()
        try:
            batch, cursor, exhausted = fn(
                args.category,
                args.count,
                0,
                args.min_duration,
                "category",
            )
            elapsed = time.time() - t0
            n = len(batch or [])
            urls = [((v.get("url") or "")[:70]) for v in (batch or [])[:2]]
            status = "OK" if n > 0 else "EMPTY"
            print(
                f"{name:12} {status:5} n={n} cursor={cursor!r} exhausted={exhausted} "
                f"{elapsed:.1f}s"
            )
            for u in urls:
                print(f"             {u}")
            if n > 0:
                ok.append(name)
            else:
                empty.append(name)
        except Exception as e:  # noqa: BLE001
            elapsed = time.time() - t0
            failed.append((name, f"{type(e).__name__}: {e}"))
            print(f"{name:12} FAIL  {elapsed:.1f}s {type(e).__name__}: {e}")
            traceback.print_exc()

    print("-" * 72)
    print(f"ok={len(ok)} empty={len(empty)} failed={len(failed)}")
    if empty:
        print("empty:", ", ".join(empty))
    if failed:
        print("failed:")
        for name, reason in failed:
            print(f"  {name}: {reason}")

    # Soft-pass: empty may be geo/age-gate; hard-fail only on exceptions.
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
