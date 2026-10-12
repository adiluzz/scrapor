import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { runProcess } from "@/lib/assistant-tools/utils";
import { downloadS3ObjectToFile, s3, S3_BUCKET } from "@/lib/storage";

export type VideoSourceRow = {
  id: string;
  siteId: string;
  s3VideoKey?: string | null;
  s3HlsMasterKey?: string | null;
};

const SEGMENT_CONCURRENCY = 16;

/** True when the video has a stored full-length source (MP4 or HLS). */
export function hasStoredVideoSource(video: Pick<VideoSourceRow, "s3VideoKey" | "s3HlsMasterKey">): boolean {
  return Boolean(video.s3VideoKey || video.s3HlsMasterKey);
}

/**
 * Download HLS segments next to the playlist and remux (stream copy) into one
 * faststart MP4 at destPath.
 */
export async function downloadHlsAsMp4(masterKey: string, destPath: string): Promise<void> {
  const prefix = masterKey.replace(/master\.m3u8$/, "");
  await mkdir(dirname(destPath), { recursive: true });
  const work = await mkdtemp(join(dirname(destPath), ".hls-"));
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: masterKey }));
    const playlist = (await obj.Body?.transformToString("utf-8")) ?? "";
    const names = playlist
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    if (!playlist.startsWith("#EXTM3U") || names.length === 0) {
      throw new Error(`Invalid HLS playlist: ${masterKey}`);
    }
    if (names.some((n) => n.includes("/") || n.includes(".."))) {
      throw new Error(`Unexpected segment path in ${masterKey}`);
    }
    await writeFile(join(work, "master.m3u8"), playlist);

    let next = 0;
    const worker = async () => {
      while (next < names.length) {
        const name = names[next++];
        await downloadS3ObjectToFile(`${prefix}${name}`, join(work, name));
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEGMENT_CONCURRENCY, names.length) }, worker));

    const tmpOut = join(work, "out.mp4");
    const r = await runProcess(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-allowed_extensions",
        "ALL",
        "-i",
        join(work, "master.m3u8"),
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        "-movflags",
        "+faststart",
        tmpOut,
      ],
      { timeoutSeconds: 1800 }
    );
    if (r.exitCode !== 0 || !existsSync(tmpOut)) {
      throw new Error(`HLS remux failed: ${r.stderr.slice(-500)}`);
    }
    await rename(tmpOut, destPath);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Write the full source video to destPath: MP4 when stored, else remuxed from HLS. */
export async function downloadVideoSourceToFile(video: VideoSourceRow, destPath: string): Promise<void> {
  if (video.s3VideoKey) {
    await downloadS3ObjectToFile(video.s3VideoKey, destPath);
    return;
  }
  if (video.s3HlsMasterKey) {
    await downloadHlsAsMp4(video.s3HlsMasterKey, destPath);
    const st = await stat(destPath);
    if (st.size === 0) throw new Error("Empty remuxed MP4");
    return;
  }
  throw new Error("Video has no stored source (no MP4 or HLS)");
}
