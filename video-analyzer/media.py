"""S3, local video paths, and FFmpeg helpers."""

from __future__ import annotations

import base64
import logging
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import boto3
from botocore.config import Config

from config import CONFIG

log = logging.getLogger("video-analyzer.media")

_s3 = None
_bedrock = None


def s3_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            region_name=CONFIG.aws_region,
            endpoint_url=CONFIG.s3_endpoint,
            config=Config(s3={"addressing_style": "path" if CONFIG.s3_endpoint else "auto"}),
        )
    return _s3


def bedrock_client():
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client("bedrock-runtime", region_name=CONFIG.aws_region)
    return _bedrock


def video_s3_key(site_id: str, video_id: str) -> str:
    return f"sites/{site_id}/videos/{video_id}/video.mp4"


def video_s3_uri(site_id: str, video_id: str) -> str:
    return f"s3://{CONFIG.s3_bucket}/{video_s3_key(site_id, video_id)}"


def presign_video_url(site_id: str, video_id: str, expires: int = 3600) -> str:
    return s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": CONFIG.s3_bucket, "Key": video_s3_key(site_id, video_id)},
        ExpiresIn=expires,
    )


def local_video_path(video_id: str) -> Path | None:
    candidates = [
        Path(CONFIG.downloads_dir) / video_id / "video.mp4",
        Path(CONFIG.downloads_dir) / f"{video_id}.mp4",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def download_video(site_id: str, video_id: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    local = local_video_path(video_id)
    if local:
        dest.write_bytes(local.read_bytes())
        return True
    if not os.environ.get("AWS_ACCESS_KEY_ID"):
        return False
    try:
        s3_client().download_file(CONFIG.s3_bucket, video_s3_key(site_id, video_id), str(dest))
        return dest.exists()
    except Exception as e:  # noqa: BLE001
        log.warning("s3_download_failed video_id=%s err=%s", video_id, e)
        return False


def probe_duration(video_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def cut_chunk(video_path: Path, out_path: Path, start_sec: float, duration_sec: float) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", str(start_sec),
            "-i", str(video_path),
            "-t", str(duration_sec),
            "-c", "copy",
            "-movflags", "+faststart",
            str(out_path),
        ],
        capture_output=True,
        timeout=600,
        check=True,
    )
    return out_path


def extract_frame_jpeg(video_path: Path, out_path: Path, at_sec: float) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", str(at_sec),
            "-i", str(video_path),
            "-frames:v", "1",
            "-q:v", "3",
            str(out_path),
        ],
        capture_output=True,
        timeout=120,
        check=True,
    )
    return out_path


def read_base64(path: Path, max_bytes: int = 25 * 1024 * 1024) -> str:
    data = path.read_bytes()
    if len(data) > max_bytes:
        raise ValueError(f"File too large for base64 upload: {len(data)} bytes")
    return base64.b64encode(data).decode("ascii")


@dataclass
class MediaSource:
    kind: Literal["s3", "url", "base64", "path"]
    s3_uri: str | None = None
    url: str | None = None
    base64_data: str | None = None
    path: Path | None = None
    bucket_owner: str | None = None
    chunk_start_sec: float = 0.0
    chunk_duration_sec: float = 0.0


def resolve_media_source(
    site_id: str,
    video_id: str,
    work_dir: Path,
    chunk_start: float,
    chunk_duration: float,
) -> MediaSource:
    """Resolve how to pass a video chunk to a model."""
    if CONFIG.bedrock_s3_available():
        return MediaSource(
            kind="s3",
            s3_uri=video_s3_uri(site_id, video_id),
            bucket_owner=CONFIG.aws_account_id or None,
            chunk_start_sec=chunk_start,
            chunk_duration_sec=chunk_duration,
        )

    cache = work_dir / f"{video_id}.mp4"
    if not cache.exists():
        if not download_video(site_id, video_id, cache):
            raise FileNotFoundError(f"Cannot resolve video {video_id}")

    chunk_path = work_dir / video_id / f"chunk_{int(chunk_start)}.mp4"
    if not chunk_path.exists():
        cut_chunk(cache, chunk_path, chunk_start, chunk_duration)

    if os.environ.get("AWS_ACCESS_KEY_ID"):
        try:
            url = presign_video_url(site_id, video_id)
            return MediaSource(
                kind="url",
                url=url,
                path=chunk_path,
                chunk_start_sec=chunk_start,
                chunk_duration_sec=chunk_duration,
            )
        except Exception as e:  # noqa: BLE001
            log.warning("presign_failed video_id=%s err=%s", video_id, e)

    if chunk_path.stat().st_size <= 25 * 1024 * 1024:
        return MediaSource(
            kind="base64",
            base64_data=read_base64(chunk_path),
            path=chunk_path,
            chunk_start_sec=chunk_start,
            chunk_duration_sec=chunk_duration,
        )

    return MediaSource(
        kind="path",
        path=chunk_path,
        chunk_start_sec=chunk_start,
        chunk_duration_sec=chunk_duration,
    )
