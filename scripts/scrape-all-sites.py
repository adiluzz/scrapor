#!/usr/bin/env python3
"""
Scrape worker launcher (reworked for the multi-site platform).

The scraping logic now lives in the queue-consuming worker at worker/worker.py,
which reads ScrapeRun rows from Postgres, dedups by sourceUrl, uploads to S3, and
generates preview/thumbnail/storyboard assets.

Usage:
  python scripts/scrape-all-sites.py            # run the queue consumer
  python scripts/scrape-all-sites.py --run ID   # process a single ScrapeRun and exit

Admins normally create runs from admin.<domain>/admin/scrape-runs, which enqueues
the run id in Redis for this worker to pick up.
"""

import os
import runpy
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.argv[0] = os.path.join(ROOT, "worker", "worker.py")
runpy.run_path(sys.argv[0], run_name="__main__")
