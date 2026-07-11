import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminWebsitesPage() {
  await requireAdmin();
  const sites = await prisma.site.findMany({
    orderBy: [{ networkOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          Websites <span className="text-base font-normal text-zinc-500">({sites.length})</span>
        </h1>
        <Link
          href="/admin/websites/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          New website
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Color</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sites.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No websites yet.
                </td>
              </tr>
            ) : (
              sites.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-zinc-100">{s.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{s.domain}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{s.kind}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block h-5 w-5 rounded border border-zinc-700"
                      style={{ backgroundColor: s.primaryColor }}
                      title={s.primaryColor}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/websites/${s.id}`}
                        className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/websites/${s.id}/seo`}
                        className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        SEO
                      </Link>
                      <Link
                        href={`/admin/websites/${s.id}/ads`}
                        className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        Ads
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
