import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSite, getSiteIdForAuth } from "@/lib/site";
import { pornstarHasVideosOnSite } from "@/lib/pornstar-sites";
import { tagHasVideosOnSite } from "@/lib/tag-sites";
import { topSearches } from "@/lib/search";
import { redis } from "@/lib/redis";
import { guardApiRoute } from "@/lib/admin-guard";
import { isVerifiedBadgeTag, verifiedTagDefinitionsForSite } from "@/lib/verified-tags";

type Suggestion = {
  type: "pornstar" | "tag" | "search";
  label: string;
  value: string;
  icon?: string | null;
  verified?: boolean;
};

const TOP_CACHE_TTL = 600; // seconds

async function getTopSearches(siteId: string) {
  const key = `suggest:top:${siteId}`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as { normalized: string; sample: string; count: number }[];
  } catch {
    /* redis optional */
  }
  const rows = await topSearches(siteId, 5000);
  try {
    await redis.set(key, JSON.stringify(rows), "EX", TOP_CACHE_TTL);
  } catch {
    /* ignore */
  }
  return rows;
}

export async function GET(request: Request) {
  const auth = await guardApiRoute(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const [siteId, site] = await Promise.all([getSiteIdForAuth(auth), getCurrentSite()]);
  const verifiedSlugs = verifiedTagDefinitionsForSite(site.domain)
    .filter(
      (def) =>
        def.name.toLowerCase().includes(q) ||
        def.slug.includes(q.replace(/\s+/g, "-"))
    )
    .map((def) => def.slug);

  const [pornstars, verifiedTagsRows, regularTagsRows, top] = await Promise.all([
    prisma.pornstar.findMany({
      where: {
        ...pornstarHasVideosOnSite(siteId),
        name: { contains: q, mode: "insensitive" },
      },
      select: { name: true, slug: true },
      distinct: ["slug"],
      take: 4,
    }),
    verifiedSlugs.length
      ? prisma.tag.findMany({
          where: {
            slug: { in: verifiedSlugs },
            ...tagHasVideosOnSite(siteId),
          },
          select: { name: true, slug: true, icon: true },
          distinct: ["slug"],
        })
      : Promise.resolve([]),
    prisma.tag.findMany({
      where: {
        ...tagHasVideosOnSite(siteId),
        ...(verifiedSlugs.length ? { slug: { notIn: verifiedSlugs } } : {}),
        name: { contains: q, mode: "insensitive" },
      },
      select: { name: true, slug: true, icon: true },
      distinct: ["slug"],
      take: 8,
      orderBy: { name: "asc" },
    }),
    getTopSearches(siteId),
  ]);

  const searchHits = top
    .filter((s) => s.normalized.includes(q))
    .slice(0, 5)
    .map<Suggestion>((s) => ({ type: "search", label: s.sample, value: s.normalized }));

  const verifiedTags = verifiedTagsRows.map<Suggestion>((t) => ({
    type: "tag",
    label: t.name,
    value: t.slug,
    icon: t.icon,
    verified: true,
  }));
  verifiedTags.sort((a, b) => a.label.localeCompare(b.label));

  const regularTags = regularTagsRows
    .filter((t) => !isVerifiedBadgeTag(t))
    .slice(0, 4)
    .map<Suggestion>((t) => ({
      type: "tag",
      label: t.name,
      value: t.slug,
      icon: t.icon,
      verified: false,
    }));

  const suggestions: Suggestion[] = [
    ...verifiedTags,
    ...regularTags,
    ...pornstars.map<Suggestion>((p) => ({ type: "pornstar", label: p.name, value: p.slug })),
    ...searchHits,
  ].slice(0, 10);

  return NextResponse.json({ suggestions });
}
