import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSiteId } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pornstars", description: "Browse pornstars." };

export default async function PornstarsPage() {
  const siteId = await getCurrentSiteId();
  const stars = await prisma.pornstar.findMany({
    where: { siteId },
    orderBy: { name: "asc" },
    include: { _count: { select: { videos: true } } },
    take: 200,
  });

  return (
    <>
      <h1 className="mb-5 text-xl font-semibold text-zinc-100">Pornstars</h1>
      {stars.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No pornstars yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {stars.map((s) => (
            <Link
              key={s.id}
              href={`/pornstars/${s.slug}`}
              className="group flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center hover:border-pink-500/50"
            >
              <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-600 to-purple-600 text-2xl font-bold text-white">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{s.name}</span>
              <span className="text-xs text-zinc-500">{s._count.videos} videos</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
