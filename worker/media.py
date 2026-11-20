"""ffmpeg media generation: preview clip, static thumbnail, storyboard sprite + VTT."""

import json
import math
import os
import subprocess
import urllib.request

# ── Web playback ───────────────────────────────────────────────────────
GOP_SEC = 2.0
HLS_SEGMENT_SEC = 2.0

# ── Preview (grid hover) ──────────────────────────────────────────────
# v4: evenly spaced windows; count scales with duration (min 8, max 20).
PREVIEW_VERSION = 4
PREVIEW_MIN_SEGMENTS = 8
PREVIEW_MAX_SEGMENTS = 20
PREVIEW_SEGMENT_SEC = 0.5
PREVIEW_SEC_PER_WINDOW = 120  # one window per 2 minutes of source
PREVIEW_SPAN_START = 0.10
PREVIEW_SPAN_END = 0.85
PREVIEW_MAX_WIDTH = 480
# Minimum montage length (8 × 0.5s); longer sources get more windows.
PREVIEW_TARGET_SEC = PREVIEW_MIN_SEGMENTS * PREVIEW_SEGMENT_SEC

# ── Storyboard (player scrub) ─────────────────────────────────────────
STORYBOARD_COLS = 5
STORYBOARD_MAX_TILES = 100
STORYBOARD_TILE_W = 160
STORYBOARD_TILE_H = 90


def probe_duration(video_path: str) -> int:
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", video_path],
            capture_output=True, text=True, timeout=60,
        )
        return int(float(json.loads(r.stdout)["format"]["duration"]))
    except Exception:
        return 0


def transcode_to_mp4(src: str, dest: str, timeout=7200) -> bool:
    """
    Normalize an arbitrary uploaded file (mov/webm/avi/mp4/...) into a
    web-friendly, streamable MP4 (H.264 + AAC, faststart, ~2s keyframes).
    Returns True on success. Callers should fall back to the raw source if
    this fails.
    """
    cmd = [
        "ffmpeg", "-y", "-i", src,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-force_key_frames", f"expr:gte(t,n_forced*{GOP_SEC})",
        "-g", "120", "-keyint_min", "24", "-sc_threshold", "0",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", dest,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return r.returncode == 0 and os.path.exists(dest) and os.path.getsize(dest) > 10_000
    except Exception:
        return False


def package_hls_from_mp4(src: str, out_dir: str, segment_sec: float = HLS_SEGMENT_SEC, timeout=7200) -> bool:
    """
    Package a normalized MP4 into VOD HLS (master.m3u8 + MPEG-TS segments).
    Expects src to already have regular keyframes (~segment_sec apart).
    """
    os.makedirs(out_dir, exist_ok=True)
    master = os.path.join(out_dir, "master.m3u8")
    seg_pattern = os.path.join(out_dir, "seg_%04d.ts")
    cmd = [
        "ffmpeg", "-y", "-i", src,
        "-c", "copy",
        "-bsf:v", "h264_mp4toannexb",
        "-hls_time", str(segment_sec),
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", seg_pattern,
        master,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return (
            r.returncode == 0
            and os.path.exists(master)
            and os.path.getsize(master) > 20
        )
    except Exception:
        return False


def preview_window_count(duration: int) -> int:
    """How many 0.5s snippets for a source of the given length (min 8, max 20)."""
    if duration <= 0:
        return PREVIEW_MIN_SEGMENTS
    return min(
        PREVIEW_MAX_SEGMENTS,
        max(PREVIEW_MIN_SEGMENTS, duration // PREVIEW_SEC_PER_WINDOW),
    )


def preview_sample_times(duration: int, count: int | None = None) -> list[float]:
    """
    Evenly spaced sample midpoints across 10%–85% of the timeline.
    Skips intro/outro; always returns `count` points when duration allows.
    """
    if duration <= 0:
        return []
    n = count if count is not None else preview_window_count(duration)
    if n <= 0:
        return []
    if duration < PREVIEW_TARGET_SEC:
        return [min(duration - 0.1, max(0.0, duration * 0.5))]

    span_start = duration * PREVIEW_SPAN_START
    span_end = duration * PREVIEW_SPAN_END
    if span_end <= span_start:
        span_start = 0.0
        span_end = float(duration)
    span = span_end - span_start
    if n == 1:
        return [min(duration - 0.1, span_start + span / 2)]
    step = span / n
    return [min(duration - 0.1, span_start + step * (i + 0.5)) for i in range(n)]


def _extract_preview_segment(
    video_path: str, start: float, dest: str, timeout: int
) -> bool:
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{max(0.0, start):.3f}", "-i", video_path,
        "-t", str(PREVIEW_SEGMENT_SEC),
        "-vf", f"scale={PREVIEW_MAX_WIDTH}:-2:flags=lanczos",
        "-an", "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
        "-movflags", "+faststart", dest,
    ]
    try:
        ok = subprocess.run(cmd, capture_output=True, timeout=timeout).returncode == 0
        return ok and os.path.exists(dest) and os.path.getsize(dest) > 500
    except Exception:
        return False


def _fallback_preview_clip(video_path: str, dest: str, duration: int, timeout: int) -> bool:
    """Single short clip from ~10% into the video (YouTube-style fallback)."""
    start = max(0.0, duration * 0.1)
    clip_len = min(PREVIEW_TARGET_SEC, max(1.0, float(duration) * 0.5))
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start:.3f}", "-i", video_path,
        "-t", str(clip_len),
        "-vf", f"scale={PREVIEW_MAX_WIDTH}:-2:flags=lanczos",
        "-an", "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
        "-movflags", "+faststart", dest,
    ]
    try:
        return subprocess.run(cmd, capture_output=True, timeout=timeout).returncode == 0
    except Exception:
        return False


