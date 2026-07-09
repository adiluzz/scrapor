#!/usr/bin/env python3
"""Unit tests for scrape_search URL refresh helpers (no network)."""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
import scrape_search as ss  # noqa: E402


class RefreshDownloadUrlsTests(unittest.TestCase):
    @patch("scrape_search._html_get")
    def test_refresh_pornone_returns_fresh_cdn(self, mock_html):
        mock_html.return_value = "<html><video><source type='video/mp4' src='https://cdn.example/a.mp4' res='720'></video></html>"
        with patch("scrape_search._po_parse_detail") as mock_parse:
            mock_parse.return_value = {
                "_cdn_url": "https://cdn.example/a.mp4",
                "_m3u8_base_url": None,
                "_part_urls": None,
            }
            out = ss.refresh_download_urls(
                "https://pornone.com/pissing/example/123/",
                "PornOne",
            )
        self.assertEqual(out["_cdn_url"], "https://cdn.example/a.mp4")
        mock_html.assert_called_once()

    @patch("scrape_search._html_get", return_value=None)
    def test_refresh_returns_empty_when_page_missing(self, _mock_html):
        self.assertEqual(ss.refresh_download_urls("https://pornone.com/x/1/", "PornOne"), {})

    @patch("scrape_search._xhamster_get")
    def test_refresh_xhamster_returns_m3u8(self, mock_get):
        mock_get.return_value = (
            '<html>https://video-am.xhcdn.com/x/_TPL_.h264.mp4.m3u8</html>'
        )
        out = ss.refresh_download_urls(
            "https://xhamster.com/videos/example-xhABC",
            "XHamster",
        )
        self.assertIn("_TPL_.h264.mp4.m3u8", out.get("_m3u8_base_url") or "")

    def test_apply_download_urls_replaces_and_clears(self):
        video = {
            "_cdn_url": "https://old.example/a.mp4",
            "_m3u8_base_url": "https://old.example/hls_TPL_.m3u8",
            "_part_urls": ["https://old.example/p1.mp4"],
        }
        ss.apply_download_urls(video, {
            "_cdn_url": "https://new.example/a.mp4",
            "_m3u8_base_url": None,
            "_part_urls": None,
        })
        self.assertEqual(video["_cdn_url"], "https://new.example/a.mp4")
        self.assertNotIn("_m3u8_base_url", video)
        self.assertNotIn("_part_urls", video)


if __name__ == "__main__":
    unittest.main()
