#!/usr/bin/env python3
"""Unit tests for the Xozilla scraper (no network)."""

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


DETAIL_HTML = """
<html><head>
<meta property="og:title" content="Example Clip - Xozilla"/>
<meta property="og:image" content="https://www.xozilla.xxx/contents/preview.jpg"/>
<meta name="description" content="Fallback description on Xozilla"/>
</head><body>
<h1>Example Clip - Xozilla</h1>
<script>
var flashvars = {
  video_id: '111',
  video_title: 'Example Clip',
  video_categories: 'Couple, Xozilla',
  video_tags: 'amateur, xozilla',
  duration: '737',
  video_url: 'https://www.xozilla.xxx/get_file/5/low/111.mp4/',
  video_url_text: '540p',
  video_alt_url: 'https://www.xozilla.xxx/get_file/5/high/111hd.mp4/',
  video_alt_url_text: '720p',
  preview_url: 'https://www.xozilla.xxx/contents/preview.jpg'
};
</script>
<div class="block-details">
  <div class="info">
    <div class="item">
      <span><i class="fa fa-clock-o"></i> Duration: <em>12min 17sec</em></span>
    </div>
    <div class="item">
      <i class="fa fa-pencil-square-o"></i>
      <em>A real description</em>
    </div>
    <div class="item">
      <i class="fa fa-sliders"></i>
      <a href="https://www.xozilla.xxx/categories/couple/">Couple</a>
      <a href="https://www.xozilla.xxx/categories/xozilla/">Xozilla</a>
    </div>
    <div class="item">
      <i class="fa fa-tags"></i>
      <a href="https://www.xozilla.xxx/tags/amateur/">amateur</a>
      <a href="https://www.xozilla.xxx/tags/xozilla/">xozilla</a>
    </div>
  </div>
</div>
<a href="https://www.xozilla.xxx/models/">Models</a>
<a href="https://www.xozilla.xxx/models/jane-doe/">Jane Doe</a>
</body></html>
"""

LISTING_PAGE_1 = """
<html><body>
<a class="item" href="https://www.xozilla.xxx/videos/111/example-clip/">
  <div class="img ithumb">
    <img alt="Example Clip" class="thumb lazy-load"
         data-original="https://www.xozilla.xxx/contents/111.jpg"
         src="data:image/gif;base64,xx">
    <!-- <div class="duration">12m:17s</div> -->
  </div>
  <strong class="title">Example Cli...</strong>
</a>
<a class="item" href="https://www.xozilla.xxx/videos/222/too-short/">
  <img alt="Too Short" data-original="https://www.xozilla.xxx/contents/222.jpg">
  <!-- <div class="duration">1m:05s</div> -->
  <strong class="title">Too Short</strong>
</a>
<div class="pagination">
  <a data-parameters="q:amateur;category_ids:;sort_by:;from_videos+from_albums:02" href="#search">02</a>
</div>
</body></html>
"""

LISTING_PAGE_2 = """
<html><body>
<a class="item" href="/videos/333/later-clip/">
  <img alt="Later Clip" data-original="https://www.xozilla.xxx/contents/333.jpg">
  <!-- <div class="duration">15m:00s</div> -->
  <strong class="title">Later Clip</strong>
</a>
</body></html>
"""

HLS_ONLY_HTML = """
<html><body>
<script>
var flashvars = {
  video_url: 'https://cdn.example/stream.m3u8',
  video_url_text: '720p'
};
</script>
<h1>HLS Clip</h1>
</body></html>
"""


class XozillaParseTests(unittest.TestCase):
    def test_detail_picks_highest_mp4_and_metadata(self):
        meta = ss._xz_parse_detail(
            DETAIL_HTML, "https://xozilla.xxx/videos/111/example-clip/?utm_source=x"
        )
        self.assertEqual(meta["url"], "https://www.xozilla.xxx/videos/111/example-clip/")
        self.assertEqual(meta["title"], "Example Clip")
        self.assertEqual(meta["duration_sec"], 737)
        self.assertEqual(meta["description"], "A real description")
        self.assertEqual(meta["categories"], ["Couple"])
        self.assertEqual(meta["tags"], ["amateur"])
        self.assertEqual(meta["pornstars"], ["Jane Doe"])
        self.assertEqual(meta["thumbnail"], "https://www.xozilla.xxx/contents/preview.jpg")
        self.assertEqual(
            meta["_cdn_url"], "https://www.xozilla.xxx/get_file/5/high/111hd.mp4/"
        )
        self.assertIsNone(meta["_m3u8_base_url"])

    def test_hls_used_when_no_mp4(self):
        meta = ss._xz_parse_detail(HLS_ONLY_HTML, "https://www.xozilla.xxx/videos/9/hls/")
        self.assertIsNone(meta["_cdn_url"])
        self.assertEqual(meta["_m3u8_base_url"], "https://cdn.example/stream.m3u8")

    def test_listing_uses_alt_title_and_comment_duration(self):
        items = ss._xz_search_items(LISTING_PAGE_1)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "Example Clip")
        self.assertEqual(items[0]["duration_sec"], 12 * 60 + 17)
        self.assertEqual(items[0]["thumbnail"], "https://www.xozilla.xxx/contents/111.jpg")
        self.assertEqual(items[1]["duration_sec"], 65)

    def test_search_urls(self):
        self.assertEqual(
            ss._xz_search_url("big tits", 1),
            "https://www.xozilla.xxx/search/?q=big+tits",
        )
        page2 = ss._xz_search_url("amateur", 2)
        self.assertIn("mode=async", page2)
        self.assertIn("block_id=list_videos_videos_list_search_result", page2)
        self.assertIn("from_videos=02", page2)
        category = ss._xz_search_url("Big Tits", 3, mode="category")
        self.assertTrue(category.startswith("https://www.xozilla.xxx/categories/big-tits/?"))
        self.assertIn("block_id=list_videos_common_videos_list", category)
        self.assertIn("from=03", category)

    def test_next_page_ignores_earlier_links(self):
        html = (
            'data-parameters="from_videos+from_albums:9" '
            'data-parameters="sort_by:post_date;from:01" '
            'data-parameters="from_videos+from_albums:11"'
        )
        self.assertEqual(ss._xz_next_page(html, 10), 11)


