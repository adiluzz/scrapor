"""TwelveLabs Pegasus 1.2 via Amazon Bedrock InvokeModel."""

from __future__ import annotations

import json
import logging

from tenacity import retry, stop_after_attempt, wait_exponential

from media import MediaSource, bedrock_client
from models.parse import parse_detections_json
from models.registry import Detection
from prompts.detection import DETECTION_JSON_SCHEMA, pegasus_detection_prompt

log = logging.getLogger("video-analyzer.pegasus_bedrock")


class PegasusBedrockAnalyzer:
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=4, max=60))
    def analyze(
        self,
        media: MediaSource,
        targets: list[str],
        learning_context: str,
    ) -> list[Detection]:
        prompt = pegasus_detection_prompt(
            targets, learning_context, media.chunk_start_sec, media.chunk_duration_sec
        )
        media_source: dict = {}
        if media.kind == "s3" and media.s3_uri:
            loc: dict = {"uri": media.s3_uri}
            if media.bucket_owner:
                loc["bucketOwner"] = media.bucket_owner
            media_source["s3Location"] = loc
        elif media.base64_data:
            media_source["base64String"] = media.base64_data
        else:
            raise ValueError("Pegasus Bedrock requires S3 URI or base64 video")

        body = {
            "inputPrompt": prompt,
            "mediaSource": media_source,
            "temperature": 0.2,
            "maxOutputTokens": 4096,
            "responseFormat": {"jsonSchema": DETECTION_JSON_SCHEMA},
        }

        client = bedrock_client()
        log.info("pegasus_invoke model_id=%s chunk_start=%s", self.model_id, media.chunk_start_sec)
        response = client.invoke_model(
            modelId=self.model_id,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )
        payload = json.loads(response["body"].read())
        message = payload.get("message") or ""
        try:
            return parse_detections_json(message, chunk_offset=media.chunk_start_sec)
        except json.JSONDecodeError:
            log.warning("pegasus_json_parse_failed message=%s", message[:500])
            return []
