import { redis } from "@/lib/redis";

const QUEUE_KEY = process.env.PROMO_AD_QUEUE_KEY || "promo-ad:queue";

export async function enqueuePromoAdIteration(iterationId: string): Promise<void> {
  await redis.rpush(QUEUE_KEY, iterationId);
}

export { QUEUE_KEY };
