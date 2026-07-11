import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSite, getCurrentSiteId } from "@/lib/site";
import { getSiteBaseUrl, keywordsMeta, siteHomeDescription } from "@/lib/seo";
import JsonLd from "@/components/site/JsonLd";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: "Tags",
    description:
      `Browse tags on ${site.name}. ` +
      siteHomeDescription(site).split(".")[0] + ".",
    keywords: keywordsMeta(site, ["tags", "categories"]),
    alternates: { canonical: "/tags" },
  };
}

export default async function TagsIndexPage() {
  const siteId = await getCurrentSiteId();
  const base = await getSiteBaseUrl();
  const tags = await prisma.tag.findMany({
    where: { siteId },
    orderBy: { name: "asc" },
    include: { _count: { select: { videos: true } } },
    take: 500,
  });

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Piss drinking & watersports tags",
          url: `${base}/tags`,
          numberOfItems: tags.length,
        }}
      />
      <h1 className="mb-2 text-xl font-semibold text-zinc-100">Browse tags</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-500">
        Explore piss drinking, golden shower, pee drinking, and watersports categories.
      </p>
      {tags.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.id}
              href={`/tags/${t.slug}`}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-brand-500/40 hover:text-brand-300"
            >
              {t.name}
              <span className="ml-1.5 text-xs text-zinc-500">{t._count.videos}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
