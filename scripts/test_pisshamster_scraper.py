#!/usr/bin/env python3
"""Unit tests for the PissHamster scraper (no network)."""

import os
import sys
import unittest
from unittest.mock import patch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "worker"))

import site_searchers as ss  # noqa: E402
import scrape_search  # noqa: E402
from seo_text import clean_description  # noqa: E402

try:
    import db  # noqa: E402
except Exception:  # pragma: no cover - psycopg missing outside the worker image
    db = None


CATEGORIES_HTML = """
<a href="https://pisshamster.com/categories/">Categories</a>
<a href="https://pisshamster.com/tag/535-outdoor/">outdoor tag</a>
<a href="https://de.pisshamster.com/3-outdoor/" title="Outdoor">Outdoor</a>
<a href="https://pisshamster.com/3-outdoor/36087-beach/">Beach</a>
"""

LISTING_PAGE_1 = """
<div class="video-block">
  <a class="thumb" href="https://de.pisshamster.com/97436-example-clip/?utm_source=ad">
    <img class="video-img" src="https://pisshamster.com/storage/97436.jpg">
  </a>
  <span class="title">Example Clip</span>
  <span class="duration">11 min</span>
</div>
<div class="video-block">
  <a class="thumb" href="https://pisshamster.com/111-too-short/">
    <img class="video-img" src="https://pisshamster.com/storage/111.jpg">
  </a>
  <span class="title">Too Short</span>
  <span class="duration">2 min</span>
</div>
<a class="next page-link" href="https://pisshamster.com/page/2/?s=outdoor&amp;filter=longest">»</a>
"""

LISTING_PAGE_2 = """
<div class="video-block">
  <a class="thumb" href="https://pisshamster.com/333-later-clip/">
    <img class="video-img" src="https://pisshamster.com/storage/333.jpg">
  </a>
  <span class="title">Later Clip</span>
  <span class="duration">12 min</span>
</div>
"""


def _detail(vid, slug, title):
    return f"""
<link rel="canonical" href="https://pisshamster.com/{vid}-{slug}/">
<h1>{title} - Pisshamster.com</h1>
<article>
  <video>
    <source title="low" type="video/mp4" src="https://xcdn1.nosofiles.com/a/{vid}_low.mp4?verify=1-low">
    <source title="high" type="video/mp4" src="https://xcdn1.nosofiles.com/a/{vid}_high.mp4?verify=1-high">
  </video>
  <a class="label-cat-video" href="https://pisshamster.com/3-outdoor/" title="Outdoor">Outdoor</a>
  <a class="label-tag-video" href="https://pisshamster.com/tag/535-outdoor/" title="outdoor">outdoor</a>
  <a class="label-act-video" href="https://pisshamster.com/actor/16344-katty-west/" title="Katty West">
    Katty West <span class="act-count">117</span>
  </a>
</article>
<script type="application/ld+json">
{{"@context":"https://schema.org","@graph":[
  {{"@type":"VideoObject","name":"{title}",
    "description":"Scene notes for {title} at pisshamster.com.",
    "duration":"P0DT0H11M21S",
    "uploadDate":"2023-02-14T17:20:22+00:00",
    "thumbnailUrl":["https://pisshamster.com/storage/{vid}.jpg"],
    "contentUrl":"https://xcdn1.nosofiles.com/a/{vid}_high.mp4"}}
]}}
</script>
"""


class PissHamsterParseTests(unittest.TestCase):
    def test_parse_detail_keeps_signed_high_mp4(self):
        meta = ss._psh_parse_detail(
            _detail(97436, "example-clip", "Example Clip"),
            "https://de.pisshamster.com/97436-example-clip/?utm_source=ad",
        )
        self.assertEqual(meta["url"], "https://pisshamster.com/97436-example-clip/")
        self.assertEqual(meta["title"], "Example Clip")
        self.assertEqual(meta["duration_sec"], 11 * 60 + 21)
        self.assertEqual(meta["categories"], ["Outdoor"])
        self.assertEqual(meta["tags"], ["outdoor"])
        self.assertEqual(meta["pornstars"], ["Katty West"])
        self.assertEqual(meta["upload_date"], "2023-02-14T17:20:22+00:00")
        self.assertEqual(
            meta["_cdn_url"],
            "https://xcdn1.nosofiles.com/a/97436_high.mp4?verify=1-high",
        )
        self.assertNotIn("_low.mp4", meta["_cdn_url"])

    def test_category_lookup_skips_tag_and_language_host(self):
        with patch.object(ss, "_html_get", return_value=CATEGORIES_HTML):
            self.assertEqual(
                ss._psh_category_base("Outdoor"),
                "https://pisshamster.com/3-outdoor/",
            )
            self.assertEqual(
                ss._psh_category_base("beach"),
                "https://pisshamster.com/3-outdoor/36087-beach/",
            )
            self.assertIsNone(ss._psh_category_base("not-a-category"))

    def test_listing_urls(self):
        self.assertEqual(
            ss._psh_listing_url("big tits", 1, 600),
            "https://pisshamster.com/?s=big+tits&filter=longest",
        )
        self.assertEqual(
            ss._psh_listing_url("outdoor", 2, 0),
            "https://pisshamster.com/page/2/?s=outdoor",
        )
        self.assertEqual(
            ss._psh_listing_url("outdoor", 2, 600, "https://pisshamster.com/3-outdoor/"),
            "https://pisshamster.com/3-outdoor/page/2/?filter=longest",
        )


