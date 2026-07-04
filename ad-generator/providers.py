"""Generative video provider adapters."""

from __future__ import annotations

import base64
import json
import logging
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import boto3
import httpx
from botocore.config import Config

from config import CONFIG

log = logging.getLogger("ad-generator.providers")


class VideoProvider(ABC):
    @abstractmethod
    def generate(
        self,
        prompt: str,
        duration_seconds: int,
        model_id: str,
        model_params: dict[str, Any],
        ref_image_path: Path | None,
        work_dir: Path,
    ) -> tuple[Path, str | None, float | None]:
        """Return (local_mp4_path, provider_job_id, actual_cost_usd)."""


class BedrockReelProvider(VideoProvider):
    def __init__(self) -> None:
        self._client = boto3.client(
            "bedrock-runtime",
            region_name=CONFIG.aws_region,
            config=Config(read_timeout=900, connect_timeout=60, retries={"max_attempts": 3}),
        )

    def generate(
        self,
        prompt: str,
        duration_seconds: int,
        model_id: str,
        model_params: dict[str, Any],
        ref_image_path: Path | None,
        work_dir: Path,
    ) -> tuple[Path, str | None, float | None]:
        duration = max(6, min(120, int(duration_seconds)))
        duration = (duration // 6) * 6
        task_type = model_params.get("taskType") or (
            "MULTI_SHOT_AUTOMATED" if duration > 6 else "TEXT_VIDEO"
        )
        seed = int(model_params.get("seed") or 0)

        text_params: dict[str, Any] = {"text": prompt[:4000], "seed": seed}
        if ref_image_path and ref_image_path.exists():
            img_b64 = base64.b64encode(ref_image_path.read_bytes()).decode("ascii")
            text_params["images"] = [
                {"format": "png", "source": {"bytes": img_b64}}
            ]

        model_input = {
            "taskType": task_type,
            "textToVideoParams": text_params,
            "videoGenerationConfig": {
                "durationSeconds": duration,
                "fps": 24,
                "dimension": "1280x720",
            },
        }

        output_uri = f"{CONFIG.bedrock_output_prefix}{work_dir.name}/"
        resp = self._client.start_async_invoke(
            modelId="amazon.nova-reel-v1:1",
            modelInput=model_input,
            outputDataConfig={"s3OutputDataConfig": {"s3Uri": output_uri}},
        )
        invocation_arn = resp.get("invocationArn", "")
        log.info("bedrock_reel_started arn=%s duration=%s", invocation_arn, duration)

        for _ in range(360):
            status_resp = self._client.get_async_invoke(invocationArn=invocation_arn)
            status = status_resp.get("status")
            if status == "Completed":
                out_path = self._fetch_output(output_uri, work_dir)
                cost = round(duration * 0.08, 4)
                return out_path, invocation_arn, cost
            if status == "Failed":
                raise RuntimeError(status_resp.get("failureMessage", "Bedrock job failed"))
            time.sleep(5)

        raise TimeoutError("Bedrock Nova Reel timed out")

    def _fetch_output(self, output_uri: str, work_dir: Path) -> Path:
        # output_uri like s3://bucket/prefix/job/
        if not output_uri.startswith("s3://"):
            raise ValueError(f"Invalid output URI: {output_uri}")
        parts = output_uri[5:].split("/", 1)
        bucket = parts[0]
        prefix = parts[1] if len(parts) > 1 else ""

        s3 = boto3.client("s3", region_name=CONFIG.aws_region, endpoint_url=CONFIG.s3_endpoint)
        listed = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        keys = [o["Key"] for o in listed.get("Contents", []) if o["Key"].endswith(".mp4")]
        if not keys:
            raise FileNotFoundError(f"No MP4 in Bedrock output prefix {prefix}")

        dest = work_dir / "bedrock_output.mp4"
        s3.download_file(bucket, keys[0], str(dest))
        return dest


class FalProvider(VideoProvider):
    MODEL_ENDPOINTS = {
        "kling-3-standard": "fal-ai/kling-video/v3/standard/text-to-video",
        "kling-3-pro": "fal-ai/kling-video/v3/pro/text-to-video",
        "seedance-2": "fal-ai/bytedance/seedance/v1/pro/text-to-video",
    }

    def generate(
        self,
        prompt: str,
        duration_seconds: int,
        model_id: str,
        model_params: dict[str, Any],
        ref_image_path: Path | None,
        work_dir: Path,
    ) -> tuple[Path, str | None, float | None]:
        if not CONFIG.fal_api_key:
            raise RuntimeError("FAL_API_KEY not configured")

        endpoint = self.MODEL_ENDPOINTS.get(model_id)
        if not endpoint:
            raise ValueError(f"Unsupported fal model: {model_id}")

        duration = max(3, min(15, int(duration_seconds)))
        audio = model_params.get("audioEnabled", False)
        payload: dict[str, Any] = {
            "prompt": prompt,
            "duration": str(duration),
            "aspect_ratio": "16:9",
        }
        if audio:
            payload["generate_audio"] = True

        headers = {"Authorization": f"Key {CONFIG.fal_api_key}"}
        with httpx.Client(timeout=600) as client:
            submit = client.post(
                f"https://queue.fal.run/{endpoint}",
                headers=headers,
                json=payload,
            )
            submit.raise_for_status()
            data = submit.json()
            request_id = data.get("request_id")
            status_url = data.get("status_url") or f"https://queue.fal.run/{endpoint}/requests/{request_id}/status"
            response_url = data.get("response_url") or f"https://queue.fal.run/{endpoint}/requests/{request_id}"

            for _ in range(180):
                st = client.get(status_url, headers=headers)
                st.raise_for_status()
                st_data = st.json()
                if st_data.get("status") == "COMPLETED":
                    result = client.get(response_url, headers=headers)
                    result.raise_for_status()
                    video_url = result.json().get("video", {}).get("url")
                    if not video_url:
                        raise RuntimeError("fal response missing video url")
                    return self._download(video_url, work_dir), request_id, None
                if st_data.get("status") in ("FAILED", "ERROR"):
                    raise RuntimeError(str(st_data))
                time.sleep(4)

        raise TimeoutError("fal.ai job timed out")

    def _download(self, url: str, work_dir: Path) -> Path:
        dest = work_dir / "fal_output.mp4"
        with httpx.Client(timeout=300, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            dest.write_bytes(r.content)
        return dest


class RunwayProvider(VideoProvider):
    MODEL_MAP = {
        "runway-gen4-turbo": "gen4_turbo",
        "runway-gen4-5": "gen4.5",
    }

    def generate(
        self,
        prompt: str,
        duration_seconds: int,
        model_id: str,
        model_params: dict[str, Any],
        ref_image_path: Path | None,
        work_dir: Path,
    ) -> tuple[Path, str | None, float | None]:
        if not CONFIG.runway_api_key:
            raise RuntimeError("RUNWAY_API_KEY not configured")

        runway_model = self.MODEL_MAP.get(model_id)
        if not runway_model:
            raise ValueError(f"Unsupported runway model: {model_id}")

        duration = max(2, min(10, int(duration_seconds)))
        headers = {
            "Authorization": f"Bearer {CONFIG.runway_api_key}",
            "X-Runway-Version": "2024-11-06",
            "Content-Type": "application/json",
        }
        payload = {
            "model": runway_model,
            "promptText": prompt,
            "duration": duration,
            "ratio": "1280:720",
        }

        with httpx.Client(timeout=600) as client:
            resp = client.post(
                "https://api.dev.runwayml.com/v1/text_to_video",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            task_id = resp.json().get("id")
            if not task_id:
                raise RuntimeError("Runway response missing task id")

            for _ in range(180):
                poll = client.get(
                    f"https://api.dev.runwayml.com/v1/tasks/{task_id}",
                    headers=headers,
                )
                poll.raise_for_status()
                data = poll.json()
                status = data.get("status")
                if status == "SUCCEEDED":
                    outputs = data.get("output") or []
                    if not outputs:
                        raise RuntimeError("Runway succeeded but no output")
                    return self._download(outputs[0], work_dir), task_id, None
                if status in ("FAILED", "CANCELLED"):
                    raise RuntimeError(data.get("failure", "Runway task failed"))
                time.sleep(4)

        raise TimeoutError("Runway job timed out")

    def _download(self, url: str, work_dir: Path) -> Path:
        dest = work_dir / "runway_output.mp4"
        with httpx.Client(timeout=300, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            dest.write_bytes(r.content)
        return dest


class GeminiVeoProvider(VideoProvider):
    MODEL_MAP = {
        "veo-3-1-lite": "veo-3.1-lite-preview",
        "veo-3-1-fast": "veo-3.1-fast-preview",
        "veo-3-1-standard": "veo-3.1-generate-preview",
    }

    def generate(
        self,
        prompt: str,
        duration_seconds: int,
        model_id: str,
        model_params: dict[str, Any],
        ref_image_path: Path | None,
        work_dir: Path,
    ) -> tuple[Path, str | None, float | None]:
        if not CONFIG.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")

        veo_model = self.MODEL_MAP.get(model_id)
        if not veo_model:
            raise ValueError(f"Unsupported gemini model: {model_id}")

        duration = max(4, min(8, int(duration_seconds)))
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{veo_model}:predictLongRunning"
            f"?key={CONFIG.gemini_api_key}"
        )
        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {"durationSeconds": duration, "aspectRatio": "16:9"},
        }

        with httpx.Client(timeout=600) as client:
            start = client.post(url, json=payload)
            start.raise_for_status()
            op_name = start.json().get("name")
            if not op_name:
                raise RuntimeError("Gemini Veo missing operation name")

            poll_url = (
                f"https://generativelanguage.googleapis.com/v1beta/{op_name}"
                f"?key={CONFIG.gemini_api_key}"
            )
            for _ in range(180):
                poll = client.get(poll_url)
                poll.raise_for_status()
                data = poll.json()
                if data.get("done"):
                    response = data.get("response", {})
                    videos = response.get("generatedVideos") or response.get("videos") or []
                    if not videos:
                        raise RuntimeError("Gemini Veo completed without video")
                    video_uri = videos[0].get("uri") or videos[0].get("video", {}).get("uri")
                    if not video_uri:
                        raise RuntimeError("Gemini Veo missing video URI")
                    return self._download(video_uri, work_dir), op_name, None
                time.sleep(5)

        raise TimeoutError("Gemini Veo job timed out")

    def _download(self, url: str, work_dir: Path) -> Path:
        dest = work_dir / "gemini_output.mp4"
        with httpx.Client(timeout=300, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            dest.write_bytes(r.content)
        return dest


def get_provider(model_id: str) -> VideoProvider:
    if model_id == "nova-reel-1-1":
        return BedrockReelProvider()
    if model_id in FalProvider.MODEL_ENDPOINTS:
        return FalProvider()
    if model_id in RunwayProvider.MODEL_MAP:
        return RunwayProvider()
    if model_id in GeminiVeoProvider.MODEL_MAP:
        return GeminiVeoProvider()
    raise ValueError(f"No provider for model {model_id}")
