"""ffmpeg media generation: preview clip, static thumbnail, storyboard sprite + VTT."""

import json
import math
import os
import subprocess
import urllib.request

STORYBOARD_INTERVAL = 10   # seconds between storyboard frames
STORYBOARD_COLS = 5
TILE_W = 160
TILE_H = 90


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


def make_preview(video_path: str, dest: str, timeout=1800) -> bool:
    """Muted hover-preview clip: first 5s of every minute, downscaled."""
    if os.path.exists(dest) and os.path.getsize(dest) > 10_000:
        return True
    vf = "select='lt(mod(t,60),5)',setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2"
    cmd = ["ffmpeg", "-i", video_path, "-vf", vf, "-an", "-c:v", "libx264",
           "-crf", "28", "-preset", "veryfast", "-y", dest]
    try:
        return subprocess.run(cmd, capture_output=True, timeout=timeout).returncode == 0
    except Exception:
        return False


def make_thumbnail(video_path: str, dest: str, thumbnail_url: str = "") -> bool:
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
            ["ffmpeg", "-y", "-ss", "5", "-i", video_path, "-vframes", "1", "-q:v", "2", dest],
            capture_output=True, timeout=60)
        return r.returncode == 0 and os.path.exists(dest)
    except Exception:
        return False


def make_storyboard(video_path: str, sprite_dest: str, vtt_dest: str, duration: int) -> bool:
    """
    Build a sprite sheet (grid of frames every STORYBOARD_INTERVAL s) and a WebVTT
    file mapping timecodes -> sprite regions (#xywh=x,y,w,h).
    """
    if duration <= 0:
        duration = probe_duration(video_path)
    if duration <= 0:
        return False

    count = max(1, math.ceil(duration / STORYBOARD_INTERVAL))
    rows = math.ceil(count / STORYBOARD_COLS)
    fps = 1.0 / STORYBOARD_INTERVAL

    vf = f"fps={fps},scale={TILE_W}:{TILE_H},tile={STORYBOARD_COLS}x{rows}"
    cmd = ["ffmpeg", "-y", "-i", video_path, "-vf", vf, "-frames:v", "1", "-q:v", "4", sprite_dest]
    try:
        if subprocess.run(cmd, capture_output=True, timeout=1800).returncode != 0:
            return False
    except Exception:
        return False

    def ts(sec):
        h = sec // 3600
        m = (sec % 3600) // 60
        s = sec % 60
        return f"{h:02d}:{m:02d}:{s:02d}.000"

    sprite_name = os.path.basename(sprite_dest)
    lines = ["WEBVTT", ""]
    for i in range(count):
        start = i * STORYBOARD_INTERVAL
        end = min(duration, start + STORYBOARD_INTERVAL)
        x = (i % STORYBOARD_COLS) * TILE_W
        y = (i // STORYBOARD_COLS) * TILE_H
        lines.append(f"{ts(start)} --> {ts(end)}")
        lines.append(f"{sprite_name}#xywh={x},{y},{TILE_W},{TILE_H}")
        lines.append("")
    with open(vtt_dest, "w") as f:
        f.write("\n".join(lines))
    return True
