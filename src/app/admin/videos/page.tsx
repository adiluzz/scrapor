import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { toCard } from "@/lib/queries";
import type { Prisma } from "@prisma/client";
import AdminVideoRow from "@/components/admin/AdminVideoRow";
import AdminVideoViewToggle from "@/components/admin/AdminVideoViewToggle";
import VideoGrid from "@/components/site/VideoGrid";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

type SearchParams = Record<string, string | string[] | undefined>;

function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) || "";
}

export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp, "q");
  const siteId = param(sp, "siteId");
  const orphans = param(sp, "orphans") === "1";
  const page = Math.max(1, parseInt(param(sp, "page") || "1", 10));
  const view = param(sp, "view") === "grid" ? "grid" : "table";

  const sites = await prisma.site.findMany({
    orderBy: [{ networkOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, primaryColor: true },
  });

  const where: Prisma.VideoWhereInput = {
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(orphans
      ? { sites: { none: {} } }
      : siteId
        ? { sites: { some: { siteId } } }
        : {}),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        sites: { include: { site: { select: { id: true, name: true, primaryColor: true } } } },
        pornstars: { include: { pornstar: true }, take: 3 },
      },
    }),
    prisma.video.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cards = view === "grid" ? await Promise.all(videos.map((v) => toCard(v))) : [];

  const filterQs = new URLSearchParams();
  if (q) filterQs.set("q", q);
  if (siteId) filterQs.set("siteId", siteId);
  if (orphans) filterQs.set("orphans", "1");
  filterQs.set("view", view);
  const pageLink = (p: number) => {
    const qs = new URLSearchParams(filterQs);
    qs.set("page", String(p));
    return `/admin/videos?${qs.toString()}`;
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-white sm:text-2xl">
        Videos <span className="text-base font-normal text-zinc-500">({total})</span>
      </h1>

      <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/videos">
        <input type="hidden" name="view" value={view} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title…"
          className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
        />
        <label className="text-sm text-zinc-400">
          Site
          <select
            name="siteId"
            defaultValue={orphans ? "" : siteId}
            className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" name="orphans" value="1" defaultChecked={orphans} />
          Orphans only
        </label>
        <button
          type="submit"
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          Filter
        </button>
      </form>

      <AdminVideoViewToggle q={q} page={page} view={view} siteId={siteId} orphans={orphans} />

      {view === "grid" ? (
        <VideoGrid videos={cards} hrefPrefix="/admin/videos" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Sites</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {videos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                    No videos.
                  </td>
                </tr>
              ) : (
                videos.map((v) => (
                  <AdminVideoRow
                    key={v.id}
                    video={v}
                    sites={v.sites.map((vs) => vs.site)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        {page > 1 && (
          <Link href={pageLink(page - 1)} className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-300">
            Prev
          </Link>
        )}
        <span className="text-zinc-500">
          Page {page} / {totalPages}
        </span>
        {page < totalPages && (
          <Link href={pageLink(page + 1)} className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-300">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
