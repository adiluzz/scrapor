import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Public-site filter: tag is attached to ≥1 READY video published on this site.
 * Prefer this over Tag.siteId ownership — multi-tenant publishes share Tag rows.
 */
export function tagHasVideosOnSite(siteId: string): Prisma.TagWhereInput {
  return {
    videos: {
      some: {
        video: {
          isDeleted: false,
          status: "READY",
          sites: { some: { siteId } },
        },
      },
    },
  };
}

/** Resolve a tag by slug for this site (owned row first, else any used on site videos). */
export async function resolveTagForSite(siteId: string, slug: string) {
  const owned = await prisma.tag.findUnique({
    where: { siteId_slug: { siteId, slug } },
  });
  if (owned) return owned;
  return prisma.tag.findFirst({
    where: { slug, ...tagHasVideosOnSite(siteId) },
    orderBy: { name: "asc" },
  });
}