def _concat_preview_segments(
    segments: list[str], dest: str, target_sec: float, timeout: int
) -> bool:
    if not segments:
        return False
    list_path = os.path.join(os.path.dirname(os.path.abspath(dest)) or ".", "preview_concat.txt")
    try:
        with open(list_path, "w", encoding="utf-8") as f:
            for path in segments:
                f.write(f"file '{path}'\n")
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path,
            "-t", str(target_sec),
            "-an", "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
            "-movflags", "+faststart", dest,
        ]
        return subprocess.run(cmd, capture_output=True, timeout=timeout).returncode == 0
    except Exception:
        return False
    finally:
        try:
            os.remove(list_path)
        except OSError:
            pass


def assemble_preview_clips(
    clips: list[str], dest: str, timeout: int = 1800
) -> bool:
    """Concat pre-extracted mute clips into the final hover preview."""
    if not clips:
        return False
    target_sec = len(clips) * PREVIEW_SEGMENT_SEC
    ok = _concat_preview_segments(clips, dest, target_sec, timeout)
    return ok and os.path.exists(dest) and os.path.getsize(dest) > 10_000


def make_preview(
    video_path: str,
    dest: str,
    duration: int = 0,
    force: bool = False,
    timeout: int = 1800,
    sample_times: list[float] | None = None,
) -> bool:
    """
    Muted grid-hover preview: evenly spaced montage.

    v4: N × 0.5s windows (N = min(20, max(8, duration//120))), width ≤480px,
    sampled across 10%–85% of the source. Pass sample_times when the caller
    already resolved seek points (e.g. HLS window fetch).
    """
    if not force and os.path.exists(dest) and os.path.getsize(dest) > 10_000:
        return True

    if duration <= 0:
        duration = probe_duration(video_path)
    if duration <= 0:
        return False

    if duration < PREVIEW_TARGET_SEC:
        return _fallback_preview_clip(video_path, dest, duration, timeout)

    times = sample_times if sample_times is not None else preview_sample_times(duration)
    if not times:
        return _fallback_preview_clip(video_path, dest, duration, timeout)

    tmp_dir = os.path.dirname(os.path.abspath(dest)) or "."
    segments: list[str] = []
    ok = False
    try:
        for i, midpoint in enumerate(times):
            seg_path = os.path.join(tmp_dir, f"preview_seg_{i:02d}.mp4")
            start = max(0.0, midpoint - PREVIEW_SEGMENT_SEC / 2)
            if _extract_preview_segment(video_path, start, seg_path, timeout):
                segments.append(seg_path)

        if not segments:
            return _fallback_preview_clip(video_path, dest, duration, timeout)

        target_sec = len(segments) * PREVIEW_SEGMENT_SEC
        ok = _concat_preview_segments(segments, dest, target_sec, timeout)
    finally:
        for path in segments:
            try:
                os.remove(path)
            except OSError:
                pass

    if ok and os.path.exists(dest) and os.path.getsize(dest) > 10_000:
        return True
    return _fallback_preview_clip(video_path, dest, duration, timeout)


