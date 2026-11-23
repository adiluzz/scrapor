import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Videos still listed on this site.
 * A suspended VideoSite row keeps the slug; the public page 404s instead.
 */
export function publicOnSite(siteId: string): Prisma.VideoSiteListRelationFilter {
  return { some: { siteId, suspended: false } };
}

/** True when this video is published on the site and not suspended. */
export async function isPubliclyPublished(videoId: string, siteId: string): Promise<boolean> {
  const row = await prisma.videoSite.findUnique({
    where: { videoId_siteId: { videoId, siteId } },
    select: { suspended: true },
  });
  return Boolean(row && !row.suspended);
}
