import crypto from "crypto";
import {
  isCloudFrontConfigured,
  signCloudFrontCanned,
  signCloudFrontCustom,
} from "@/lib/cloudfront-sign";
import { s3Keys } from "@/lib/storage";

const SECRET = process.env.CDN_SIGNING_SECRET || "dev-cdn-secret-change-me";
const CDN_BASE_URL = process.env.CDN_BASE_URL || "http://localhost:8080";
const TTL = parseInt(process.env.CDN_URL_TTL_SECONDS || "21600", 10);

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Legacy nginx secure_link (local / pre-CloudFront). */
export function secureLinkSig(uri: string, expires: number, clientIp: string): string {
  const data = `${expires}${uri}${clientIp} ${SECRET}`;
  return base64url(crypto.createHash("md5").update(data).digest());
}

export function secureLinkSigAsset(uri: string, expires: number): string {
  const data = `${expires}${uri} ${SECRET}`;
  return base64url(crypto.createHash("md5").update(data).digest());
}

/**
 * App-level stream token — kept for nginx authorize during rollback; unused by CloudFront path.
 */
export function makeStreamToken(payload: {
  videoId: string;
  siteId: string;
  exp: number;
  adSessionId: string;
  adminPreview?: boolean;
}): string {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyStreamToken(token: string):
  | { videoId: string; siteId: string; exp: number; adSessionId: string; adminPreview?: boolean }
  | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = base64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64").toString());
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function nginxStreamUrl(opts: {
  videoId: string;
  siteId: string;
  clientIp: string;
  adSessionId: string;
  expires: number;
  adminPreview?: boolean;
}): string {
  const uri = `/v/${opts.videoId}/video.mp4`;
  const s = secureLinkSig(uri, opts.expires, opts.clientIp);
  const t = makeStreamToken({
    videoId: opts.videoId,
    siteId: opts.siteId,
    exp: opts.expires,
    adSessionId: opts.adSessionId,
    adminPreview: opts.adminPreview,
  });
  return `${CDN_BASE_URL}${uri}?e=${opts.expires}&s=${s}&t=${encodeURIComponent(t)}`;
}

function nginxAssetUrl(opts: { videoId: string; file: string; expires: number }): string {
  const uri = `/a/${opts.videoId}/${opts.file}`;
  const s = secureLinkSigAsset(uri, opts.expires);
  return `${CDN_BASE_URL}${uri}?e=${opts.expires}&s=${s}`;
}

/**
 * Mint signed playback URL after ad grant (CloudFront custom policy when configured).
 */
export function mintStreamUrl(opts: {
  videoId: string;
  siteId: string;
  clientIp: string;
  adSessionId: string;
  ttlSeconds?: number;
  adminPreview?: boolean;
}): string {
  const ttl = opts.ttlSeconds ?? TTL;
  const expires = Math.floor(Date.now() / 1000) + ttl;

  if (isCloudFrontConfigured()) {
    const objectPath = `/${s3Keys.video(opts.siteId, opts.videoId)}`;
    return signCloudFrontCustom({
      objectPath,
      expiresEpochSec: expires,
      clientIp: opts.clientIp,
    });
  }

  return nginxStreamUrl({ ...opts, expires });
}

export type CdnAssetFile = "thumbnail.jpg" | "preview.mp4" | "storyboard.jpg" | "storyboard.vtt";

const assetFileToKey = {
  "thumbnail.jpg": s3Keys.thumb,
  "preview.mp4": s3Keys.preview,
  "storyboard.jpg": s3Keys.storyboard,
  "storyboard.vtt": s3Keys.storyboardVtt,
} as const;

/**
 * Mint signed URL for thumbs / previews / storyboards.
 * CloudFront: canned policy to real S3 key (requires siteId).
 */
export function mintAssetUrl(opts: {
  videoId: string;
  siteId: string;
  file: CdnAssetFile;
  ttlSeconds?: number;
}): string {
  const ttl = opts.ttlSeconds ?? TTL;
  const expires = Math.floor(Date.now() / 1000) + ttl;

  if (isCloudFrontConfigured()) {
    const objectPath = `/${assetFileToKey[opts.file](opts.siteId, opts.videoId)}`;
    return signCloudFrontCanned({ objectPath, expiresEpochSec: expires });
  }

  return nginxAssetUrl({ videoId: opts.videoId, file: opts.file, expires });
}
