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
  SITEMAP_VIDEO_CHUNK_SIZE,
  sitemapVideoDescription,
  sitemapVideoTitle,
} from "@/lib/video-sitemap";
import type { Site } from "@prisma/client";

export const dynamic = "force-dynamic";

const CACHE_HEADER = "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400";

function xmlResponse(body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": CACHE_HEADER,
    },
  });
}

async function staticSitemap(base: string, site: Site): Promise<NextResponse> {
  const creators = await prisma.creatorProfile.findMany({
    where: { siteId: site.id },
    select: { slug: true },
  });
  const urls = [
    // Slash-free homepage to match the rendered canonical (Next strips the trailing slash).
    base,
    `${base}/tags`,
    `${base}/pornstars`,
    `${base}/creators`,
    `${base}/our-network`,
    `${base}/privacy`,
    `${base}/dmca`,
    `${base}/2257`,
    ...(site.kind === "STUDIO" ? [`${base}/contact`] : []),
    ...creators.map((c) => `${base}/creators/${c.slug}`),
  ];
  return xmlResponse(renderSitemapXml(urls.map((u) => renderUrlOnlySitemapEntry(u)).join("\n")));
}

async function videosSitemap(base: string, site: Site, chunk: number): Promise<NextResponse | null> {
  if (!Number.isInteger(chunk) || chunk < 1) return null;
  const videos = await prisma.video.findMany({
    where: { sites: { some: { siteId: site.id } }, isDeleted: false, status: "READY" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      durationSec: true,
      sourceUploadDate: true,
      createdAt: true,
      viewCount: true,
      tags: { include: { tag: { select: { name: true } } } },
    },
    // Ascending keeps chunk membership stable: new videos only append to the
    // newest chunk instead of reshuffling every chunk on each scrape.
    orderBy: { createdAt: "asc" },
    skip: (chunk - 1) * SITEMAP_VIDEO_CHUNK_SIZE,
    take: SITEMAP_VIDEO_CHUNK_SIZE,
  });
  if (videos.length === 0 && chunk > 1) return null;

  const body = videos
    .map((video) => {
      const pageUrl = `${base}/videos/${video.slug}`;
      const fallbackDescription = videoPageDescription(video.title, site, video.description);
      return renderVideoSitemapUrl({
        pageUrl,
        thumbnailUrl: publicVideoThumbnailUrl(base, video.id),
        contentUrl: publicVideoContentUrl(base, video.id),
        title: sitemapVideoTitle(video.title),
        description: sitemapVideoDescription(video.description || "", fallbackDescription),
        durationSec: video.durationSec,
        // Only the real source upload date; omit when unknown instead of
        // claiming the scrape time as publication date.
        publicationDate: video.sourceUploadDate,
        viewCount: video.viewCount,
        tags: video.tags.map((t) => t.tag.name),
        // createdAt is stable; updatedAt churns on every view-count touch.
        lastModified: video.createdAt,
      });
    })
    .join("\n");
  return xmlResponse(renderSitemapXml(body));
}

async function tagsSitemap(base: string, site: Site): Promise<NextResponse> {
  const tags = await prisma.tag.findMany({ where: { siteId: site.id }, select: { slug: true } });
  return xmlResponse(
    renderSitemapXml(
      tags.map((t) => renderUrlOnlySitemapEntry(`${base}/tags/${t.slug}`)).join("\n")
    )
  );
}

async function pornstarsSitemap(base: string, site: Site): Promise<NextResponse> {
  const pornstars = await prisma.pornstar.findMany({
    where: pornstarHasVideosOnSite(site.id),
    select: { slug: true },
    distinct: ["slug"],
  });
  return xmlResponse(
    renderSitemapXml(
      pornstars.map((p) => renderUrlOnlySitemapEntry(`${base}/pornstars/${p.slug}`)).join("\n")
    )
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") || h.get("host"));
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;
  const site = await getSiteByDomain(host);

  let res: NextResponse | null = null;
  if (name === "static.xml") res = await staticSitemap(base, site);
  else if (name === "tags.xml") res = await tagsSitemap(base, site);
  else if (name === "pornstars.xml") res = await pornstarsSitemap(base, site);
  else {
    const m = /^videos-(\d+)\.xml$/.exec(name);
    if (m) res = await videosSitemap(base, site, Number(m[1]));
  }

  return res ?? NextResponse.json({ error: "Not found" }, { status: 404 });
}
