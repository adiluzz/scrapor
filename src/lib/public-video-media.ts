import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { normalizeHost, getSiteByDomain } from "@/lib/site";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";
import { isHlsMasterFile, isHlsSegmentFile } from "@/lib/video-sitemap";

const VIDEO_ID = /^[a-z0-9]+$/i;

export function requestPublicOrigin(request: Request): string {
  const host = normalizeHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/** READY video published on the request host. */
export async function publishedVideoForMedia(request: Request, id: string) {
  if (!VIDEO_ID.test(id)) return null;
  const host = normalizeHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  let siteId: string;
  try {
    siteId = (await getSiteByDomain(host)).id;
  } catch {
    return null;
  }
  return prisma.video.findFirst({
    where: {
      id,
      isDeleted: false,
      status: "READY",
      sites: { some: { siteId } },
    },
    select: { id: true, siteId: true, s3HlsMasterKey: true, s3VideoKey: true },
  });
}

/**
 * S3 key for the public HLS master or one of its segments.
 * The master key must live under this video's `hls/` prefix.
 */
export function publicHlsObjectKey(
  video: { id: string; siteId: string; s3HlsMasterKey?: string | null },
  file: string
): string | null {
  const master = video.s3HlsMasterKey;
  if (!master || master.includes("..") || !master.endsWith("/master.m3u8")) return null;
  const prefix = s3Keys.hlsPrefix(video.siteId, video.id);
  if (!master.startsWith(prefix)) return null;
  if (isHlsMasterFile(file)) return master;
  if (!isHlsSegmentFile(file)) return null;
  const dir = master.slice(0, master.lastIndexOf("/") + 1);
  return `${dir}${file}`;
}

export async function readS3Text(key: string): Promise<string | null> {
  if (!isS3Configured()) return null;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return (await obj.Body?.transformToString("utf-8")) ?? null;
  } catch {
    return null;
  }
}
