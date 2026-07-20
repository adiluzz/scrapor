import crypto from "crypto";
import { redis } from "@/lib/redis";

/** Presigned S3 URL TTL used by authorize; Redis cache sits just under this. */
export const CDN_PRESIGN_SECONDS = 60;
const PRESIGN_CACHE_TTL = 50;
const VIDEO_META_TTL = 300;

export type CdnVideoMeta = {
  siteId: string;
  isDeleted: boolean;
};

export type CachedPresign = {
  url: string;
  host: string;
};

function videoMetaKey(videoId: string): string {
  return `cdn:video:${videoId}`;
}

function assetPresignKey(siteId: string, videoId: string, file: string): string {
  return `cdn:presign:a:${siteId}:${videoId}:${file}`;
}

function streamPresignKey(siteId: string, videoId: string, token: string): string {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
  return `cdn:presign:v:${siteId}:${videoId}:${tokenHash}`;
}

/** Fail-open: Redis errors return null so authorize falls back to DB/S3. */
export async function getCachedVideoMeta(videoId: string): Promise<CdnVideoMeta | null> {
  try {
    const raw = await redis.get(videoMetaKey(videoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CdnVideoMeta;
    if (typeof parsed.siteId !== "string" || typeof parsed.isDeleted !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedVideoMeta(videoId: string, meta: CdnVideoMeta): Promise<void> {
  try {
    await redis.set(videoMetaKey(videoId), JSON.stringify(meta), "EX", VIDEO_META_TTL);
  } catch {
    // fail-open
  }
}

/** Drop metadata (and leave presigns to expire) so soft-delete revokes quickly. */
export async function invalidateCdnVideoCache(videoId: string): Promise<void> {
  try {
    await redis.del(videoMetaKey(videoId));
  } catch {
    // fail-open
  }
}

export async function getCachedPresign(
  kind: "asset" | "stream",
  opts: { siteId: string; videoId: string; file?: string; token?: string }
): Promise<CachedPresign | null> {
  try {
    const key =
      kind === "asset"
        ? assetPresignKey(opts.siteId, opts.videoId, opts.file || "")
        : streamPresignKey(opts.siteId, opts.videoId, opts.token || "");
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPresign;
    if (typeof parsed.url !== "string" || typeof parsed.host !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedPresign(
  kind: "asset" | "stream",
  opts: { siteId: string; videoId: string; file?: string; token?: string },
  value: CachedPresign
): Promise<void> {
  try {
    const key =
      kind === "asset"
        ? assetPresignKey(opts.siteId, opts.videoId, opts.file || "")
        : streamPresignKey(opts.siteId, opts.videoId, opts.token || "");
    await redis.set(key, JSON.stringify(value), "EX", PRESIGN_CACHE_TTL);
  } catch {
    // fail-open
  }
}
