"""Orchestrate a full VideoAgentRun."""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

from chunker import build_fixed_chunks, build_scene_chunks
from config import CONFIG
from db import (
    clear_detections,
    insert_detection,
    load_run,
    load_training_examples,
    resolve_run_videos,
    set_run_status,
    touch_run,
)
from learning import build_learning_context
from media import download_video, probe_duration, resolve_media_source
from models.registry import create_analyzer

log = logging.getLogger("video-analyzer.runner")


def _work_dir(run_id: str) -> Path:
    d = Path(CONFIG.work_dir) / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cleanup(run_id: str) -> None:
    d = Path(CONFIG.work_dir) / run_id
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)


def process_run(conn, run_id: str) -> None:
    run = load_run(conn, run_id)
    if not run:
        log.warning("run_not_found id=%s", run_id)
        return
    if run["status"] in ("DONE", "ERROR"):
        log.info("run_skip id=%s status=%s", run_id, run["status"])
        return

    set_run_status(conn, run_id, "RUNNING")
    work_dir = _work_dir(run_id)

    try:
        targets: list[str] = json.loads(run["extractTargets"])
        examples = load_training_examples(conn, run["siteId"], targets)
        learning_context = build_learning_context(examples)
        analyzer = create_analyzer(run.get("analysisModel") or "nova-2-lite")

        videos = resolve_run_videos(
            conn, run["siteId"], run["searchQuery"], run.get("selectedVideoIds")
        )
        if not videos:
            log.warning("run_no_videos id=%s site=%s", run_id, run["siteId"])
            set_run_status(
                conn,
                run_id,
                "ERROR",
                "No matching videos on this site (check publication / READY status)",
            )
            return

        clear_detections(conn, run_id)

        for video in videos:
            _analyze_video(
                conn,
                run_id=run_id,
                site_id=run["siteId"],
                video=video,
                targets=targets,
                learning_context=learning_context,
                analyzer=analyzer,
                work_dir=work_dir,
            )

        set_run_status(conn, run_id, "DONE")
    except Exception as e:  # noqa: BLE001
        log.exception("run_failed id=%s", run_id)
        set_run_status(conn, run_id, "ERROR", str(e))
    finally:
        _cleanup(run_id)


def _analyze_video(
    conn,
    *,
    run_id: str,
    site_id: str,
    video: dict,
    targets: list[str],
    learning_context: str,
    analyzer,
    work_dir: Path,
) -> None:
    video_id = video["id"]
    title = video.get("title") or video_id
    duration = float(video.get("durationSec") or 0)
    storage_site_id = video.get("storageSiteId") or site_id

    if duration <= 0:
        cache = work_dir / f"{video_id}.mp4"
        if not cache.exists():
            if not download_video(storage_site_id, video_id, cache):
                log.warning("video_unavailable id=%s storage_site=%s", video_id, storage_site_id)
                return
        duration = probe_duration(cache)

    if duration <= 0:
        return

    if CONFIG.use_scene_chunking:
        cache = work_dir / f"{video_id}.mp4"
        if not cache.exists():
            download_video(storage_site_id, video_id, cache)
        chunks = build_scene_chunks(str(cache)) if cache.exists() else build_fixed_chunks(duration)
    else:
        chunks = build_fixed_chunks(duration)

    for chunk in chunks:
        try:
            media = resolve_media_source(
                storage_site_id, video_id, work_dir, chunk.start_sec, chunk.duration_sec
            )
            hits = analyzer.analyze(media, targets, learning_context)
            for det in hits:
                insert_detection(
                    conn,
                    run_id=run_id,
                    video_id=video_id,
                    video_title=title,
                    label=det.label,
                    start_sec=det.start_sec,
                    end_sec=det.end_sec,
                    screen_x=det.screen_x,
                    screen_y=det.screen_y,
                    screen_w=det.screen_w,
                    screen_h=det.screen_h,
                    confidence=det.confidence,
                    frame_sec=det.frame_sec,
                )
            touch_run(conn, run_id)
        except Exception as e:  # noqa: BLE001
            log.warning(
                "chunk_failed video_id=%s start=%s err=%s",
                video_id, chunk.start_sec, e,
            )
            touch_run(conn, run_id)
