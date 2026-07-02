#!/usr/bin/env python3
"""Unit tests for site_searchers pagination (no network required)."""

import asyncio
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, __dirname__ if (__dirname__ := __import__("os").path.dirname(__file__)) else ".")
import site_searchers as ss  # noqa: E402


class PaginatedCollectTests(unittest.IsolatedAsyncioTestCase):
    async def test_collect_reports_saw_any_when_all_filtered(self):
        async def agen():
            yield {"url": "http://x/1", "duration_sec": 60}

        async def extract(v):
            return ss._norm(v["url"], "t", v["duration_sec"])

        items, saw_any = await ss._collect(agen(), extract, 10, min_duration=600)
        self.assertFalse(items)
        self.assertTrue(saw_any)

    async def test_run_paginated_exhausted_when_source_short(self):
        async def run(need):
            return [{"url": f"http://x/{i}"} for i in range(3)]

        batch, next_cursor, exhausted = await ss._run_paginated("Test", run, offset=0, count=5)
        self.assertEqual(len(batch), 3)
        self.assertEqual(next_cursor, 3)
        self.assertTrue(exhausted)

        batch2, next_cursor2, exhausted2 = await ss._run_paginated("Test", run, offset=3, count=5)
        self.assertEqual(batch2, [])
        self.assertEqual(next_cursor2, 3)
        self.assertTrue(exhausted2)


class HtmlSearchPaginationTests(unittest.TestCase):
    def _fake_pages(self):
        return {
            1: """
            <html><body>
              <a href="/1111">A</a><span>12:00</span>
              <a href="/2222">B</a><span>15:00</span>
            </body></html>
            """,
            2: """
            <html><body>
              <a href="/3333">C</a><span>20:00</span>
            </body></html>
            """,
            3: "<html><body><p>no videos</p></body></html>",
            4: """
            <html><body>
              <a href="/1111">A again</a><span>12:00</span>
            </body></html>
            """,
        }

    def test_walks_pages_until_count_or_exhausted(self):
        pages = self._fake_pages()

        def fake_get(url):
            for n, html in pages.items():
                if f"page={n}" in url or (n == 1 and "page=" not in url):
                    return html
            return pages.get(3, "")

        with patch.object(ss, "_html_get", side_effect=fake_get):
            batch1, cursor1, ex1 = ss._html_search(
                "Test", "q", 2, 600, cursor=0,
                domain="redtube.com", base="https://www.redtube.com",
                page_url=lambda q, n: f"https://www.redtube.com/?search={q}&page={n}",
                link_re=ss.re.compile(r"^/\d{4,}$"),
            )
            self.assertEqual(len(batch1), 2)
            self.assertFalse(ex1)

            batch2, cursor2, ex2 = ss._html_search(
                "Test", "q", 5, 600, cursor=cursor1,
                domain="redtube.com", base="https://www.redtube.com",
                page_url=lambda q, n: f"https://www.redtube.com/?search={q}&page={n}",
                link_re=ss.re.compile(r"^/\d{4,}$"),
            )
            self.assertEqual(len(batch2), 1)
            self.assertTrue(ex2)

    def test_stops_on_repeated_page_without_new_urls(self):
        pages = {1: self._fake_pages()[1], 2: self._fake_pages()[4]}

        def fake_get(url):
            if "page=2" in url:
                return pages[2]
            return pages[1]

        with patch.object(ss, "_html_get", side_effect=fake_get):
            batch, cursor, exhausted = ss._html_search(
                "Test", "q", 10, 600, cursor=1,
                domain="redtube.com", base="https://www.redtube.com",
                page_url=lambda q, n: f"https://www.redtube.com/?search={q}&page={n}",
                link_re=ss.re.compile(r"^/\d{4,}$"),
            )
            self.assertEqual(len(batch), 2)
            self.assertTrue(exhausted)


class WorkerLoopSimulation(unittest.TestCase):
    def test_download_all_continues_past_partial_batch(self):
        """Simulate worker batches until searcher reports exhausted."""

        class FakeSearcher:
            def __init__(self):
                self.cursor = 0
                self.pages = [
                    [{"url": f"http://x/{i}"} for i in range(50)],
                    [{"url": f"http://x/{i}"} for i in range(50, 80)],
                    [],
                ]
                self.calls = 0

            def __call__(self, query, count, cursor, min_dur):
                self.calls += 1
                if self.calls > len(self.pages):
                    return [], cursor, True
                batch = self.pages[self.calls - 1]
                if not batch:
                    return [], cursor, True
                exhausted = len(batch) < count
                return batch, cursor + len(batch), exhausted

        searcher = FakeSearcher()
        download_all = True
        cursor = 0
        collected = 0
        total = 0
        batch_n = 50

        while True:
            results, cursor, exhausted = searcher("q", batch_n, cursor, 600)
            if not results:
                break
            total += len(results)
            collected += len(results)
            if exhausted:
                break

        self.assertEqual(total, 80)
        self.assertEqual(searcher.calls, 2)


def live_paradisehill_smoke():
    """Optional network smoke test: paginate ParadiseHill search listing."""
    cursor = 0
    total = 0
    pages = 0
    while pages < 15:
        batch, cursor, exhausted = ss.search_paradisehill("anal", 20, cursor, min_duration=0)
        pages += 1
        if not batch:
            print(f"live PH: stop at page visit {pages}, total={total}, exhausted={exhausted}")
            break
        total += len(batch)
        print(f"live PH: batch={len(batch)} cursor={cursor} exhausted={exhausted} total={total}")
        if exhausted:
            break
    return total


if __name__ == "__main__":
    if "--live-paradisehill" in sys.argv:
        n = live_paradisehill_smoke()
        print(f"live PH total unique listing hits collected: {n}")
        sys.exit(0 if n > 0 else 1)
    unittest.main()
