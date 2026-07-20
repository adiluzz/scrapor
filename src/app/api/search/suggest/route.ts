import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSiteIdForAuth } from "@/lib/site";
import { pornstarHasVideosOnSite } from "@/lib/pornstar-sites";
import { tagHasVideosOnSite } from "@/lib/tag-sites";
import { topSearches } from "@/lib/search";
import { redis } from "@/lib/redis";
import { guardApiRoute } from "@/lib/admin-guard";
import { isVerifiedBadgeTag } from "@/lib/verified-tags";

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

  const siteId = await getSiteIdForAuth(auth);

  const [pornstars, tags, top] = await Promise.all([
    prisma.pornstar.findMany({
      where: {
        ...pornstarHasVideosOnSite(siteId),
        name: { contains: q, mode: "insensitive" },
      },
      select: { name: true, slug: true },
      distinct: ["slug"],
      take: 4,
    }),
    prisma.tag.findMany({
      where: {
        ...tagHasVideosOnSite(siteId),
        name: { contains: q, mode: "insensitive" },
      },
      select: { name: true, slug: true, icon: true },
      distinct: ["slug"],
      take: 12,
    }),
    getTopSearches(siteId),
  ]);

  const searchHits = top
    .filter((s) => s.normalized.includes(q))
    .slice(0, 5)
    .map<Suggestion>((s) => ({ type: "search", label: s.sample, value: s.normalized }));

  const tagSuggestions = tags.map<Suggestion>((t) => ({
    type: "tag",
    label: t.name,
    value: t.slug,
    icon: t.icon,
    verified: isVerifiedBadgeTag(t),
  }));

  tagSuggestions.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  const verifiedTags = tagSuggestions.filter((t) => t.verified).slice(0, 4);
  const regularTags = tagSuggestions.filter((t) => !t.verified).slice(0, 4);

  const suggestions: Suggestion[] = [
    ...verifiedTags,
    ...regularTags,
    ...pornstars.map<Suggestion>((p) => ({ type: "pornstar", label: p.name, value: p.slug })),
    ...searchHits,
  ].slice(0, 10);

  return NextResponse.json({ suggestions });
}
