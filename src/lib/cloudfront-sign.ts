import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const CDN_BASE_URL = (process.env.CDN_BASE_URL || "https://cdn.pisster.com").replace(/\/$/, "");
const KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID || "";
const PRIVATE_KEY = (process.env.CLOUDFRONT_PRIVATE_KEY || "").replace(/\\n/g, "\n");

/** CloudFront signing active when key pair + private key are configured. */
export function isCloudFrontConfigured(): boolean {
  return Boolean(KEY_PAIR_ID && PRIVATE_KEY.includes("BEGIN"));
}

function resourceUrl(objectPath: string): string {
  const path = objectPath.startsWith("/") ? objectPath : `/${objectPath}`;
  return `${CDN_BASE_URL}${path}`;
}

/** Base64url-style encoding used by CloudFront policy/signature query params. */
function toUrlSafeBase64(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/=/g, "_")
    .replace(/\//g, "~");
}

/**
 * Canned-policy signed URL (expiry only). Used for assets without IP binding
 * so mobile / network changes do not break thumbs and hover previews.
 */
export function signCloudFrontCanned(opts: {
  objectPath: string;
  expiresEpochSec: number;
}): string {
  const url = resourceUrl(opts.objectPath);
  return getSignedUrl({
    url,
    keyPairId: KEY_PAIR_ID,
    privateKey: PRIVATE_KEY,
    dateLessThan: new Date(opts.expiresEpochSec * 1000),
  });
}

/**
 * Custom-policy signed URL with optional client IP binding (streams).
 * Omits IP when clientIp is empty or 0.0.0.0 (dev / unknown).
 */
export function signCloudFrontCustom(opts: {
  objectPath: string;
  expiresEpochSec: number;
  clientIp?: string;
}): string {
  const url = resourceUrl(opts.objectPath);
  const condition: Record<string, unknown> = {
    DateLessThan: { "AWS:EpochTime": opts.expiresEpochSec },
  };
  const ip = (opts.clientIp || "").trim();
  if (ip && ip !== "0.0.0.0") {
    condition.IpAddress = { "AWS:SourceIp": `${ip}/32` };
  }
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: url,
        Condition: condition,
      },
    ],
  });
  return getSignedUrl({
    url,
    keyPairId: KEY_PAIR_ID,
    privateKey: PRIVATE_KEY,
    policy,
  });
}

export { resourceUrl as cloudFrontResourceUrl, toUrlSafeBase64 };
