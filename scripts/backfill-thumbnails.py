#!/usr/bin/env python3
"""
Backfill thumbnail images for all videos that don't have one.
- If the video has a thumbnail URL in DB: download it to downloads/{id}/thumbnail.jpg
- If not: extract a frame from video.mp4 using ffmpeg
- Updates the DB thumbnail field to /api/thumbnail-img/{id}
"""
import os
import sqlite3
import subprocess
import urllib.request
import urllib.error

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "prisma", "dev.db")
DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "downloads")
LOCAL_THUMB_URL = "/api/thumbnail-img/{}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.google.com/",
}

def has_thumb_image(vid_id: str) -> bool:
    for ext in ["thumbnail.jpg", "thumbnail.jpeg", "thumbnail.png", "thumbnail.webp"]:
        if os.path.exists(os.path.join(DOWNLOADS_DIR, vid_id, ext)):
            return True
    return False

def extract_frame(video_path: str, dest_path: str) -> bool:
    """Extract a single frame at 5 seconds into the video using ffmpeg."""
    try:
        r = subprocess.run(
            ["ffmpeg", "-y", "-ss", "5", "-i", video_path, "-vframes", "1",
             "-q:v", "2", dest_path],
            capture_output=True, text=True, timeout=60
        )
        return r.returncode == 0 and os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000
    except Exception as e:
        print(f"    [fail] ffmpeg: {e}")
        return False

def download_image(url: str, dest_path: str) -> bool:
    """Download image from URL."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) < 500:
            return False
        with open(dest_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"    [fail] download {url}: {e}")
        return False

def main():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT id, title, thumbnail, url FROM Video ORDER BY createdAt").fetchall()

    done = 0
    skipped = 0
    failed = 0

    for vid_id, title, thumb_url, video_url in rows:
        vid_dir = os.path.join(DOWNLOADS_DIR, vid_id)
        video_path = os.path.join(vid_dir, "video.mp4")

        # Already has a local thumbnail image
        if has_thumb_image(vid_id):
            # Make sure DB points to local path
            local_url = LOCAL_THUMB_URL.format(vid_id)
            if thumb_url != local_url:
                conn.execute("UPDATE Video SET thumbnail=? WHERE id=?", (local_url, vid_id))
                conn.commit()
            skipped += 1
            print(f"  [skip] {title[:50]} — already has image")
            continue

        # No video file — can't do anything
        if not os.path.exists(video_path):
            print(f"  [skip] {title[:50]} — no video.mp4")
            skipped += 1
            continue

        dest_jpg = os.path.join(vid_dir, "thumbnail.jpg")
        ok = False

        # Try downloading from the stored thumbnail URL first
        if thumb_url and thumb_url.startswith("http"):
            print(f"  [download] {title[:50]}")
            ok = download_image(thumb_url, dest_jpg)

        # Fallback: extract a frame from the video
        if not ok:
            print(f"  [extract] {title[:50]}")
            ok = extract_frame(video_path, dest_jpg)

        if ok:
            local_url = LOCAL_THUMB_URL.format(vid_id)
            conn.execute("UPDATE Video SET thumbnail=? WHERE id=?", (local_url, vid_id))
            conn.commit()
            size = os.path.getsize(dest_jpg)
            print(f"    [ok] saved {size//1024}KB -> {dest_jpg}")
            done += 1
        else:
            print(f"    [fail] could not get thumbnail for {title[:50]}")
            failed += 1

    conn.close()
    print(f"\nDone: {done} created, {skipped} skipped, {failed} failed")

if __name__ == "__main__":
    main()
