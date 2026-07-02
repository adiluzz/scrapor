import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getSiteByDomain, normalizeHost } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") || h.get("host"));
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;

  const site = await getSiteByDomain(host);

  const [videos, pornstars, creators, tags] = await Promise.all([
    prisma.video.findMany({
      where: { siteId: site.id, isDeleted: false, status: "READY" },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.pornstar.findMany({ where: { siteId: site.id }, select: { slug: true }, take: 5000 }),
    prisma.creatorProfile.findMany({ where: { siteId: site.id }, select: { slug: true }, take: 5000 }),
    prisma.tag.findMany({ where: { siteId: site.id }, select: { slug: true }, take: 5000 }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/tags`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/pornstars`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/creators`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/dmca`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/2257`, changeFrequency: "yearly", priority: 0.2 },
  ];

  return [
    ...staticRoutes,
    ...videos.map((v) => ({
      url: `${base}/videos/${v.slug}`,
      lastModified: v.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...pornstars.map((p) => ({
      url: `${base}/pornstars/${p.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...creators.map((c) => ({
      url: `${base}/creators/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...tags.map((t) => ({
      url: `${base}/tags/${t.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.65,
    })),
  ];
}
