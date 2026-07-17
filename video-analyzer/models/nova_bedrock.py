"""Amazon Nova models via Bedrock Converse API."""

from __future__ import annotations

import json
import logging

from tenacity import retry, stop_after_attempt, wait_exponential

from media import MediaSource, bedrock_client
from models.parse import parse_detections_json
from models.registry import Detection
from prompts.detection import nova_detection_prompt

log = logging.getLogger("video-analyzer.nova_bedrock")


class NovaBedrockAnalyzer:
    def __init__(self, model_id: str, supports_bbox: bool = True) -> None:
        self.model_id = model_id
        self.supports_bbox = supports_bbox

    def _video_block(self, media: MediaSource) -> dict:
        if media.kind == "s3" and media.s3_uri:
            loc: dict = {"uri": media.s3_uri}
            if media.bucket_owner:
                loc["bucketOwner"] = media.bucket_owner
            return {"video": {"format": "mp4", "source": {"s3Location": loc}}}
        if media.base64_data:
            return {"video": {"format": "mp4", "source": {"bytes": media.base64_data}}}
        if media.path:
            return {"video": {"format": "mp4", "source": {"bytes": media.path.read_bytes()}}}
        raise ValueError("Nova requires S3 URI, base64, or local path")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=4, max=60))
    def analyze(
        self,
        media: MediaSource,
        targets: list[str],
        learning_context: str,
    ) -> list[Detection]:
        prompt = nova_detection_prompt(
            targets, learning_context, media.chunk_start_sec, media.chunk_duration_sec
        )
        client = bedrock_client()
        log.info("nova_invoke model_id=%s chunk_start=%s", self.model_id, media.chunk_start_sec)
        response = client.converse(
            modelId=self.model_id,
            messages=[{
                "role": "user",
                "content": [
                    self._video_block(media),
                    {"text": prompt},
                ],
            }],
            inferenceConfig={"maxTokens": 4096, "temperature": 0.2},
        )
        parts = response.get("output", {}).get("message", {}).get("content", [])
        text = ""
        for part in parts:
            if "text" in part:
                text += part["text"]
        stop = response.get("stopReason")
        usage = response.get("usage") or {}
        try:
            dets = parse_detections_json(text, chunk_offset=media.chunk_start_sec)
        except json.JSONDecodeError:
            log.warning(
                "nova_json_parse_failed stop=%s out_tokens=%s text=%s",
                stop,
                usage.get("outputTokens"),
                text[:500],
            )
            return []
        if not dets:
            log.info(
                "nova_empty_detections stop=%s out_tokens=%s chunk_start=%s text=%s",
                stop,
                usage.get("outputTokens"),
                media.chunk_start_sec,
                text[:300],
            )
        else:
            log.info(
                "nova_detections count=%s chunk_start=%s labels=%s",
                len(dets),
                media.chunk_start_sec,
                [d.label for d in dets[:8]],
            )
        return dets