def make_thumbnail(video_path: str, dest: str, thumbnail_url: str = "", at_sec: int = 5) -> bool:
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return True
    if thumbnail_url.startswith("http"):
        try:
            req = urllib.request.Request(thumbnail_url, headers={
                "User-Agent": "Mozilla/5.0", "Referer": "https://www.google.com/"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            if len(data) > 1000:
                with open(dest, "wb") as f:
                    f.write(data)
                return True
        except Exception:
            pass
    try:
        r = subprocess.run(
            ["ffmpeg", "-y", "-ss", str(at_sec), "-i", video_path, "-vframes", "1", "-q:v", "2", dest],
            capture_output=True, timeout=60)
        return r.returncode == 0 and os.path.exists(dest)
    except Exception:
        return False


def _storyboard_interval(duration: int) -> int:
    """Adaptive interval — keeps tile count ≤ STORYBOARD_MAX_TILES on one sheet."""
    interval = 10
    while max(1, math.ceil(duration / interval)) > STORYBOARD_MAX_TILES:
        interval += 5
    return interval


def _storyboard_tile_count(duration: int, interval: int) -> int:
    return min(STORYBOARD_MAX_TILES, max(1, math.ceil(duration / interval)))


def _write_storyboard_vtt(vtt_dest: str, sprite_name: str, duration: int, interval: int, count: int) -> None:
    def ts(sec):
        h = sec // 3600
        m = (sec % 3600) // 60
        s = sec % 60
        return f"{h:02d}:{m:02d}:{s:02d}.000"

    lines = ["WEBVTT", ""]
    for i in range(count):
        start = i * interval
        end = min(duration, start + interval)
        x = (i % STORYBOARD_COLS) * STORYBOARD_TILE_W
        y = (i // STORYBOARD_COLS) * STORYBOARD_TILE_H
        lines.append(f"{ts(start)} --> {ts(end)}")
        lines.append(f"{sprite_name}#xywh={x},{y},{STORYBOARD_TILE_W},{STORYBOARD_TILE_H}")
        lines.append("")
    with open(vtt_dest, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _storyboard_tile_ffmpeg(
    video_path: str,
    sprite_dest: str,
    duration: int,
    interval: int,
    count: int,
    timeout: int,
) -> tuple[bool, str]:
    """Single-pass fps+tile sprite (fast on short/medium videos)."""
    rows = math.ceil(count / STORYBOARD_COLS)
    fps = 1.0 / interval
    vf = (
        f"fps={fps},scale={STORYBOARD_TILE_W}:{STORYBOARD_TILE_H},"
        f"tile={STORYBOARD_COLS}x{rows}"
    )
    cmd = ["ffmpeg", "-y", "-i", video_path, "-vf", vf, "-frames:v", "1", "-q:v", "5", sprite_dest]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        ok = (
            r.returncode == 0
            and os.path.exists(sprite_dest)
            and os.path.getsize(sprite_dest) > 1000
        )
        return ok, (r.stderr or "")[-800:]
    except subprocess.TimeoutExpired:
        return False, "ffmpeg tile timed out"
    except Exception as e:
        return False, str(e)


def _storyboard_seek_ffmpeg(
    video_path: str,
    sprite_dest: str,
    duration: int,
    interval: int,
    count: int,
    timeout: int,
) -> tuple[bool, str]:
    """Seek per frame then tile — avoids decoding entire long files (ARM-friendly)."""
    tmp_dir = os.path.dirname(os.path.abspath(sprite_dest)) or "."
    frames: list[str] = []
    per_frame = max(30, min(120, timeout // max(count, 1)))
    try:
        for i in range(count):
            t = min(max(0.0, duration - 0.5), i * interval + interval / 2)
            fp = os.path.join(tmp_dir, f"sb_{i:04d}.jpg")
            cmd = [
                "ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", video_path,
                "-frames:v", "1", "-q:v", "5",
                "-vf", f"scale={STORYBOARD_TILE_W}:{STORYBOARD_TILE_H}",
                fp,
            ]
            try:
                r = subprocess.run(cmd, capture_output=True, timeout=per_frame)
                if r.returncode == 0 and os.path.exists(fp) and os.path.getsize(fp) > 100:
                    frames.append(fp)
            except subprocess.TimeoutExpired:
                continue
        if not frames:
            return False, "no frames extracted"

        # Pad incomplete last row by duplicating the last frame.
        rows = math.ceil(len(frames) / STORYBOARD_COLS)
        padded = list(frames)
        while len(padded) < rows * STORYBOARD_COLS:
            padded.append(frames[-1])
        inputs = []
        for fp in padded[: rows * STORYBOARD_COLS]:
            inputs.extend(["-loop", "1", "-t", "1", "-i", fp])
        filter_parts = []
        for row in range(rows):
            idx = row * STORYBOARD_COLS
            row_inputs = "".join(f"[{idx + c}:v]" for c in range(STORYBOARD_COLS))
            filter_parts.append(f"{row_inputs}hstack=inputs={STORYBOARD_COLS}[r{row}]")
        stack_inputs = "".join(f"[r{r}]" for r in range(rows))
        filter_parts.append(f"{stack_inputs}vstack=inputs={rows}[out]")
        cmd = [
            "ffmpeg", "-y", *inputs,
            "-filter_complex", ";".join(filter_parts),
            "-map", "[out]", "-frames:v", "1", "-q:v", "5", sprite_dest,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=max(120, timeout // 4))
        ok = (
            r.returncode == 0
            and os.path.exists(sprite_dest)
            and os.path.getsize(sprite_dest) > 1000
        )
        return ok, (r.stderr or "")[-800:]
    except Exception as e:
        return False, str(e)
    finally:
        for i in range(count):
            fp = os.path.join(tmp_dir, f"sb_{i:04d}.jpg")
            try:
                os.remove(fp)
            except OSError:
                pass


def make_storyboard(
    video_path: str,
    sprite_dest: str,
    vtt_dest: str,
    duration: int,
    force: bool = False,
    timeout: int = 1800,
) -> bool:
    """
    Build a sprite sheet + WebVTT for scrubber thumbnails.
    Interval adapts to video length so long videos stay on one sheet (≤100 tiles).
    Falls back to seek-based extraction when the single-pass tile filter fails.
    """
    if not force and os.path.exists(sprite_dest) and os.path.exists(vtt_dest):
        return True

    if duration <= 0:
        duration = probe_duration(video_path)
    if duration <= 0:
        return False

    interval = _storyboard_interval(duration)
    count = _storyboard_tile_count(duration, interval)
    sprite_name = os.path.basename(sprite_dest)

    # Long videos: seek-based path avoids decoding the full file on ARM.
    if duration >= 3600:
        ok, _ = _storyboard_seek_ffmpeg(video_path, sprite_dest, duration, interval, count, timeout)
    else:
        ok, _ = _storyboard_tile_ffmpeg(video_path, sprite_dest, duration, interval, count, timeout)
        if not ok:
            ok, _ = _storyboard_seek_ffmpeg(video_path, sprite_dest, duration, interval, count, timeout)

    if not ok:
        return False

    _write_storyboard_vtt(vtt_dest, sprite_name, duration, interval, count)
    return True
