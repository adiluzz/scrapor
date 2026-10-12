import { GetObjectCommand } from "@aws-sdk/client-s3";
import { signHlsPlaylist, verifyHlsPlaylistToken } from "@/lib/cdn";
import { s3, S3_BUCKET } from "@/lib/storage";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CACHE_MAX = 500;
const CACHE_TTL_MS = 10 * 60 * 1000;
const globalForHls = globalThis as unknown as {
  hlsPlaylistCache?: Map<string, { text: string; at: number }>;
};
const cache = (globalForHls.hlsPlaylistCache ??= new Map());

async function loadPlaylist(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;
  const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const text = (await obj.Body?.transformToString("utf-8")) ?? "";
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { text, at: Date.now() });
  return text;
}

/**
 * Signed HLS playlist: the token is minted by stream-grant / admin playback,
 * and every segment URI is rewritten to a signed CloudFront URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t") || "";
  const payload = verifyHlsPlaylistToken(token);
  if (!payload || payload.v !== id) {
    return new Response("Forbidden", { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0";

  let playlist: string;
  try {
    playlist = await loadPlaylist(payload.k);
  } catch (err) {
    logger.warn({ videoId: id, key: payload.k, err: String(err) }, "hls playlist fetch failed");
    return new Response("Not found", { status: 404 });
  }
  if (!playlist.startsWith("#EXTM3U")) {
    return new Response("Bad playlist", { status: 502 });
  }

  const body = signHlsPlaylist({
    playlist,
    masterKey: payload.k,
    expiresEpochSec: payload.e,
    clientIp: ip,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/vnd.apple.mpegurl",
      "cache-control": "private, no-store",
    },
  });
}
