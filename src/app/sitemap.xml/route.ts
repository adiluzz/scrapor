import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getSiteByDomain, normalizeHost } from "@/lib/site";
import { renderSitemapIndexXml, SITEMAP_VIDEO_CHUNK_SIZE } from "@/lib/video-sitemap";

export const dynamic = "force-dynamic";

const CACHE_HEADER = "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400";

/**
 * Sitemap index — points at small per-content-type sitemaps under /sitemaps/
 * instead of one giant file. Videos are chunked (1,000/URLs each, stable
 * chunk membership: ordered by createdAt ascending so old chunks never move).
 */
export async function GET() {
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") || h.get("host"));
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;
  const site = await getSiteByDomain(host);

  const [videoCount, latestVideo] = await Promise.all([
    prisma.video.count({
      where: { sites: { some: { siteId: site.id } }, isDeleted: false, status: "READY" },
    }),
    prisma.video.findFirst({
      where: { sites: { some: { siteId: site.id } }, isDeleted: false, status: "READY" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const videoChunks = Math.max(1, Math.ceil(videoCount / SITEMAP_VIDEO_CHUNK_SIZE));
  const sitemaps: { loc: string; lastModified?: Date | null }[] = [
    { loc: `${base}/sitemaps/static.xml` },
    ...Array.from({ length: videoChunks }, (_, i) => ({
      loc: `${base}/sitemaps/videos-${i + 1}.xml`,
      // Only the newest chunk actually changes, but latest createdAt is a
      // stable "content changed" signal (unlike updatedAt row churn).
      lastModified: i + 1 === videoChunks ? latestVideo?.createdAt : null,
    })),
    { loc: `${base}/sitemaps/tags.xml` },
    { loc: `${base}/sitemaps/pornstars.xml` },
  ];

  return new NextResponse(renderSitemapIndexXml(sitemaps), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": CACHE_HEADER,
    },
  });
}
