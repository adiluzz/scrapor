#!/usr/bin/env python3
"""Redis queue consumer for promo ad generation."""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import traceback

import redis

from config import CONFIG
from db import connect, list_active_iterations
from runner import process_iteration

logging.basicConfig(
    level=logging.INFO,
    format='{"service":"ad-generator","level":"%(levelname)s","msg":%(message)s}',
)
log = logging.getLogger("ad-generator")


def _j(msg: dict) -> str:
    return json.dumps(msg, default=str)


def main() -> None:
    r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))
    conn = connect()

    try:
        resumable = list_active_iterations(conn)
        for iid in resumable:
            r.rpush(CONFIG.queue_key, iid)
        if resumable:
            log.info(_j({"event": "resume_iterations", "count": len(resumable)}))
    except Exception as e:  # noqa: BLE001
        log.error(_j({"event": "resume_failed", "error": str(e)}))

    log.info(_j({"event": "started", "queue": CONFIG.queue_key}))

    while True:
        try:
            item = r.blpop(CONFIG.queue_key, timeout=5)
            if not item:
                continue
            iteration_id = item[1].decode() if isinstance(item[1], bytes) else item[1]
            log.info(_j({"event": "job_received", "iterationId": iteration_id}))
            process_iteration(conn, iteration_id)
        except Exception as e:  # noqa: BLE001
            log.error(_j({
                "event": "loop_error",
                "error": str(e),
                "traceback": traceback.format_exc()[-800:],
            }))
            time.sleep(3)


if __name__ == "__main__":
    main()
