import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSite, getCurrentSiteId } from "@/lib/site";
import {
  buildOpenGraph,
  getSiteBaseUrl,
  itemListJsonLd,
  keywordsMeta,
  tagsIndexDescription,
  tagsIndexTitle,
} from "@/lib/seo";
import JsonLd from "@/components/site/JsonLd";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const title = tagsIndexTitle(site);
  const description = tagsIndexDescription(site);
  return {
    title,
    description,
    keywords: keywordsMeta(site, ["tags", "categories"]),
    alternates: { canonical: "/tags" },
    openGraph: buildOpenGraph({
      title,
      description,
      url: "/tags",
      siteName: site.name,
      image: site.ogImagePath,
    }),
  };
}

export default async function TagsIndexPage() {
  const site = await getCurrentSite();
  const siteId = await getCurrentSiteId();
  const base = await getSiteBaseUrl();

  // Tags attached to READY videos on this site (may be owned by another siteId).
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
    take: 500,
  });

  const tagRows =
    grouped.length === 0
      ? []
      : await prisma.tag.findMany({
          where: { id: { in: grouped.map((g) => g.tagId) } },
          select: { id: true, name: true, slug: true },
        });

  const countById = new Map(grouped.map((g) => [g.tagId, g._count.tagId]));
  // Dedupe by slug (shared taxonomy can attach multiple Tag rows).
  const bySlug = new Map<string, { name: string; slug: string; count: number }>();
  for (const t of tagRows) {
    const count = countById.get(t.id) || 0;
    const prev = bySlug.get(t.slug);
    if (!prev) {
      bySlug.set(t.slug, { name: t.name, slug: t.slug, count });
    } else {
      prev.count += count;
    }
  }
  const tags = [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));

  const title = tagsIndexTitle(site);
  const description = tagsIndexDescription(site);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: title,
          description,
          url: `${base}/tags`,
          numberOfItems: tags.length,
        }}
      />
      <JsonLd
        data={itemListJsonLd({
          name: title,
          urls: tags.slice(0, 50).map((t) => `${base}/tags/${t.slug}`),
        })}
      />
      <h1 className="mb-2 text-xl font-semibold text-zinc-100">{title}</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-500">{description}</p>
      {tags.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.slug}
              href={`/tags/${t.slug}`}
              className="max-w-full break-words rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-brand-500/40 hover:text-brand-300"
            >
              {t.name}
              <span className="ml-1.5 text-xs text-zinc-500">{t.count}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
