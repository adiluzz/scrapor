import type { Metadata } from "next";
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
import TagBadge from "@/components/site/TagBadge";
import TagsVerifiedFilter from "@/components/site/TagsVerifiedFilter";
import { isVerifiedBadgeTag } from "@/lib/verified-tags";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

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

export default async function TagsIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const verifiedOnly = (Array.isArray(sp.verified) ? sp.verified[0] : sp.verified) === "1";

  const site = await getCurrentSite();
  const siteId = await getCurrentSiteId();
  const base = await getSiteBaseUrl();

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
          select: { id: true, name: true, slug: true, icon: true },
        });

  const countById = new Map(grouped.map((g) => [g.tagId, g._count.tagId]));
  const bySlug = new Map<
    string,
    { name: string; slug: string; count: number; icon: string | null }
  >();
  for (const t of tagRows) {
    const count = countById.get(t.id) || 0;
    const prev = bySlug.get(t.slug);
    if (!prev) {
      bySlug.set(t.slug, { name: t.name, slug: t.slug, count, icon: t.icon });
    } else {
      prev.count += count;
      if (!prev.icon && t.icon) prev.icon = t.icon;
    }
  }

  let tags = [...bySlug.values()];
  if (verifiedOnly) {
    tags = tags.filter((t) => isVerifiedBadgeTag(t));
  }
  tags.sort((a, b) => {
    const av = isVerifiedBadgeTag(a);
    const bv = isVerifiedBadgeTag(b);
    if (av !== bv) return av ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

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
      <p className="mb-4 max-w-2xl text-sm text-zinc-500">{description}</p>

      {site.verifiedTagsIntroHtml ? (
        <div
          className="prose prose-invert prose-sm mb-5 max-w-2xl text-zinc-400"
          dangerouslySetInnerHTML={{ __html: site.verifiedTagsIntroHtml }}
        />
      ) : null}

      <TagsVerifiedFilter verifiedOnly={verifiedOnly} />

      {tags.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">
          {verifiedOnly ? "No verified tags yet." : "No tags yet."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) =>
            isVerifiedBadgeTag(t) ? (
              <TagBadge
                key={t.slug}
                name={`${t.name} (${t.count})`}
                slug={t.slug}
                icon={t.icon}
                href={`/tags/${t.slug}`}
                primaryColor={site.primaryColor}
                className="text-sm"
              />
            ) : (
              <TagBadge
                key={t.slug}
                name={`${t.name} (${t.count})`}
                slug={t.slug}
                href={`/tags/${t.slug}`}
                className="text-sm"
              />
            )
          )}
        </div>
      )}
    </>
  );
}
