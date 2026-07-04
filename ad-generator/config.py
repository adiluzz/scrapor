"""Environment configuration for the ad-generator service."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    aws_region: str
    aws_account_id: str
    s3_bucket: str
    s3_endpoint: str | None
    queue_key: str
    work_dir: str
    downloads_dir: str
    bedrock_output_prefix: str
    brand_lockup_path: str
    intro_path: str
    outro_path: str
    fal_api_key: str | None
    runway_api_key: str | None
    gemini_api_key: str | None

    @classmethod
    def from_env(cls) -> "Config":
        assets = os.environ.get("AD_GENERATOR_ASSETS_DIR", "/app/ad-generator/assets")
        return cls(
            aws_region=os.environ.get("AWS_REGION", "us-east-1"),
            aws_account_id=os.environ.get("AWS_ACCOUNT_ID", "").strip(),
            s3_bucket=os.environ.get("S3_BUCKET", "pisster-media"),
            s3_endpoint=(os.environ.get("S3_ENDPOINT") or "").strip() or None,
            queue_key=os.environ.get("PROMO_AD_QUEUE_KEY", "promo-ad:queue"),
            work_dir=os.environ.get("AD_GENERATOR_WORK_DIR", "/tmp/ad-generator"),
            downloads_dir=os.environ.get("DOWNLOADS_DIR", "/app/downloads"),
            bedrock_output_prefix=os.environ.get(
                "PROMO_AD_BEDROCK_OUTPUT_PREFIX",
                "s3://pisster-media/bedrock-reel-output/",
            ).rstrip("/") + "/",
            brand_lockup_path=os.environ.get(
                "PROMO_AD_BRAND_LOCKUP",
                "/app/public/brand/pisster-lockup.svg",
            ),
            intro_path=os.path.join(assets, "intro_1080p.mp4"),
            outro_path=os.path.join(assets, "outro_1080p.mp4"),
            fal_api_key=(os.environ.get("FAL_API_KEY") or "").strip() or None,
            runway_api_key=(os.environ.get("RUNWAY_API_KEY") or "").strip() or None,
            gemini_api_key=(os.environ.get("GEMINI_API_KEY") or "").strip() or None,
        )


CONFIG = Config.from_env()
