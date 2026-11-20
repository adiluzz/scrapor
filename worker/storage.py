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


def invalidate_hls(site_id, video_id) -> bool:
    """HLS segments are cached by path at CloudFront; drop them after re-packaging in place."""
    dist = os.environ.get("CLOUDFRONT_DISTRIBUTION_ID")
    if not dist:
        return False
    import time
    try:
        boto3.client("cloudfront", region_name="us-east-1").create_invalidation(
            DistributionId=dist,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": [f"/{key_hls_prefix(site_id, video_id)}*"]},
                "CallerReference": f"hls-{video_id}-{int(time.time() * 1000)}",
            },
        )
        return True
    except Exception:
        return False


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


def delete(key) -> bool:
    if not key:
        return False
    s3().delete_object(Bucket=_BUCKET, Key=key)
    return True


def _parse_hls_timeline(body: str) -> tuple[list[tuple[float, float, str]], float] | None:
    """
    Parse a VOD media playlist into [(start, end, name), ...] and total duration.
    Rejects playlists with path separators in segment URIs.
    """
    if not body.startswith("#EXTM3U"):
        return None
    lines = [l.strip() for l in body.splitlines() if l.strip()]
    entries: list[tuple[float, float, str]] = []
    t = 0.0
    pending_dur: float | None = None
    for line in lines:
        if line.startswith("#EXTINF:"):
            try:
                pending_dur = float(line[len("#EXTINF:"):].split(",", 1)[0])
            except ValueError:
                return None
            continue
        if line.startswith("#"):
            continue
        if "/" in line or ".." in line:
            return None
        if pending_dur is None:
            return None
        entries.append((t, t + pending_dur, line))
        t += pending_dur
        pending_dur = None
    if not entries:
        return None
    return entries, t


def _hls_segment_indices_for_window(
    entries: list[tuple[float, float, str]], start: float, end: float
) -> list[int]:
    """Indices of segments overlapping [start, end], plus one neighbor on each side."""
    idxs: list[int] = []
    for i, (s, e, _) in enumerate(entries):
        if e > start and s < end:
            idxs.append(i)
    if not idxs:
        # Fall back to the segment containing the midpoint.
        mid = (start + end) / 2
        for i, (s, e, _) in enumerate(entries):
            if s <= mid < e or (i == len(entries) - 1 and mid >= s):
                idxs = [i]
                break
    if not idxs:
        return []
    lo = max(0, idxs[0] - 1)
    hi = min(len(entries) - 1, idxs[-1] + 1)
    return list(range(lo, hi + 1))


def hls_playlist_duration(master_key: str) -> float | None:
    """Sum of #EXTINF on the media playlist, or None if unreadable."""
    if not master_key:
        return None
    try:
        body = s3().get_object(Bucket=_BUCKET, Key=master_key)["Body"].read().decode("utf-8")
    except Exception:
        return None
    parsed = _parse_hls_timeline(body)
    if not parsed:
        return None
    return float(parsed[1])


def fetch_hls_time_windows(
    master_key: str,
    midpoints: list[float],
    clip_sec: float,
    work_dir: str,
    workers: int = 8,
) -> list[str] | None:
    """
    Download only the HLS .ts segments covering each midpoint and extract a
    short mute clip per window. Returns local mp4 paths (same order as midpoints)
    or None if the playlist / downloads fail.
    """
    if not master_key or not midpoints:
        return None
    import subprocess
    from concurrent.futures import ThreadPoolExecutor

    try:
        body = s3().get_object(Bucket=_BUCKET, Key=master_key)["Body"].read().decode("utf-8")
    except Exception:
        return None
    parsed = _parse_hls_timeline(body)
    if not parsed:
        return None
    entries, _total = parsed
    prefix = master_key.rsplit("/", 1)[0] + "/"
    os.makedirs(work_dir, exist_ok=True)

    needed: set[str] = set()
    window_plan: list[tuple[float, list[int]]] = []
    half = max(0.05, clip_sec / 2)
    for mid in midpoints:
        start = max(0.0, mid - half)
        end = mid + half
        idxs = _hls_segment_indices_for_window(entries, start, end)
        if not idxs:
            return None
        window_plan.append((mid, idxs))
        for i in idxs:
            needed.add(entries[i][2])

    try:
        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            list(
                ex.map(
                    lambda n: s3().download_file(_BUCKET, prefix + n, os.path.join(work_dir, n)),
                    sorted(needed),
                )
            )
    except Exception:
        return None

    clips: list[str] = []
    for wi, (mid, idxs) in enumerate(window_plan):
        names = [entries[i][2] for i in idxs]
        win_start = entries[idxs[0]][0]
        local_start = max(0.0, mid - half - win_start)
        playlist = os.path.join(work_dir, f"win_{wi:02d}.m3u8")
        with open(playlist, "w", encoding="utf-8") as f:
            f.write("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n")
            f.write("#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n")
            for i in idxs:
                s, e, name = entries[i]
                f.write(f"#EXTINF:{e - s:.3f},\n{name}\n")
            f.write("#EXT-X-ENDLIST\n")
        clip_path = os.path.join(work_dir, f"preview_hls_{wi:02d}.mp4")
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-allowed_extensions", "ALL",
            "-i", playlist,
            "-ss", f"{local_start:.3f}",
            "-t", str(clip_sec),
            "-an", "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
            "-vf", "scale=480:-2:flags=lanczos",
            "-movflags", "+faststart", clip_path,
        ]
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=180, check=False)
        except Exception:
            return None
        if r.returncode != 0 or not os.path.exists(clip_path) or os.path.getsize(clip_path) < 500:
            return None
        clips.append(clip_path)
    return clips


