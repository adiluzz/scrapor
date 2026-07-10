#!/usr/bin/env python3
"""Unit + optional live tests for the xHamster scraper."""

import json
import os
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
import site_searchers as ss  # noqa: E402


SAMPLE_DETAIL_HTML = """
<html><body>
<script>
window.initials={"videoModel":{"title":"Test Video","duration":720,"description":"A desc",
"thumbURL":"https://ic-vt-nss.xhcdn.com/thumb.jpg"},
"videoEntity":{"pornstarModels":[{"name":"Jane Doe"}]},
"videoTagsComponent":{"tags":[
  {"name":"Pissing","url":"https://xhamster.com/categories/pissing","isPornstar":false},
  {"name":"Outdoor","url":"https://xhamster.com/tags/outdoor","isPornstar":false},
  {"name":"Jane Doe","url":"https://xhamster.com/pornstars/jane-doe","isPornstar":true},
  {"name":"Some Channel","url":"https://xhamster.com/creators/some-channel","isCreator":true}
]}}
</script>
https://video-nss.xhcdn.com/token==,123/media=hls4/multi=256x144:144p:,426x240:240p:/path/_TPL_.h264.mp4.m3u8
</body></html>
"""

SAMPLE_DETAIL_AV1_ONLY = """
<html><body>
https://video-nss.xhcdn.com/token==,123/media=hls4/multi=256x144:144p:,426x240:240p:/path/_TPL_.av1.mp4.m3u8
</body></html>
"""

SAMPLE_SEARCH_HTML = """
<html><body><script>
window.initials={"searchResult":{"videoThumbProps":[
  {"pageURL":"/videos/test-slug-xhABC","title":"Test Slug","duration":900,
   "thumbURL":"https://ic-vt-nss.xhcdn.com/a/thumb.webp"}
]}}
</script></body></html>
"""


class XHamsterParseTests(unittest.TestCase):
    def test_extract_m3u8_prefers_h264_template(self):
        url = ss._xh_extract_m3u8(SAMPLE_DETAIL_HTML)
        self.assertIn("_TPL_.h264.mp4.m3u8", url or "")
        self.assertIn("video-nss.xhcdn.com", url or "")

    def test_extract_m3u8_accepts_av1_when_no_h264(self):
        url = ss._xh_extract_m3u8(SAMPLE_DETAIL_AV1_ONLY)
        self.assertIn("_TPL_.av1.mp4.m3u8", url or "")
        self.assertIn("video-nss.xhcdn.com", url or "")

    def test_parse_detail_reads_initials(self):
        meta = ss._xh_parse_detail(
            SAMPLE_DETAIL_HTML,
            "https://xhamster.com/videos/test-slug-xhABC",
        )
        self.assertEqual(meta["title"], "Test Video")
        self.assertEqual(meta["duration_sec"], 720)
        self.assertEqual(meta["categories"], ["Pissing"])
        self.assertEqual(meta["tags"], ["Outdoor"])
        self.assertEqual(meta["pornstars"], ["Jane Doe"])
        self.assertNotIn("Pissing", meta["pornstars"])
        self.assertNotIn("Some Channel", meta["pornstars"])
        self.assertIn("_TPL_.h264.mp4.m3u8", meta["_m3u8_base_url"] or "")

    def test_tag_kind_classifies_by_url(self):
        self.assertEqual(
            ss._xh_tag_kind({"name": "Pissing", "url": "/categories/pissing"}),
            "category",
        )
        self.assertEqual(
            ss._xh_tag_kind({"name": "Jane", "url": "/pornstars/jane", "isPornstar": True}),
            "pornstar",
        )
        self.assertEqual(
            ss._xh_tag_kind({"name": "Outdoor", "url": "/tags/outdoor"}),
            "tag",
        )


class XHamsterSearchTests(unittest.TestCase):
    @patch.object(ss, "_xhamster_get")
    def test_search_enriches_from_detail_page(self, mock_get):
        detail = SAMPLE_DETAIL_HTML
        mock_get.side_effect = [SAMPLE_SEARCH_HTML, detail]

        batch, cursor, exhausted = ss.search_xhamster("piss", 1, 0, 600)
        self.assertEqual(len(batch), 1)
        self.assertEqual(batch[0]["title"], "Test Video")
        self.assertEqual(batch[0]["duration_sec"], 720)
        self.assertEqual(batch[0]["categories"], ["Pissing"])
        self.assertEqual(batch[0]["tags"], ["Outdoor"])
        self.assertEqual(batch[0]["pornstars"], ["Jane Doe"])
        self.assertIn("_TPL_.h264.mp4.m3u8", batch[0]["_m3u8_base_url"] or "")
        self.assertEqual(cursor, 2)
        self.assertFalse(exhausted)

    @patch.object(ss, "_xhamster_get", return_value="")
    def test_search_empty_on_fetch_failure(self, _mock_get):
        batch, _cursor, exhausted = ss.search_xhamster("piss", 5, 0, 600)
        self.assertEqual(batch, [])
        self.assertTrue(exhausted)


def live_search(limit=3):
    print(f"=== live search (limit={limit}) ===")
    batch, cursor, exhausted = ss.search_xhamster("piss drinking", limit, 0, 600)
    print(f"results={len(batch)} cursor={cursor} exhausted={exhausted}")
    for v in batch:
        print(json.dumps({
            k: v[k] for k in (
                "url", "title", "duration_sec", "thumbnail", "description",
                "tags", "categories", "pornstars", "_m3u8_base_url",
            )
            if k in v
        }, indent=2))
    return batch


def live_pagination():
    print("=== live pagination ===")
    cursor = 0
    seen = set()
    for i in range(5):
        batch, cursor, exhausted = ss.search_xhamster("piss drinking", 10, cursor, 600)
        new = [v["url"] for v in batch if v.get("url") not in seen]
        for u in new:
            seen.add(u)
        print(f"batch {i + 1}: got={len(batch)} new={len(new)} cursor={cursor} exhausted={exhausted}")
        if exhausted or not batch:
            break
    print(f"total unique={len(seen)}")


def live_download_one():
    batch = live_search(limit=1)
    if not batch:
        raise SystemExit("no search results")
    v = batch[0]
    m3u8 = v.get("_m3u8_base_url")
    if not m3u8:
        raise SystemExit("no m3u8 fast-path URL on candidate")
    dest = "/tmp/xhamster-scraper-test.mp4"
    stream = m3u8.replace("_TPL_", "240p")
    print(f"=== downloading 30s via ffmpeg from {stream[:80]}... ===")
    subprocess.run(
        ["ffmpeg", "-y", "-i", stream, "-c", "copy", "-t", "30", dest],
        check=True,
        capture_output=True,
    )
    size = os.path.getsize(dest)
    print(f"saved {dest} ({size} bytes)")
    if size < 100_000:
        raise SystemExit("download too small")


if __name__ == "__main__":
    if "--live" in sys.argv:
        live_pagination()
        live_download_one()
    elif "--live-search" in sys.argv:
        live_search(int(sys.argv[sys.argv.index("--live-search") + 1]) if len(sys.argv) > sys.argv.index("--live-search") + 1 else 3)
    else:
        unittest.main()
