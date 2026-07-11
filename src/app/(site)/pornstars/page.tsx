import type { Metadata } from "next";
import Link from "next/link";
import InPageSearch from "@/components/site/InPageSearch";
import PornstarAvatar from "@/components/site/PornstarAvatar";
import { prisma } from "@/lib/db";
import { getCurrentSite, getCurrentSiteId } from "@/lib/site";
import { pornstarHasVideosOnSite } from "@/lib/pornstar-sites";
import { keywordsMeta, siteHomeDescription } from "@/lib/seo";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: "Pornstars",
    description:
      `Browse pornstars on ${site.name}. ` +
      siteHomeDescription(site).split(".")[0] + ".",
    keywords: keywordsMeta(site, ["pornstars", "models"]),
    alternates: { canonical: "/pornstars" },
  };
}

export default async function PornstarsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const siteId = await getCurrentSiteId();
  const sp = await searchParams;
  const qRaw = sp.q;
  const q = (Array.isArray(qRaw) ? qRaw[0] : qRaw || "").trim();

  const onSite = pornstarHasVideosOnSite(siteId);
  const starsRaw = await prisma.pornstar.findMany({
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
  });

  // Same person may exist as multiple per-site rows; keep one entry per slug.
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
      <h1 className="mb-2 text-xl font-semibold text-zinc-100">Pornstars</h1>
      <p className="mb-5 max-w-2xl text-sm text-zinc-500">
        Browse models with videos on this site, sorted by video count.
      </p>
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
              <span className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{s.name}</span>
              <span className="text-xs text-zinc-500">{s._count.videos} videos</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
