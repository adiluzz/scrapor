"""
Read-only catalog media inventory: what actually exists on S3 for every video.

Classifies each non-deleted Video row by its S3 objects (not its DB keys):
  both      video.mp4 and hls/master.m3u8 exist
  mp4_only  progressive MP4 only
  hls_only  HLS only
  neither   no playable source

Writes a per-video CSV and a summary with monthly storage cost. Never writes to S3.
Needs s3:ListBucket for HLS byte totals; the scrapor-server IAM user lacks it, so
dump rows with --dump-videos on the server and run --videos-csv with a listing-capable profile.

  docker compose exec -T worker python worker/media_inventory.py [--out-dir DIR] [--workers N]
"""

import argparse
import csv
import os
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import storage  # noqa: E402

VIDEO_FIELDS = ["id", "siteId", "status", "durationSec", "s3VideoKey", "s3HlsMasterKey"]

GIB = 1024 ** 3
PRICE_STANDARD = 0.023
PRICE_IA = 0.0125


def head_size(key):
    try:
        return storage.s3().head_object(Bucket=storage._BUCKET, Key=key)["ContentLength"]
    except Exception:
        return None


def prefix_usage(prefix):
    total = count = 0
    paginator = storage.s3().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=storage._BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            total += obj["Size"]
            count += 1
    return total, count


def load_videos_db():
    import db

    conn = db.connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id,"siteId",status,"durationSec","s3VideoKey","s3HlsMasterKey" '
                'FROM "Video" WHERE "isDeleted" = false ORDER BY "createdAt" ASC'
            )
            return [dict(zip(VIDEO_FIELDS, r)) for r in cur.fetchall()]
    finally:
        conn.close()


def load_videos_csv(path):
    with open(path, newline="") as f:
        return [{k: (row.get(k) or None) for k in VIDEO_FIELDS} for row in csv.DictReader(f)]


def inspect(v):
    vid, site_id = v["id"], v["siteId"]
    mp4_key = storage.resolve_video_key(site_id, vid, v["s3VideoKey"])
    hls_master = v["s3HlsMasterKey"] or storage.key_hls_master(site_id, vid)
    mp4_bytes = head_size(mp4_key)
    master_bytes = head_size(hls_master)

    hls_bytes, hls_objects = (0, 0)
    if master_bytes is not None:
        hls_bytes, hls_objects = prefix_usage(hls_master.rsplit("/", 1)[0] + "/")

    has_mp4 = mp4_bytes is not None
    has_hls = master_bytes is not None
    cls = "both" if has_mp4 and has_hls else "mp4_only" if has_mp4 else "hls_only" if has_hls else "neither"
    return {
        **v,
        "class": cls,
        "mp4Key": mp4_key,
        "mp4Bytes": mp4_bytes or 0,
        "hlsMasterKey": hls_master,
        "hlsBytes": hls_bytes,
        "hlsObjects": hls_objects,
        "dbHlsStale": bool(v["s3HlsMasterKey"]) and not has_hls,
        "dbMp4Stale": bool(v["s3VideoKey"]) and not has_mp4,
    }


def monthly(b, price):
    return b / GIB * price


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default="/app/uploads/tmp")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--dump-videos", metavar="CSV", help="Write DB video rows to CSV and exit")
    ap.add_argument("--videos-csv", metavar="CSV", help="Read video rows from CSV instead of the DB")
    args = ap.parse_args()

    if args.dump_videos:
        videos = load_videos_db()
        with open(args.dump_videos, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=VIDEO_FIELDS)
            w.writeheader()
            w.writerows(videos)
        print(f"dumped {len(videos)} videos to {args.dump_videos}")
        return

    videos = load_videos_csv(args.videos_csv) if args.videos_csv else load_videos_db()
    print(f"inventory: {len(videos)} videos", flush=True)

    rows = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, row in enumerate(pool.map(inspect, videos), 1):
            rows.append(row)
            if i % 500 == 0:
                print(f"  {i}/{len(videos)}", flush=True)

    os.makedirs(args.out_dir, exist_ok=True)
    csv_path = os.path.join(args.out_dir, "media-inventory.csv")
    fields = ["id", "siteId", "status", "durationSec", "class", "mp4Bytes", "hlsBytes", "hlsObjects",
              "dbHlsStale", "dbMp4Stale", "mp4Key", "hlsMasterKey", "s3VideoKey", "s3HlsMasterKey"]
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    agg = defaultdict(lambda: {"n": 0, "mp4": 0, "hls": 0, "objs": 0})
    by_status = defaultdict(int)
    for r in rows:
        a = agg[r["class"]]
        a["n"] += 1
        a["mp4"] += r["mp4Bytes"]
        a["hls"] += r["hlsBytes"]
        a["objs"] += r["hlsObjects"]
        by_status[(r["class"], r["status"])] += 1

    lines = [f"videos: {len(rows)}", ""]
    for cls in ("both", "mp4_only", "hls_only", "neither"):
        a = agg[cls]
        lines.append(
            f"{cls:9s} n={a['n']:6d}  mp4={a['mp4'] / GIB:9.1f} GiB  hls={a['hls'] / GIB:9.1f} GiB  "
            f"hlsObjects={a['objs']}"
        )
    both = agg["both"]
    lines += [
        "",
        f"deletable MP4 (class both): {both['mp4'] / GIB:.1f} GiB = "
        f"${monthly(both['mp4'], PRICE_STANDARD):.2f}/mo Standard, ${monthly(both['mp4'], PRICE_IA):.2f}/mo IA",
        f"mp4_only kept as MP4: {agg['mp4_only']['mp4'] / GIB:.1f} GiB",
        f"stale DB HLS keys: {sum(r['dbHlsStale'] for r in rows)}  stale DB MP4 keys: {sum(r['dbMp4Stale'] for r in rows)}",
        "",
        "by class/status:",
    ]
    lines += [f"  {c:9s} {s:10s} {n}" for (c, s), n in sorted(by_status.items())]
    summary = "\n".join(lines)
    with open(os.path.join(args.out_dir, "media-inventory-summary.txt"), "w") as f:
        f.write(summary + "\n")
    print(summary)
    print(f"\ncsv: {csv_path}")


if __name__ == "__main__":
    main()
