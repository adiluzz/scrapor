import crypto from "crypto";
import { redis } from "@/lib/redis";

export type AdSession = {
  id: string;
  videoId: string;
  siteId: string;
  openedAt: number;
  adRequired: boolean;
  consumed: boolean;
};

const TTL_SECONDS = 900;
const fallback = new Map<string, AdSession>(); // used only when Redis is unavailable

function key(id: string) {
  return `adsession:${id}`;
}

export async function openAdSession(
  videoId: string,
  siteId: string,
  adRequired: boolean
): Promise<AdSession> {
  const session: AdSession = {
    id: crypto.randomUUID(),
    videoId,
    siteId,
    openedAt: Date.now(),
    adRequired,
    consumed: false,
  };
  try {
    await redis.set(key(session.id), JSON.stringify(session), "EX", TTL_SECONDS);
  } catch {
    fallback.set(session.id, session);
  }
  return session;
}

export async function getAdSession(id: string): Promise<AdSession | null> {
  try {
    const raw = await redis.get(key(id));
    if (raw) return JSON.parse(raw) as AdSession;
  } catch {
    /* fall through */
  }
  return fallback.get(id) ?? null;
}

export async function consumeAdSession(session: AdSession): Promise<void> {
  session.consumed = true;
  try {
    await redis.set(key(session.id), JSON.stringify(session), "EX", TTL_SECONDS);
  } catch {
    fallback.set(session.id, session);
  }
}
