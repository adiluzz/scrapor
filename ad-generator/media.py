"""S3, local video paths, and FFmpeg helpers."""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

import boto3
from botocore.config import Config

from config import CONFIG
from watermark import DelogoRect, delogo_filter_chain, resolve_delogo_rects

log = logging.getLogger("ad-generator.media")

_s3 = None

TARGET_W = 1920
TARGET_H = 1080
TARGET_FPS = 24


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


def has_audio_stream(video_path: Path) -> bool:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    return "audio" in result.stdout


def _build_normalize_vf(
    duration: float,
    delogo_rects: list[DelogoRect],
    *,
    ken_burns: bool,
    fade_sec: float,
) -> str:
    """Video filter chain after optional delogo prefix."""
    fade_in = max(0.1, min(fade_sec, duration / 4))
    fade_out_start = max(fade_in, duration - fade_in)

    scale_pad = (
        f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=decrease,"
        f"pad={TARGET_W}:{TARGET_H}:(ow-iw)/2:(oh-ih)/2:black"
    )
    color = "eq=contrast=1.05:saturation=1.08,unsharp=3:3:0.4:3:3:0.0"
    fades = (
        f"fade=t=in:st=0:d={fade_in:.3f},"
        f"fade=t=out:st={fade_out_start:.3f}:d={fade_in:.3f}"
    )

    if ken_burns:
        frames = max(1, int(duration * TARGET_FPS))
        motion = (
            f"zoompan=z='min(1.0+0.0008*on,1.04)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={frames}:s={TARGET_W}x{TARGET_H}:fps={TARGET_FPS}"
        )
        core = f"{scale_pad},{color},{motion},{fades},format=yuv420p"
    else:
        core = f"{scale_pad},{color},{fades},fps={TARGET_FPS},format=yuv420p"

    delogo = delogo_filter_chain(delogo_rects)
    if delogo:
        return f"{delogo};[vout]{core}"
    return core


def normalize_segment(
    src: Path,
    dest: Path,
    start: float,
    end: float,
    *,
    source_site: str | None = None,
    remove_logos: bool = True,
    logo_removal_mode: str = "both",
    ken_burns: bool = False,
    fade_sec: float = 0.25,
    work_dir: Path | None = None,
) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.5, end - start)

    delogo_rects = resolve_delogo_rects(
        src,
        source_site,
        start,
        end,
        remove=remove_logos,
        mode=logo_removal_mode,
        work_dir=work_dir,
    )
    if delogo_rects:
        log.info(
            "watermark_zones video=%s site=%s zones=%s",
            src.name,
            source_site,
            [(r.x, r.y, r.w, r.h) for r in delogo_rects],
        )

    vf = _build_normalize_vf(duration, delogo_rects, ken_burns=ken_burns, fade_sec=fade_sec)
    run_ffmpeg([
        "-ss", str(max(0, start - 0.1)),
        "-i", str(src),
        "-t", str(duration + 0.2),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k",
        "-movflags", "+faststart",
        str(dest),
    ])
    return dest


def concat_with_xfade(
    segments: list[Path],
    out_path: Path,
    xfade_sec: float = 0.5,
) -> Path:
    if not segments:
        raise ValueError("No segments to concat")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if len(segments) == 1:
        out_path.write_bytes(segments[0].read_bytes())
        return out_path

    xfade_sec = max(0.1, min(xfade_sec, 1.5))
    durations = [probe_duration(s) for s in segments]
    all_have_audio = all(has_audio_stream(s) for s in segments)

    inputs: list[str] = []
    for seg in segments:
        inputs.extend(["-i", str(seg)])

    # Chain xfade for video
    v_filters: list[str] = []
    offset = durations[0] - xfade_sec
    v_prev = "[0:v]"
    for i in range(1, len(segments)):
        v_out = f"[vx{i}]" if i < len(segments) - 1 else "[vout]"
        v_filters.append(
            f"{v_prev}[{i}:v]xfade=transition=fade:duration={xfade_sec:.3f}:"
            f"offset={max(0, offset):.3f}{v_out}"
        )
        v_prev = v_out
        if i < len(segments) - 1:
            offset += durations[i] - xfade_sec

    filter_parts = v_filters

    if all_have_audio:
        a_filters: list[str] = []
        a_prev = "[0:a]"
        for i in range(1, len(segments)):
            a_out = f"[ax{i}]" if i < len(segments) - 1 else "[aout]"
            a_filters.append(f"{a_prev}[{i}:a]acrossfade=d={xfade_sec:.3f}{a_out}")
            a_prev = a_out
        filter_parts = v_filters + a_filters
        maps = ["-map", "[vout]", "-map", "[aout]"]
        audio_codec = ["-c:a", "aac", "-b:a", "128k"]
    else:
        maps = ["-map", "[vout]"]
        audio_codec = ["-an"]

    run_ffmpeg([
        *inputs,
        "-filter_complex", ";".join(filter_parts),
        *maps,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        *audio_codec,
        "-movflags", "+faststart",
        str(out_path),
    ])
    return out_path


def apply_body_bookends(body_path: Path, out_path: Path, fade_sec: float = 0.3) -> Path:
    """Short fade-in at start and fade-out at end of the composed body."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(body_path)
    if duration <= fade_sec * 2:
        out_path.write_bytes(body_path.read_bytes())
        return out_path

    fade_out_start = duration - fade_sec
    has_audio = has_audio_stream(body_path)
    vf = (
        f"fade=t=in:st=0:d={fade_sec:.3f},"
        f"fade=t=out:st={fade_out_start:.3f}:d={fade_sec:.3f},"
        f"format=yuv420p"
    )
    args = ["-i", str(body_path), "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "20"]
    if has_audio:
        af = f"afade=t=in:st=0:d={fade_sec:.3f},afade=t=out:st={fade_out_start:.3f}:d={fade_sec:.3f}"
        args.extend(["-af", af, "-c:a", "aac", "-b:a", "128k"])
    else:
        args.append("-an")
    args.extend(["-movflags", "+faststart", str(out_path)])
    run_ffmpeg(args)
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
