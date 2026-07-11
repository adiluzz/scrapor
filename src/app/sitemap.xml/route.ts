import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getSiteByDomain, normalizeHost } from "@/lib/site";
import { pornstarHasVideosOnSite } from "@/lib/pornstar-sites";
import { videoPageDescription } from "@/lib/seo";
import {
  publicVideoContentUrl,
  publicVideoThumbnailUrl,
  renderSitemapXml,
  renderUrlOnlySitemapEntry,
  renderVideoSitemapUrl,
  sitemapVideoDescription,
  sitemapVideoTitle,
} from "@/lib/video-sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") || h.get("host"));
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;
  const site = await getSiteByDomain(host);

  const [videos, pornstars, creators, tags] = await Promise.all([
    prisma.video.findMany({
      where: { sites: { some: { siteId: site.id } }, isDeleted: false, status: "READY" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        durationSec: true,
        sourceUploadDate: true,
        createdAt: true,
        updatedAt: true,
        viewCount: true,
        tags: { include: { tag: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pornstar.findMany({
      where: pornstarHasVideosOnSite(site.id),
      select: { slug: true },
      distinct: ["slug"],
    }),
    prisma.creatorProfile.findMany({ where: { siteId: site.id }, select: { slug: true } }),
    prisma.tag.findMany({ where: { siteId: site.id }, select: { slug: true } }),
  ]);

  const staticUrls = [
    `${base}/`,
    `${base}/tags`,
    `${base}/pornstars`,
    `${base}/creators`,
    `${base}/privacy`,
    `${base}/dmca`,
    `${base}/2257`,
  ];

  const chunks: string[] = [
    ...staticUrls.map((url) => renderUrlOnlySitemapEntry(url)),
    ...videos.map((video) => {
      const pageUrl = `${base}/videos/${video.slug}`;
      const fallbackDescription = videoPageDescription(video.title, site, video.description);
      return renderVideoSitemapUrl({
        pageUrl,
        thumbnailUrl: publicVideoThumbnailUrl(base, video.id),
        contentUrl: publicVideoContentUrl(base, video.id),
        title: sitemapVideoTitle(video.title),
        description: sitemapVideoDescription(video.description || "", fallbackDescription),
        durationSec: video.durationSec,
        publicationDate: video.sourceUploadDate || video.createdAt,
        viewCount: video.viewCount,
        tags: video.tags.map((t) => t.tag.name),
        lastModified: video.updatedAt,
      });
    }),
    ...pornstars.map((p) => renderUrlOnlySitemapEntry(`${base}/pornstars/${p.slug}`)),
    ...creators.map((c) => renderUrlOnlySitemapEntry(`${base}/creators/${c.slug}`)),
    ...tags.map((t) => renderUrlOnlySitemapEntry(`${base}/tags/${t.slug}`)),
  ];

  const xml = renderSitemapXml(chunks.join("\n"));

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