class XozillaSearchTests(unittest.TestCase):
    def _fake_get(self, url):
        if "/videos/" in url:
            return DETAIL_HTML
        if "from_videos=02" in url:
            return LISTING_PAGE_2
        if "/categories/" in url:
            return ""
        return LISTING_PAGE_1

    def test_search_filters_duration_and_resumes_mid_page(self):
        with patch.object(ss, "_html_get", side_effect=self._fake_get):
            batch, cursor, exhausted = ss.search_xozilla("amateur", 1, 0, min_duration=600)
        self.assertEqual(len(batch), 1)
        self.assertEqual(batch[0]["url"], "https://www.xozilla.xxx/videos/111/example-clip/")
        self.assertEqual(batch[0]["tags"], ["amateur"])
        self.assertEqual(batch[0]["pornstars"], ["Jane Doe"])
        self.assertEqual(batch[0]["_cdn_url"], "https://www.xozilla.xxx/get_file/5/high/111hd.mp4/")
        self.assertEqual(cursor, 10_001)
        self.assertFalse(exhausted)

        with patch.object(ss, "_html_get", side_effect=self._fake_get):
            batch2, cursor2, exhausted2 = ss.search_xozilla(
                "amateur", 1, cursor, min_duration=600
            )
        self.assertEqual(batch2[0]["title"], "Example Clip")
        self.assertIn("/videos/333/", batch2[0]["url"])
        self.assertTrue(exhausted2)
        self.assertGreaterEqual(cursor2, 20_000)

    def test_unknown_category_falls_back_to_query(self):
        with patch.object(ss, "_html_get", side_effect=self._fake_get) as fake:
            batch, _cursor, _exhausted = ss.search_xozilla(
                "not-a-category", 1, 0, min_duration=600, mode="category"
            )
        self.assertEqual(len(batch), 1)
        requested = [call.args[0] for call in fake.call_args_list]
        self.assertTrue(any("/categories/" in url for url in requested))
        self.assertTrue(any("/search/" in url for url in requested))

    def test_registered_and_detected(self):
        self.assertIs(ss.SEARCHERS["Xozilla"], ss.search_xozilla)
        self.assertEqual(
            scrape_search.detect_source_site("https://www.xozilla.xxx/videos/111/example-clip/"),
            "Xozilla",
        )
        self.assertEqual(
            scrape_search.detect_source_site("https://m.xozilla.com/videos/111/example/"),
            "Xozilla",
        )

    def test_refresh_download_urls(self):
        with patch("scrape_search._html_get", return_value=DETAIL_HTML):
            out = scrape_search.refresh_download_urls(
                "https://www.xozilla.xxx/videos/111/example-clip/",
                "Xozilla",
            )
        self.assertEqual(out["_cdn_url"], "https://www.xozilla.xxx/get_file/5/high/111hd.mp4/")
        self.assertEqual(out["title"], "Example Clip")
        self.assertEqual(out["pornstars"], ["Jane Doe"])

    def test_description_strips_site_name(self):
        cleaned = clean_description("Watch this clip free on xozilla.xxx tonight.")
        self.assertNotIn("xozilla", (cleaned or "").lower())

    @unittest.skipIf(db is None, "psycopg is not installed")
    def test_canonical_key(self):
        self.assertEqual(
            db.canonical_key("https://www.xozilla.xxx/videos/487912/some-slug/?utm_source=ad"),
            "xozilla:487912",
        )
        self.assertEqual(
            db.canonical_key("https://m.xozilla.com/videos/9/other/"),
            "xozilla:9",
        )


if __name__ == "__main__":
    unittest.main()
