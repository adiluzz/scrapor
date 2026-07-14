import { prisma } from "@/lib/db";
import { pornstarHasVideosOnSite } from "@/lib/pornstar-sites";

export type PopularLink = { name: string; slug: string };

/** Top tags on a site by video membership count (for crawlable hub links). */
export async function listPopularTags(siteId: string, take = 24): Promise<PopularLink[]> {
  const tags = await prisma.tag.findMany({
    where: { siteId },
    orderBy: { videos: { _count: "desc" } },
    select: { name: true, slug: true },
    take,
  });
  return tags;
}

/** Top pornstars with videos on this site, ordered by video count. */
export async function listPopularPornstars(siteId: string, take = 18): Promise<PopularLink[]> {
  const stars = await prisma.pornstar.findMany({
    where: pornstarHasVideosOnSite(siteId),
    select: {
      name: true,
      slug: true,
      _count: { select: { videos: true } },
    },
    take: Math.max(take * 3, 60),
  });
  return stars
    .sort((a, b) => b._count.videos - a._count.videos)
    .slice(0, take)
    .map(({ name, slug }) => ({ name, slug }));
}
