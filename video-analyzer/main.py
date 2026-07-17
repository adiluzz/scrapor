#!/usr/bin/env python3
"""Redis queue consumer for video analysis runs."""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import traceback

import redis

from config import CONFIG
from db import connect, list_active_runs
from runner import process_run

logging.basicConfig(
    level=logging.INFO,
    format='{"service":"video-analyzer","level":"%(levelname)s","msg":%(message)s}',
)
log = logging.getLogger("video-analyzer")


def _j(msg: dict) -> str:
    return json.dumps(msg, default=str)


def _redis_client() -> redis.Redis:
    # socket_timeout must exceed blpop timeout, otherwise idle polls raise
    # TimeoutError and flood logs (and can disrupt the consumer loop).
    return redis.from_url(
        os.environ.get("REDIS_URL", "redis://localhost:6379"),
        socket_timeout=30,
        socket_connect_timeout=10,
        health_check_interval=30,
        retry_on_timeout=True,
    )


def main() -> None:
    r = _redis_client()
    conn = connect()

    try:
        resumable = list_active_runs(conn)
        for rid in resumable:
            r.rpush(CONFIG.queue_key, rid)
        if resumable:
            log.info(_j({"event": "resume_runs", "count": len(resumable), "ids": resumable}))
    except Exception as e:  # noqa: BLE001
        log.error(_j({"event": "resume_failed", "error": str(e)}))

    log.info(_j({"event": "started", "queue": CONFIG.queue_key}))

    while True:
        try:
            item = r.blpop(CONFIG.queue_key, timeout=5)
            if not item:
                continue
            run_id = item[1].decode() if isinstance(item[1], bytes) else item[1]
            log.info(_j({"event": "job_received", "runId": run_id}))
            process_run(conn, run_id)
        except redis.TimeoutError:
            # Idle / transient socket timeout — reconnect and keep polling.
            try:
                r.close()
            except Exception:  # noqa: BLE001
                pass
            r = _redis_client()
            time.sleep(1)
        except Exception as e:  # noqa: BLE001
            log.error(_j({
                "event": "loop_error",
                "error": str(e),
                "traceback": traceback.format_exc()[-800:],
            }))
            time.sleep(3)
            try:
                r.close()
            except Exception:  # noqa: BLE001
                pass
            r = _redis_client()


if __name__ == "__main__":
    main()
