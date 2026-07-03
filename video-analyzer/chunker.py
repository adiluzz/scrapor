"""Split videos into analysis windows."""

from __future__ import annotations

from dataclasses import dataclass

from config import CONFIG


@dataclass
class TimeChunk:
    start_sec: float
    duration_sec: float


def build_fixed_chunks(total_duration_sec: float, chunk_sec: int | None = None) -> list[TimeChunk]:
    chunk_sec = chunk_sec or CONFIG.chunk_sec
    if total_duration_sec <= 0:
        return []
    chunks: list[TimeChunk] = []
    start = 0.0
    while start < total_duration_sec:
        dur = min(chunk_sec, total_duration_sec - start)
        chunks.append(TimeChunk(start_sec=start, duration_sec=dur))
        start += chunk_sec
    return chunks


def build_scene_chunks(video_path: str, max_chunk_sec: int | None = None) -> list[TimeChunk]:
    """Optional PySceneDetect-based chunking merged into <= max_chunk_sec batches."""
    max_chunk_sec = max_chunk_sec or CONFIG.chunk_sec
    try:
        from scenedetect import ContentDetector, SceneManager, open_video
    except ImportError:
        from media import probe_duration
        return build_fixed_chunks(probe_duration(__import__("pathlib").Path(video_path)))

    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=27.0))
    scene_manager.detect_scenes(video)
    scene_list = scene_manager.get_scene_list()

    if not scene_list:
        from pathlib import Path
        from media import probe_duration
        return build_fixed_chunks(probe_duration(Path(video_path)))

    shots: list[TimeChunk] = []
    for start, end in scene_list:
        shots.append(TimeChunk(
            start_sec=start.get_seconds(),
            duration_sec=end.get_seconds() - start.get_seconds(),
        ))

    merged: list[TimeChunk] = []
    batch_start = shots[0].start_sec
    batch_dur = 0.0
    for shot in shots:
        if batch_dur + shot.duration_sec > max_chunk_sec and batch_dur > 0:
            merged.append(TimeChunk(start_sec=batch_start, duration_sec=batch_dur))
            batch_start = shot.start_sec
            batch_dur = 0.0
        batch_dur += shot.duration_sec
    if batch_dur > 0:
        merged.append(TimeChunk(start_sec=batch_start, duration_sec=batch_dur))
    return merged
