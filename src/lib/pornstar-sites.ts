import { prisma } from "@/lib/db";
import { PISS_SWALLOW_VERIFIED_SLUG } from "@/lib/verified-tags";

export type SiteVideoCount = {
  siteId: string;
  name: string;
  slug: string;
  primaryColor: string;
  count: number;
};

/** Count non-deleted videos linked to each pornstar, grouped by publication site. */
export async function pornstarSiteVideoCounts(
  pornstarIds: string[]
): Promise<Map<string, SiteVideoCount[]>> {
  const result = new Map<string, SiteVideoCount[]>();
  if (pornstarIds.length === 0) return result;

  const links = await prisma.videoPornstar.findMany({
    where: {
      pornstarId: { in: pornstarIds },
      video: { isDeleted: false },
    },
    select: {
      pornstarId: true,
      video: {
        select: {
          sites: {
            select: {
              site: {
                select: { id: true, name: true, slug: true, primaryColor: true },
              },
            },
          },
        },
      },
    },
  });

  const tallies = new Map<string, Map<string, SiteVideoCount>>();
  for (const link of links) {
    let bySite = tallies.get(link.pornstarId);
    if (!bySite) {
      bySite = new Map();
      tallies.set(link.pornstarId, bySite);
    }
    for (const { site } of link.video.sites) {
      const existing = bySite.get(site.id);
      if (existing) {
        existing.count += 1;
      } else {
        bySite.set(site.id, {
          siteId: site.id,
          name: site.name,
          slug: site.slug,
          primaryColor: site.primaryColor,
          count: 1,
        });
      }
    }
  }

  for (const [pornstarId, bySite] of tallies) {
    result.set(
      pornstarId,
      [...bySite.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    );
  }
  return result;
}

/** Public-site filter: pornstar has ≥1 READY video published on this site. */
export function pornstarHasVideosOnSite(siteId: string) {
  return {
    videos: {
      some: {
        video: {
          isDeleted: false,
          status: "READY" as const,
          sites: { some: { siteId } },
        },
      },
    },
  };
}

/** True when the pornstar has a READY video on this site with the verified piss swallow tag. */
export async function pornstarHasVerifiedPissSwallowTag(
  siteId: string,
  pornstarSlug: string
): Promise<boolean> {
  const count = await prisma.video.count({
    where: {
      isDeleted: false,
      status: "READY",
      sites: { some: { siteId } },
      pornstars: { some: { pornstar: { slug: pornstarSlug } } },
      tags: { some: { tag: { siteId, slug: PISS_SWALLOW_VERIFIED_SLUG } } },
    },
  });
  return count > 0;
}
