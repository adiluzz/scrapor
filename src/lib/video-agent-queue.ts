import { redis } from "@/lib/redis";

const QUEUE_KEY = process.env.VIDEO_AGENT_QUEUE_KEY || "video-agent:queue";

export async function enqueueVideoAgentRun(runId: string): Promise<void> {
  await redis.rpush(QUEUE_KEY, runId);
}

export { QUEUE_KEY };