def download_hls_as_mp4(master_key, dest_path, workers=16) -> bool:
    """Download HLS segments and remux (stream copy) into one faststart MP4."""
    if not master_key:
        return False
    import shutil
    import subprocess
    import tempfile
    from concurrent.futures import ThreadPoolExecutor

    prefix = master_key.rsplit("/", 1)[0] + "/"
    parent = os.path.dirname(os.path.abspath(dest_path)) or "."
    os.makedirs(parent, exist_ok=True)
    work = tempfile.mkdtemp(prefix=".hls-", dir=parent)
    try:
        body = s3().get_object(Bucket=_BUCKET, Key=master_key)["Body"].read().decode("utf-8")
        names = [l.strip() for l in body.splitlines() if l.strip() and not l.startswith("#")]
        if not body.startswith("#EXTM3U") or not names:
            return False
        if any("/" in n or ".." in n for n in names):
            return False
        with open(os.path.join(work, "master.m3u8"), "w") as f:
            f.write(body)
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(lambda n: s3().download_file(_BUCKET, prefix + n, os.path.join(work, n)), names))
        out = os.path.join(work, "out.mp4")
        r = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-allowed_extensions", "ALL",
             "-i", os.path.join(work, "master.m3u8"),
             "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart", out],
            capture_output=True, timeout=1800, check=False,
        )
        if r.returncode != 0 or not os.path.exists(out) or os.path.getsize(out) == 0:
            return False
        os.replace(out, dest_path)
        return True
    except Exception:
        return False
    finally:
        shutil.rmtree(work, ignore_errors=True)


def object_size(key):
    """Content length in bytes, or None if missing / not readable."""
    if not key:
        return None
    try:
        return int(s3().head_object(Bucket=_BUCKET, Key=key)["ContentLength"])
    except Exception:
        return None


def probe_remote_duration(key):
    """Duration in seconds of a stored media object via ffprobe on a presigned URL."""
    import subprocess
    try:
        url = s3().generate_presigned_url(
            "get_object", Params={"Bucket": _BUCKET, "Key": key}, ExpiresIn=600
        )
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", url],
            capture_output=True, text=True, timeout=120, check=False,
        )
        return float(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip() else None
    except Exception:
        return None


def verify_hls(master_key, duration_sec=None, mp4_key=None):
    """
    Return (ok, reason). Complete VOD playlist, first/last segment present, and
    playlist length matching the stored MP4 (DB duration first, ffprobe on mismatch).
    """
    try:
        body = s3().get_object(Bucket=_BUCKET, Key=master_key)["Body"].read().decode("utf-8")
    except Exception as e:  # noqa: BLE001
        return False, f"master_unreadable:{type(e).__name__}"
    if not body.startswith("#EXTM3U"):
        return False, "master_not_m3u8"
    if "#EXT-X-ENDLIST" not in body:
        return False, "master_no_endlist"
    lines = [l.strip() for l in body.splitlines() if l.strip()]
    names = [l for l in lines if not l.startswith("#")]
    if not names:
        return False, "master_no_segments"
    if any("/" in n or ".." in n for n in names):
        return False, "master_unexpected_uri"
    total = 0.0
    for l in lines:
        if l.startswith("#EXTINF:"):
            try:
                total += float(l[len("#EXTINF:"):].split(",", 1)[0])
            except ValueError:
                return False, "master_bad_extinf"
    if not duration_sec or abs(total - duration_sec) > max(5.0, 0.02 * duration_sec):
        actual = probe_remote_duration(mp4_key) if mp4_key else None
        if actual is None:
            return False, f"duration_unverified:{total:.1f}vs{duration_sec}"
        if abs(total - actual) > max(2.0, 0.01 * actual):
            return False, f"duration_mismatch:{total:.1f}vs{actual:.1f}"
    prefix = master_key.rsplit("/", 1)[0] + "/"
    for n in {names[0], names[-1]}:
        size = object_size(prefix + n)
        if not size:
            return False, f"segment_missing:{n}"
    return True, "ok"


def download_source(site_id, video_id, s3_video_key, s3_hls_master_key, dest_path) -> bool:
    """Full source video to dest_path: stored MP4, else remuxed from HLS."""
    if s3_video_key and download(s3_video_key, dest_path):
        return True
    return download_hls_as_mp4(s3_hls_master_key, dest_path)
