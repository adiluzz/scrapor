"""Environment configuration for the video analyzer service."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    aws_region: str
    aws_account_id: str
    s3_bucket: str
    s3_endpoint: str | None
    twelvelabs_api_key: str | None
    chunk_sec: int
    use_scene_chunking: bool
    queue_key: str
    work_dir: str
    downloads_dir: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            aws_region=os.environ.get("AWS_REGION", "us-east-1"),
            aws_account_id=os.environ.get("AWS_ACCOUNT_ID", "").strip(),
            s3_bucket=os.environ.get("S3_BUCKET", "pisster-media"),
            s3_endpoint=(os.environ.get("S3_ENDPOINT") or "").strip() or None,
            twelvelabs_api_key=(os.environ.get("TWELVELABS_API_KEY") or "").strip() or None,
            chunk_sec=int(os.environ.get("VIDEO_AGENT_CHUNK_SEC", "180")),
            use_scene_chunking=os.environ.get("VIDEO_AGENT_USE_SCENE_CHUNKING", "").lower()
            in ("1", "true", "yes"),
            queue_key=os.environ.get("VIDEO_AGENT_QUEUE_KEY", "video-agent:queue"),
            work_dir=os.environ.get("VIDEO_AGENT_WORK_DIR", "/tmp/video-agent"),
            downloads_dir=os.environ.get("DOWNLOADS_DIR", "/app/downloads"),
        )

    def bedrock_s3_available(self) -> bool:
        """Bedrock s3Location only works with real AWS S3, not custom endpoints."""
        return bool(
            os.environ.get("AWS_ACCESS_KEY_ID")
            and os.environ.get("AWS_SECRET_ACCESS_KEY")
            and not self.s3_endpoint
        )


CONFIG = Config.from_env()
