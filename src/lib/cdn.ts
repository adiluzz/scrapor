import crypto from "crypto";
import {
  isCloudFrontConfigured,
  signCloudFrontCanned,
  signCloudFrontCustom,
  signCloudFrontCustomWildcard,
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
 * HLS when the master exists and HLS is enabled for the video (or no MP4 is left);
 * otherwise progressive MP4.
 */
export type StreamGrant = {
  url: string;
  mimeType: "video/mp4" | "application/x-mpegURL";
  /** Progressive MP4 URL when primary is HLS (browser fallback if HLS fails). */
  mp4FallbackUrl?: string;
};

/**
 * HLS for every video when HLS_PLAYBACK_ENABLED=true, otherwise only for ids in
 * HLS_PLAYBACK_VIDEO_IDS (comma-separated). Videos with no MP4 always get HLS.
 * Segments are fetched cross-origin from the CDN, so CORS must be on (infra/s3-cors-policy.json).
 */
export function isHlsPlaybackEnabled(videoId?: string): boolean {
  if (process.env.HLS_PLAYBACK_ENABLED === "true") return true;
  if (!videoId) return false;
  const ids = (process.env.HLS_PLAYBACK_VIDEO_IDS || "").split(",").map((s) => s.trim());
  return ids.includes(videoId);
}

type HlsPlaylistTokenPayload = { v: string; k: string; e: number };

export function makeHlsPlaylistToken(payload: HlsPlaylistTokenPayload): string {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(crypto.createHmac("sha256", `hls:${SECRET}`).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyHlsPlaylistToken(token: string): HlsPlaylistTokenPayload | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = base64url(crypto.createHmac("sha256", `hls:${SECRET}`).update(body).digest());
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64").toString());
    if (typeof payload.e !== "number" || payload.e * 1000 < Date.now()) return null;
    if (typeof payload.v !== "string" || typeof payload.k !== "string") return null;
    if (!payload.k.endsWith("/hls/master.m3u8")) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Rewrite a media playlist so every segment URI is an absolute CloudFront URL
 * carrying the wildcard-policy signature (relative URIs would drop the query).
 */
export function signHlsPlaylist(opts: {
  playlist: string;
  masterKey: string;
  expiresEpochSec: number;
  clientIp: string;
}): string {
  const prefix = opts.masterKey.replace(/master\.m3u8$/, "");
  const signed = new URL(
    signCloudFrontCustomWildcard({
      objectPathPrefix: `/${prefix}`,
      expiresEpochSec: opts.expiresEpochSec,
      clientIp: opts.clientIp,
    })
  );
  const query = signed.search.slice(1);
  const base = `${signed.origin}/${prefix}`;
  return opts.playlist
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      if (/^https?:\/\//i.test(t)) return line;
      return `${base}${t}${t.includes("?") ? "&" : "?"}${query}`;
    })
    .join("\n");
}

function mintMp4StreamUrl(opts: {
  videoId: string;
  siteId: string;
  clientIp: string;
  adSessionId: string;
  expires: number;
  adminPreview?: boolean;
  s3VideoKey?: string | null;
}): string {
  if (isCloudFrontConfigured()) {
    const objectPath = `/${opts.s3VideoKey || s3Keys.video(opts.siteId, opts.videoId)}`;
    return signCloudFrontCustom({
      objectPath,
      expiresEpochSec: opts.expires,
      clientIp: opts.clientIp,
    });
  }
  return nginxStreamUrl({
    videoId: opts.videoId,
    siteId: opts.siteId,
    clientIp: opts.clientIp,
    adSessionId: opts.adSessionId,
    expires: opts.expires,
    adminPreview: opts.adminPreview,
  });
}

export function mintStreamUrl(opts: {
  videoId: string;
  siteId: string;
  clientIp: string;
  adSessionId: string;
  ttlSeconds?: number;
  adminPreview?: boolean;
  s3HlsMasterKey: string | null;
  /** Null once the MP4 has been purged (HLS-only video). */
  s3VideoKey: string | null;
  /** Force progressive MP4 even when HLS is available (ignored when no MP4 exists). */
  forceMp4?: boolean;
  /** Absolute origin for the playlist URL (API consumers); browser callers use a relative path. */
  playlistOrigin?: string;
}): StreamGrant {
  const ttl = opts.ttlSeconds ?? TTL;
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const hasMp4 = Boolean(opts.s3VideoKey);
  const mp4Url = hasMp4 ? mintMp4StreamUrl({ ...opts, expires }) : null;

  const useHls =
    isCloudFrontConfigured() &&
    Boolean(opts.s3HlsMasterKey) &&
    (!hasMp4 || (!opts.forceMp4 && isHlsPlaybackEnabled(opts.videoId)));

  if (useHls && opts.s3HlsMasterKey) {
    const t = makeHlsPlaylistToken({ v: opts.videoId, k: opts.s3HlsMasterKey, e: expires });
    const path = `/api/hls/${opts.videoId}/playlist.m3u8?t=${encodeURIComponent(t)}`;
    return {
      url: `${opts.playlistOrigin ?? ""}${path}`,
      mimeType: "application/x-mpegURL",
      ...(mp4Url ? { mp4FallbackUrl: mp4Url } : {}),
    };
  }

  return {
    url: mp4Url ?? mintMp4StreamUrl({ ...opts, expires }),
    mimeType: "video/mp4",
  };
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
