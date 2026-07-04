"""S3, local video paths, and FFmpeg helpers."""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

import boto3
from botocore.config import Config

from config import CONFIG

log = logging.getLogger("ad-generator.media")

_s3 = None


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


def video_s3_key(site_id: str, video_id: str) -> str:
    return f"sites/{site_id}/videos/{video_id}/video.mp4"


def promo_ad_s3_key(site_id: str, ad_id: str, iteration_number: int) -> str:
    return f"sites/{site_id}/promo-ads/{ad_id}/iter-{iteration_number}.mp4"


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


def upload_file(local_path: Path, s3_key: str) -> None:
    s3_client().upload_file(
        str(local_path),
        CONFIG.s3_bucket,
        s3_key,
        ExtraArgs={"ContentType": "video/mp4"},
    )


def run_ffmpeg(args: list[str], timeout: int = 900) -> None:
    cmd = ["ffmpeg", "-y", *args]
    subprocess.run(cmd, capture_output=True, timeout=timeout, check=True)


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


def normalize_segment(src: Path, dest: Path, start: float, end: float) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.5, end - start)
    run_ffmpeg([
        "-ss", str(max(0, start - 0.1)),
        "-i", str(src),
        "-t", str(duration + 0.2),
        "-vf",
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=24,format=yuv420p",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k",
        "-movflags", "+faststart",
        str(dest),
    ])
    return dest


def concat_with_xfade(segments: list[Path], out_path: Path, xfade_sec: float = 0.6) -> Path:
    if not segments:
        raise ValueError("No segments to concat")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if len(segments) == 1:
        out_path.write_bytes(segments[0].read_bytes())
        return out_path

    # Build filter_complex for xfade chain
    inputs: list[str] = []
    for seg in segments:
        inputs.extend(["-i", str(seg)])

    filters = []
    offset = probe_duration(segments[0]) - xfade_sec
    last = "[0:v][0:a]"
    for i in range(1, len(segments)):
        v_out = f"[v{i}]" if i < len(segments) - 1 else "[vout]"
        a_out = f"[a{i}]" if i < len(segments) - 1 else "[aout]"
        filters.append(
            f"{last}[{i}:v][{i}:a]xfade=transition=fade:duration={xfade_sec}:offset={max(0, offset):.3f}{v_out}{a_out}"
        )
        last = f"{v_out}{a_out}"
        if i < len(segments) - 1:
            offset += probe_duration(segments[i]) - xfade_sec

    # Simpler approach: concat demuxer with re-encode if xfade too complex
    list_file = out_path.parent / "concat.txt"
    list_file.write_text("\n".join(f"file '{s.resolve()}'" for s in segments))
    run_ffmpeg([
        "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-movflags", "+faststart",
        str(out_path),
    ])
    return out_path


def concat_simple(parts: list[Path], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    list_file = out_path.parent / "concat.txt"
    list_file.write_text("\n".join(f"file '{p.resolve()}'" for p in parts))
    run_ffmpeg([
        "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy",
        "-movflags", "+faststart",
        str(out_path),
    ])
    return out_path


def extract_frame(video_path: Path, out_path: Path, at_sec: float = 0.5) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg([
        "-ss", str(at_sec),
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "3",
        str(out_path),
    ], timeout=120)
    return out_path


def overlay_logo(
    video_path: Path,
    out_path: Path,
    logo_path: Path,
    position: str = "bottom-right",
    opacity: float = 0.85,
) -> Path:
    margin = 24
    positions = {
        "top-left": f"{margin}:{margin}",
        "top-right": f"W-w-{margin}:{margin}",
        "bottom-left": f"{margin}:H-h-{margin}",
        "bottom-right": f"W-w-{margin}:H-h-{margin}",
    }
    xy = positions.get(position, positions["bottom-right"])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg([
        "-i", str(video_path),
        "-i", str(logo_path),
        "-filter_complex",
        f"[1:v]format=rgba,colorchannelmixer=aa={opacity}[logo];"
        f"[0:v][logo]overlay={xy}:format=auto,format=yuv420p",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(out_path),
    ])
    return out_path
