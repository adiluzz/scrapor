import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import NewRunForm from "@/components/admin/NewRunForm";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  QUEUED: "text-zinc-400",
  RUNNING: "text-yellow-400",
  DONE: "text-emerald-400",
  ERROR: "text-red-400",
  STOPPED: "text-orange-400",
};

export default async function ScrapeRunsPage() {
  await requireAdmin();
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      targetSites: { include: { site: { select: { name: true, domain: true } } } },
    },
  });

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-white sm:text-2xl">Scrape runs</h1>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/scrape-runs/interactive"
          className="rounded-lg border border-brand-600/50 bg-brand-600/10 px-4 py-2 text-sm font-medium text-brand-200 hover:bg-brand-600/20"
        >
          Interactive scrape (pick videos)
        </Link>
      </div>
      <NewRunForm />

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Query</th>
              <th className="px-4 py-3">Targets</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">New</th>
              <th className="px-4 py-3">Skipped</th>
              <th className="px-4 py-3">Failed</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {runs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No runs yet.</td></tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/scrape-runs/${r.id}`} className="text-brand-400 hover:underline">{r.query}</Link>
                    {r.searchMode === "category" && (
                      <span className="ml-2 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                        category
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {r.targetSites.map((t) => t.site.name).join(", ") || "—"}
                  </td>
                  <td className={`px-4 py-3 ${statusColor[r.status]}`}>{r.status}</td>
                  <td className="px-4 py-3 text-emerald-400">{r.newVideos}</td>
                  <td className="px-4 py-3 text-zinc-400">{r.skipped}</td>
                  <td className="px-4 py-3 text-red-400">{r.failed}</td>
                  <td className="px-4 py-3 text-zinc-500">{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
