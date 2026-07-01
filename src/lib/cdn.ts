import crypto from "crypto";

const SECRET = process.env.CDN_SIGNING_SECRET || "dev-cdn-secret-change-me";
const CDN_BASE_URL = process.env.CDN_BASE_URL || "http://localhost:8080";
const TTL = parseInt(process.env.CDN_URL_TTL_SECONDS || "21600", 10);

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Compute the nginx `secure_link_md5` signature.
 *
 * nginx config must use exactly:
 *   secure_link       $arg_s,$arg_e;
 *   secure_link_md5   "$secure_link_expires$uri$remote_addr $CDN_SIGNING_SECRET";
 *
 * so the signed string is `${expires}${uri}${clientIp} ${SECRET}`.
 */
export function secureLinkSig(uri: string, expires: number, clientIp: string): string {
  const data = `${expires}${uri}${clientIp} ${SECRET}`;
  return base64url(crypto.createHash("md5").update(data).digest());
}

/**
 * App-level ad-claim / integrity token, validated by /api/cdn/authorize.
 * HMAC over the fields the server vouches for so it cannot be forged client-side.
 */
export function makeStreamToken(payload: {
  videoId: string;
  siteId: string;
  exp: number;
  adSessionId: string;
  /** Set when an admin previews a soft-deleted or hidden video. */
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
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64").toString());
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Mint the full short-lived, IP-bound signed CDN URL for a video stream.
 * Only called server-side after an ad session is granted (section 4).
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
  const uri = `/v/${opts.videoId}/video.mp4`;
  const s = secureLinkSig(uri, expires, opts.clientIp);
  const t = makeStreamToken({
    videoId: opts.videoId,
    siteId: opts.siteId,
    exp: expires,
    adSessionId: opts.adSessionId,
    adminPreview: opts.adminPreview,
  });
  return `${CDN_BASE_URL}${uri}?e=${expires}&s=${s}&t=${encodeURIComponent(t)}`;
}

/**
 * Mint a lightweight (non ad-gated) signed URL for thumbnails/previews/storyboards.
 * `kind` maps to the CDN path segment.
 */
export function mintAssetUrl(opts: {
  videoId: string;
  file: "thumbnail.jpg" | "preview.mp4" | "storyboard.jpg" | "storyboard.vtt";
  clientIp: string;
  ttlSeconds?: number;
}): string {
  const ttl = opts.ttlSeconds ?? TTL;
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const uri = `/a/${opts.videoId}/${opts.file}`;
  const s = secureLinkSig(uri, expires, opts.clientIp);
  return `${CDN_BASE_URL}${uri}?e=${expires}&s=${s}`;
}