class PissHamsterSearchTests(unittest.TestCase):
    def _fake_get(self, url):
        if "/categories/" in url and "/3-outdoor/" not in url:
            return CATEGORIES_HTML
        if "/97436-" in url:
            return _detail(97436, "example-clip", "Example Clip")
        if "/333-" in url:
            return _detail(333, "later-clip", "Later Clip")
        if "/page/2/" in url:
            return LISTING_PAGE_2
        return LISTING_PAGE_1

    def test_search_filters_duration_and_resumes_mid_page(self):
        with patch.object(ss, "_html_get", side_effect=self._fake_get):
            batch, cursor, exhausted = ss.search_pisshamster(
                "outdoor", 1, 0, min_duration=600
            )
        self.assertEqual(len(batch), 1)
        self.assertEqual(batch[0]["url"], "https://pisshamster.com/97436-example-clip/")
        self.assertEqual(batch[0]["tags"], ["outdoor"])
        self.assertEqual(batch[0]["categories"], ["Outdoor"])
        self.assertEqual(batch[0]["pornstars"], ["Katty West"])
        self.assertEqual(batch[0]["upload_date"], "2023-02-14T17:20:22+00:00")
        self.assertIn("verify=1-high", batch[0]["_cdn_url"])
        self.assertEqual(cursor, 10_001)
        self.assertFalse(exhausted)

        with patch.object(ss, "_html_get", side_effect=self._fake_get):
            batch2, cursor2, exhausted2 = ss.search_pisshamster(
                "outdoor", 1, cursor, min_duration=600
            )
        self.assertEqual(batch2[0]["title"], "Later Clip")
        self.assertIn("/333-later-clip/", batch2[0]["url"])
        self.assertTrue(exhausted2)
        self.assertGreaterEqual(cursor2, 20_000)

    def test_category_uses_resolved_path(self):
        with patch.object(ss, "_html_get", side_effect=self._fake_get) as fake:
            batch, _cursor, _exhausted = ss.search_pisshamster(
                "Outdoor", 1, 0, min_duration=600, mode="category"
            )
        self.assertEqual(batch[0]["url"], "https://pisshamster.com/97436-example-clip/")
        requested = [call.args[0] for call in fake.call_args_list]
        self.assertTrue(any(url.rstrip("/").endswith("/categories") for url in requested))
        self.assertTrue(any("/3-outdoor/?filter=longest" in url for url in requested))
        self.assertFalse(any("?s=" in url for url in requested))

    def test_unknown_category_falls_back_to_query(self):
        with patch.object(ss, "_html_get", side_effect=self._fake_get) as fake:
            batch, _cursor, _exhausted = ss.search_pisshamster(
                "not-a-category", 1, 0, min_duration=600, mode="category"
            )
        self.assertEqual(len(batch), 1)
        requested = [call.args[0] for call in fake.call_args_list]
        self.assertTrue(any("/categories/" in url for url in requested))
        self.assertTrue(any("?s=not-a-category" in url for url in requested))

    def test_registered_and_detected(self):
        self.assertIs(ss.SEARCHERS["PissHamster"], ss.search_pisshamster)
        self.assertEqual(
            scrape_search.detect_source_site(
                "https://de.pisshamster.com/97436-example-clip/"
            ),
            "PissHamster",
        )
        self.assertEqual(
            scrape_search.detect_source_site("https://www.pisshamster.com/embed/97436"),
            "PissHamster",
        )

    def test_refresh_download_urls(self):
        with patch(
            "scrape_search._html_get",
            return_value=_detail(97436, "example-clip", "Example Clip"),
        ):
            out = scrape_search.refresh_download_urls(
                "https://pisshamster.com/97436-example-clip/",
                "PissHamster",
            )
        self.assertIn("verify=1-high", out["_cdn_url"])
        self.assertEqual(out["title"], "Example Clip")
        self.assertEqual(out["pornstars"], ["Katty West"])
        self.assertEqual(out["upload_date"], "2023-02-14T17:20:22+00:00")

    def test_description_strips_site_name(self):
        cleaned = clean_description("Watch this clip free on pisshamster.com tonight.")
        self.assertNotIn("pisshamster", (cleaned or "").lower())

    @unittest.skipIf(db is None, "psycopg is not installed")
    def test_canonical_key(self):
        self.assertEqual(
            db.canonical_key(
                "https://de.pisshamster.com/97436-example-clip/?utm_source=ad"
            ),
            "pisshamster:97436",
        )
        self.assertEqual(
            db.canonical_key("https://www.pisshamster.com/embed/97436"),
            "pisshamster:97436",
        )
        self.assertNotEqual(
            db.canonical_key("https://pisshamster.com/tag/535-outdoor/"),
            "pisshamster:535",
        )


if __name__ == "__main__":
    unittest.main()
