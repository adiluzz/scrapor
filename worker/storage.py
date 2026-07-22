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
def key_hls_master(site_id, video_id):     return f"sites/{site_id}/videos/{video_id}/hls/master.m3u8"
def key_hls_prefix(site_id, video_id):     return f"sites/{site_id}/videos/{video_id}/hls/"
def key_pornstar_image(site_id, pornstar_id): return f"sites/{site_id}/pornstars/{pornstar_id}/image.jpg"


def resolve_video_key(site_id, video_id, s3_video_key=None):
    """Match src/lib/storage.ts resolveVideoStorageKey."""
    return s3_video_key or key_video(site_id, video_id)


def object_exists(key) -> bool:
    if not key:
        return False
    try:
        s3().head_object(Bucket=_BUCKET, Key=key)
        return True
    except Exception:
        return False


def upload(local_path, key, content_type):
    if not os.path.exists(local_path):
        return None
    s3().upload_file(local_path, _BUCKET, key, ExtraArgs={"ContentType": content_type})
    return key


def upload_hls_dir(local_dir, site_id, video_id):
    """Upload HLS master + segments. Returns master S3 key or None."""
    if not os.path.isdir(local_dir):
        return None
    prefix = key_hls_prefix(site_id, video_id)
    master_key = None
    for name in sorted(os.listdir(local_dir)):
        path = os.path.join(local_dir, name)
        if not os.path.isfile(path):
            continue
        key = prefix + name
        if name.endswith(".m3u8"):
            content_type = "application/vnd.apple.mpegurl"
        elif name.endswith(".ts"):
            content_type = "video/mp2t"
        else:
            continue
        uploaded = upload(path, key, content_type)
        if name == "master.m3u8" and uploaded:
            master_key = uploaded
    return master_key


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
