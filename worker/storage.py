"""S3 upload helpers for the worker (Python side of the storage layer)."""

import os
import boto3
from botocore.config import Config

_BUCKET = os.environ.get("S3_BUCKET", "pisster-media")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_ENDPOINT = os.environ.get("S3_ENDPOINT") or None

_client = None


def s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            region_name=_REGION,
            endpoint_url=_ENDPOINT,
            config=Config(s3={"addressing_style": "path" if _ENDPOINT else "auto"}),
        )
    return _client


def configured() -> bool:
    return bool(os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY"))


# Key layout — must match src/lib/storage.ts s3Keys.
def key_video(site_id, video_id):        return f"sites/{site_id}/videos/{video_id}/video.mp4"
def key_thumb(site_id, video_id):        return f"sites/{site_id}/videos/{video_id}/thumbnail.jpg"
def key_preview(site_id, video_id):      return f"sites/{site_id}/videos/{video_id}/preview.mp4"
def key_storyboard(site_id, video_id):   return f"sites/{site_id}/videos/{video_id}/storyboard.jpg"
def key_storyboard_vtt(site_id, video_id): return f"sites/{site_id}/videos/{video_id}/storyboard.vtt"
def key_pornstar_image(site_id, pornstar_id): return f"sites/{site_id}/pornstars/{pornstar_id}/image.jpg"


def upload(local_path, key, content_type):
    if not os.path.exists(local_path):
        return None
    s3().upload_file(local_path, _BUCKET, key, ExtraArgs={"ContentType": content_type})
    return key


def download(key, dest_path):
    """Download an S3 object to a local path. Returns True on success."""
    if not key:
        return False
    try:
        os.makedirs(os.path.dirname(os.path.abspath(dest_path)) or ".", exist_ok=True)
        s3().download_file(_BUCKET, key, dest_path)
        return os.path.exists(dest_path) and os.path.getsize(dest_path) > 0
    except Exception:
        return False
