"""Resolve Bedrock inference profile IDs from foundation model IDs + region."""

from __future__ import annotations

import re

_PROFILE_PREFIX = re.compile(r"^(us|eu|jp|apac|global)\.")


def bedrock_geo_prefix(region: str) -> str:
    r = region.lower()
    if r.startswith("eu-"):
        return "eu"
    if r.startswith("ap-northeast"):
        return "jp"
    if r.startswith("ap-"):
        return "apac"
    return "us"


def is_inference_profile_id(model_id: str) -> bool:
    return bool(_PROFILE_PREFIX.match(model_id.strip()))


def resolve_bedrock_inference_model_id(model_id: str, region: str = "us-east-1") -> str:
    trimmed = model_id.strip()
    if not trimmed or is_inference_profile_id(trimmed):
        return trimmed
    prefix = bedrock_geo_prefix(region)
    if trimmed.startswith("amazon.") or trimmed.startswith("twelvelabs."):
        return f"{prefix}.{trimmed}"
    return trimmed
