"""TwelveLabs Pegasus 1.5 direct API with video segmentation."""

from __future__ import annotations

import json
import logging
import time

from config import CONFIG
from media import MediaSource
from models.parse import parse_detections_json, parse_segments_response
from models.registry import Detection

log = logging.getLogger("video-analyzer.pegasus_direct")


class PegasusDirectAnalyzer:
    def analyze(
        self,
        media: MediaSource,
        targets: list[str],
        learning_context: str,
    ) -> list[Detection]:
        if not CONFIG.twelvelabs_api_key:
            raise RuntimeError("TWELVELABS_API_KEY is required for Pegasus 1.5")

        from twelvelabs import TwelveLabs

        client = TwelveLabs(api_key=CONFIG.twelvelabs_api_key)

        segment_definitions = []
        for target in targets:
            segment_definitions.append({
                "id": target.lower().replace(" ", "_")[:40],
                "description": (
                    f'Detect every time the on-screen event "{target}" is clearly visible. '
                    f"{learning_context[:500]}"
                ),
                "fields": [
                    {
                        "name": "event",
                        "type": "string",
                        "description": f'Should be "{target}" when present',
                    },
                    {
                        "name": "confidence",
                        "type": "number",
                        "description": "Confidence 0-1 that the event is visible",
                    },
                ],
                "time_ranges": [{
                    "start_time": media.chunk_start_sec,
                    "end_time": media.chunk_start_sec + media.chunk_duration_sec,
                }] if media.chunk_duration_sec > 0 else None,
            })
            # Remove None time_ranges
            if segment_definitions[-1]["time_ranges"] is None:
                del segment_definitions[-1]["time_ranges"]

        video_ctx = self._video_context(client, media)

        try:
            task = client.analyze_async.tasks.create(
                video=video_ctx,
                model_name="pegasus1.5",
                analysis_mode="time_based_metadata",
                response_format={
                    "type": "segment_definitions",
                    "segment_definitions": segment_definitions,
                },
            )
        except Exception:
            # Fallback: synchronous analyze with prompt if async segmentation unavailable
            return self._sync_analyze(client, media, targets, learning_context)

        task_id = getattr(task, "id", None) or (task.get("id") if isinstance(task, dict) else None)
        if not task_id:
            return self._sync_analyze(client, media, targets, learning_context)

        deadline = time.time() + 600
        while time.time() < deadline:
            status = client.analyze_async.tasks.retrieve(task_id)
            state = getattr(status, "status", None) or (status.get("status") if isinstance(status, dict) else "")
            if state in ("ready", "completed", "done"):
                result = getattr(status, "result", None) or status.get("result", {})
                data_raw = getattr(result, "data", None) if result else None
                if data_raw is None and isinstance(result, dict):
                    data_raw = result.get("data")
                if isinstance(data_raw, str):
                    data = json.loads(data_raw)
                elif isinstance(data_raw, dict):
                    data = data_raw
                else:
                    data = {}
                segments = data.get("segments") or data.get("data") or []
                if isinstance(segments, dict):
                    segments = segments.get("segments") or []
                return parse_segments_response(segments, targets, media.chunk_start_sec)
            if state in ("failed", "error"):
                log.error("pegasus15_task_failed task_id=%s", task_id)
                break
            time.sleep(5)

        return self._sync_analyze(client, media, targets, learning_context)

    def _video_context(self, client, media: MediaSource):
        from twelvelabs.types import VideoContext_AssetId, VideoContext_Url

        if media.url:
            return VideoContext_Url(url=media.url)
        if media.path and media.path.exists():
            # Upload short clip as asset
            asset = client.assets.create(method="direct", file=str(media.path))
            asset_id = getattr(asset, "id", None) or asset.get("id")
            return VideoContext_AssetId(asset_id=asset_id)
        if media.s3_uri and media.url is None:
            from media import presign_video_url
            # Caller should set url via presign — handled in runner
            raise ValueError("Pegasus direct needs presigned URL or local chunk path")
        raise ValueError("No video source for Pegasus 1.5")

    def _sync_analyze(
        self,
        client,
        media: MediaSource,
        targets: list[str],
        learning_context: str,
    ) -> list[Detection]:
        from prompts.detection import pegasus_detection_prompt

        prompt = pegasus_detection_prompt(
            targets, learning_context, media.chunk_start_sec, media.chunk_duration_sec
        )
        video_ctx = self._video_context(client, media)
        try:
            result = client.analyze(video=video_ctx, prompt=prompt, model_name="pegasus1.5")
            text = getattr(result, "data", None) or str(result)
            if not isinstance(text, str):
                text = json.dumps(text)
            return parse_detections_json(text, chunk_offset=media.chunk_start_sec)
        except Exception as e:  # noqa: BLE001
            log.error("pegasus15_sync_failed err=%s", e)
            return []
