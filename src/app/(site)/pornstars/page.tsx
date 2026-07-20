import type { Metadata } from "next";
import Link from "next/link";
import InPageSearch from "@/components/site/InPageSearch";
import PornstarAvatar from "@/components/site/PornstarAvatar";
import TagIcon from "@/components/site/TagIcon";
import JsonLd from "@/components/site/JsonLd";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { pornstarHasVideosOnSite, pornstarSlugsWithVerifiedPissSwallowTag } from "@/lib/pornstar-sites";
import {
  GOLDEN_DROP_ICON,
  PISS_SWALLOWER_PORNSTAR_LABEL,
  PISS_SWALLOW_VERIFIED_SLUG,
} from "@/lib/verified-tags";
import {
  buildOpenGraph,
  getSiteBaseUrl,
  itemListJsonLd,
  keywordsMeta,
  pornstarsIndexDescription,
  pornstarsIndexTitle,
} from "@/lib/seo";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const title = pornstarsIndexTitle(site);
  const description = pornstarsIndexDescription(site);
  return {
    title,
    description,
    keywords: keywordsMeta(site, ["pornstars", "models"]),
    alternates: { canonical: "/pornstars" },
    openGraph: buildOpenGraph({
      title,
      description,
      url: "/pornstars",
      siteName: site.name,
      image: site.ogImagePath,
    }),
  };
}

export default async function PornstarsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const site = await getCurrentSite();
  const siteId = site.id;
  const base = await getSiteBaseUrl();
  const sp = await searchParams;
  const qRaw = sp.q;
  const q = (Array.isArray(qRaw) ? qRaw[0] : qRaw || "").trim();
  const title = pornstarsIndexTitle(site);
  const description = pornstarsIndexDescription(site);

  const onSite = pornstarHasVideosOnSite(siteId);
  const [starsRaw, pissSwallowerSlugs] = await Promise.all([
    prisma.pornstar.findMany({
      where: {
        ...onSite,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ videos: { _count: "desc" } }, { name: "asc" }],
      include: {
        _count: {
          select: {
            videos: {
              where: {
                video: {
                  isDeleted: false,
                  status: "READY",
                  sites: { some: { siteId } },
                },
              },
            },
          },
        },
      },
      take: 800,
    }),
    pornstarSlugsWithVerifiedPissSwallowTag(siteId),
  ]);

  const bySlug = new Map<string, (typeof starsRaw)[number]>();
  for (const s of starsRaw) {
    const existing = bySlug.get(s.slug);
    if (
      !existing ||
      s._count.videos > existing._count.videos ||
      (Boolean(s.s3Image) && !existing.s3Image)
    ) {
      bySlug.set(s.slug, s);
    }
  }
  const stars = [...bySlug.values()]
    .filter((s) => s._count.videos > 0)
    .sort((a, b) => b._count.videos - a._count.videos || a.name.localeCompare(b.name))
    .slice(0, 500);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: title,
          description,
          url: `${base}/pornstars`,
          numberOfItems: stars.length,
        }}
      />
      <JsonLd
        data={itemListJsonLd({
          name: title,
          urls: stars.slice(0, 50).map((s) => `${base}/pornstars/${s.slug}`),
        })}
      />
      <h1 className="mb-2 text-xl font-semibold text-zinc-100">{title}</h1>
      <p className="mb-5 max-w-2xl text-sm text-zinc-500">{description}</p>
      <div className="mb-6">
        <InPageSearch placeholder="Search pornstars…" />
      </div>
      {stars.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">
          {q ? `No pornstars matching “${q}”.` : "No pornstars yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {stars.map((s) => (
            <Link
              key={s.slug}
              href={`/pornstars/${s.slug}`}
              className="group flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center hover:border-brand-500/50"
            >
              <PornstarAvatar name={s.name} pornstar={s} size="xl" className="mb-3" />
              <span className="flex w-full min-w-0 items-center justify-center gap-1">
                <span className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
                  {s.name}
                </span>
                {pissSwallowerSlugs.has(s.slug) ? (
                  <span
                    className="inline-flex shrink-0 rounded-full border border-brand-500/35 bg-brand-950/60 p-0.5"
                    title={`Verified ${PISS_SWALLOWER_PORNSTAR_LABEL}`}
                  >
                    <TagIcon
                      icon={GOLDEN_DROP_ICON}
                      slug={PISS_SWALLOW_VERIFIED_SLUG}
                      className="h-3 w-3"
                    />
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-zinc-500">{s._count.videos} videos</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
