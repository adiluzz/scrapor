import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { toCard } from "@/lib/queries";
import AdminVideoRow from "@/components/admin/AdminVideoRow";
import AdminVideoViewToggle from "@/components/admin/AdminVideoViewToggle";
import VideoGrid from "@/components/site/VideoGrid";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) || "";
  const page = Math.max(1, parseInt((Array.isArray(sp.page) ? sp.page[0] : sp.page) || "1", 10));
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "grid" ? "grid" : "table";

  const where = {
    siteId: user.siteId,
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include:
        view === "grid"
          ? { pornstars: { include: { pornstar: true }, take: 3 } }
          : undefined,
    }),
    prisma.video.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cards = view === "grid" ? await Promise.all(videos.map((v) => toCard(v))) : [];
  const pageQs = `q=${encodeURIComponent(q)}&page=`;
  const viewQs = (p: number) => `${pageQs}${p}&view=${view}`;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-white sm:text-2xl">
        Videos <span className="text-base font-normal text-zinc-500">({total})</span>
      </h1>

      <form className="mb-4" action="/admin/videos">
        <input type="hidden" name="view" value={view} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title…"
          className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
        />
      </form>

      <AdminVideoViewToggle q={q} page={page} view={view} />

      {view === "grid" ? (
        <VideoGrid videos={cards} hrefPrefix="/admin/videos" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {videos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No videos.
                  </td>
                </tr>
              ) : (
                videos.map((v) => <AdminVideoRow key={v.id} video={v} />)
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        {page > 1 && (
          <Link href={`/admin/videos?${viewQs(page - 1)}`} className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-300">
            Prev
          </Link>
        )}
        <span className="text-zinc-500">
          Page {page} / {totalPages}
        </span>
        {page < totalPages && (
          <Link href={`/admin/videos?${viewQs(page + 1)}`} className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-300">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
