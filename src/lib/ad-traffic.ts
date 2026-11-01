import { rateLimit } from "@/lib/redis";

/**
 * Crawlers that execute the player were starting pre-roll from datacenter and
 * proxy addresses. Ad networks then see those plays as bot traffic and block
 * the publisher account. Known bot user-agents are refused, and one IP cannot
 * start plays in parallel or dozens of times in a few minutes.
 *
 * Playback still proceeds with no ad. Redis errors fail open so a cache blip
 * does not take pre-roll down for everyone.
 */

const BOT_UA =
  /bot\b|spider|crawler|crawl\b|slurp|headless|phantom|scrapy|python-requests|curl\/|wget|go-http-client|axios\/|petalbot|bytespider|gptbot|claudebot|ahrefs|semrush|facebookexternalhit|embedly/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const value = (ua || "").trim();
  if (value.length < 20) return true;
  return BOT_UA.test(value);
}

export async function allowAdTraffic(ip: string, ua: string | null | undefined): Promise<boolean> {
  if (isBotUserAgent(ua)) return false;
  const burstOk = await rateLimit(`ads:vast:burst:${ip}`, 3, 10);
  if (!burstOk) return false;
  return rateLimit(`ads:vast:${ip}`, 12, 600);
}
