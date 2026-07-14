import { prisma } from "@/lib/db";

export type PopularLink = { name: string; slug: string };

/**
 * Top tags used by videos published on this site (by usage count).
 * Prefer tags attached to site videos over Tag.siteId ownership so
 * multi-tenant published videos surface correct hubs.
 */
export async function listPopularTags(siteId: string, take = 24): Promise<PopularLink[]> {
  const grouped = await prisma.videoTag.groupBy({
    by: ["tagId"],
    where: {
      video: {
        isDeleted: false,
        status: "READY",
        sites: { some: { siteId } },
      },
    },
    _count: { tagId: true },
    orderBy: { _count: { tagId: "desc" } },
    take,
  });
  if (grouped.length === 0) return [];

  const tags = await prisma.tag.findMany({
    where: { id: { in: grouped.map((g) => g.tagId) } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(tags.map((t) => [t.id, t]));
  return grouped
    .map((g) => byId.get(g.tagId))
    .filter((t): t is { id: string; name: string; slug: string } => Boolean(t))
    .map(({ name, slug }) => ({ name, slug }));
}

/** Top pornstars with READY videos published on this site, by usage count. */
export async function listPopularPornstars(siteId: string, take = 18): Promise<PopularLink[]> {
  const grouped = await prisma.videoPornstar.groupBy({
    by: ["pornstarId"],
    where: {
      video: {
        isDeleted: false,
        status: "READY",
        sites: { some: { siteId } },
      },
    },
    _count: { pornstarId: true },
    orderBy: { _count: { pornstarId: "desc" } },
    take,
  });
  if (grouped.length === 0) return [];

  const stars = await prisma.pornstar.findMany({
    where: { id: { in: grouped.map((g) => g.pornstarId) } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(stars.map((s) => [s.id, s]));
  return grouped
    .map((g) => byId.get(g.pornstarId))
    .filter((s): s is { id: string; name: string; slug: string } => Boolean(s))
    .map(({ name, slug }) => ({ name, slug }));
}
