import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Shared Redis client used for the scrape job queue, autocomplete cache,
 * and rate limiting. Lazily connects; if REDIS_URL is unset it still
 * constructs but callers should guard usage.
 */
export const redis: Redis =
  globalForRedis.redis ||
  new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    enableOfflineQueue: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/** Redis key for the scrape-run job queue (list used as FIFO). */
export const SCRAPE_QUEUE_KEY = "scrape:queue";

/**
 * Redis key for the creator-upload processing queue (list used as FIFO).
 * Carries Video ids; the worker transcodes the uploaded source and generates
 * thumbnail/preview/storyboard, uploads to S3, then marks the video READY.
 */
export const CREATOR_QUEUE_KEY = "creator:queue";

/**
 * Redis key for on-demand hover-preview / storyboard regeneration (Video ids).
 */
export const PREVIEW_QUEUE_KEY = "preview:queue";

/** Redis queue for interactive scrape search requests (handled by worker). */
export const SCRAPE_SEARCH_QUEUE_KEY = "scrape:search:queue";

/** Redis queue for re-downloading a video from its source URL (Video ids). */
export const REDOWNLOAD_QUEUE_KEY = "redownload:queue";

/**
 * Redis queue for normalizing existing S3 MP4s and packaging HLS (Video ids).
 * Seeded on worker startup for catalog rows missing s3HlsMasterKey.
 */
export const HLS_BACKFILL_QUEUE_KEY = "hls:backfill:queue";

/** Dedup set: video ids already enqueued for HLS backfill. */
export const HLS_BACKFILL_SCHEDULED_KEY = "hls:backfill:scheduled";

/** Pornstar ids awaiting ThePornDB profile/image enrichment. */
export const PORNSTAR_TPDB_QUEUE_KEY = "pornstar:tpdb:queue";

export function scrapeSearchResultKey(requestId: string): string {
  return `scrape:search:result:${requestId}`;
}

/**
 * Fixed-window rate limiter. Returns true when the action is allowed.
 * Fails open (allows) if Redis is unavailable so auth never hard-breaks.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSeconds);
    return count <= limit;
  } catch {
    return true;
  }
}
