import type { Metadata } from "next";
import Link from "next/link";
import InPageSearch from "@/components/site/InPageSearch";
import PornstarAvatar from "@/components/site/PornstarAvatar";
import { prisma } from "@/lib/db";
import { getCurrentSite, getCurrentSiteId } from "@/lib/site";
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
  const stars = await prisma.pornstar.findMany({
    where: {
      siteId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ videos: { _count: "desc" } }, { name: "asc" }],
    include: { _count: { select: { videos: true } } },
    take: 500,
  });

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold text-zinc-100">Piss drinking pornstars</h1>
      <p className="mb-5 max-w-2xl text-sm text-zinc-500">
        Browse models sorted by how many videos they appear in.
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
              key={s.id}
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
