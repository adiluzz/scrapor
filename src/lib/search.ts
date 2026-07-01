import { prisma } from "@/lib/db";
import { normalizeQuery } from "@/lib/slug";
import { logger } from "@/lib/logger";

/**
 * Record a search: upsert exactly one row per (siteId, normalized) and bump its
 * count. Fire-and-forget from callers so it never blocks rendering.
 */
export async function trackSearch(siteId: string, rawQuery: string): Promise<void> {
  const normalized = normalizeQuery(rawQuery);
  if (!normalized) return;
  try {
    await prisma.searchQuery.upsert({
      where: { siteId_normalized: { siteId, normalized } },
      update: { count: { increment: 1 }, sample: rawQuery.trim() },
      create: { siteId, normalized, sample: rawQuery.trim(), count: 1 },
    });
  } catch (err) {
    logger.warn({ err: String(err), siteId, normalized }, "trackSearch failed");
  }
}

/** Top-N most searched queries for a site (drives the autocomplete cache). */
export async function topSearches(siteId: string, limit = 5000) {
  return prisma.searchQuery.findMany({
    where: { siteId },
    orderBy: { count: "desc" },
    take: limit,
    select: { normalized: true, sample: true, count: true },
  });
}
