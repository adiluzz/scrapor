import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { loadScrapeRunOutcomes } from "@/lib/scrape-run-outcomes";
import RunActions from "@/components/admin/RunActions";
import ScrapeRunOutcomeLists from "@/components/admin/ScrapeRunOutcomeLists";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  QUEUED: "text-zinc-400",
  RUNNING: "text-yellow-400",
  DONE: "text-emerald-400",
  ERROR: "text-red-400",
  STOPPED: "text-orange-400",
};

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const run = await prisma.scrapeRun.findFirst({
    where: { id, siteId: user.siteId },
    include: {
      siteResults: { orderBy: { sourceSite: "asc" } },
      videos: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!run) notFound();

  const { skipped, failed } = await loadScrapeRunOutcomes(run.id, run.selectedCandidates);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/scrape-runs" className="text-sm text-zinc-500 hover:text-white">← Runs</Link>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">
          “{run.query}” <span className={`ml-2 text-base ${statusColor[run.status]}`}>{run.status}</span>
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="text-emerald-400">{run.newVideos} new</span>
          <span className="text-zinc-400">{run.skipped} skipped</span>
          <span className="text-red-400">{run.failed} failed</span>
          <span className="text-zinc-500">min {Math.round(run.minDurationSec / 60)} min</span>
          <span className="text-zinc-500">
            {run.selectedCandidates
              ? "interactive selection"
              : run.maxPerSite
                ? `${run.maxPerSite}/site`
                : "all/site"}
          </span>
        </div>
        <div className="mt-4">
          <RunActions
            runId={run.id}
            status={run.status}
            failed={run.failed}
            hasSelectedCandidates={Boolean(run.selectedCandidates)}
          />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Per-source breakdown</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Found</th>
                <th className="px-4 py-3">New</th>
                <th className="px-4 py-3">Skipped</th>
                <th className="px-4 py-3">Failed</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {run.siteResults.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-zinc-200">{s.sourceSite}</td>
                  <td className={`px-4 py-3 ${statusColor[s.status]}`}>{s.status}</td>
                  <td className="px-4 py-3 text-zinc-400">{s.found}</td>
                  <td className="px-4 py-3 text-emerald-400">{s.newVideos}</td>
                  <td className="px-4 py-3 text-zinc-400">{s.skipped}</td>
                  <td className="px-4 py-3 text-red-400">{s.failed}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-red-300/70">{s.error || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Videos added ({run.videos.length})</h2>
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
          {run.videos.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-zinc-500">No videos added yet.</li>
          ) : (
            run.videos.map((v) => (
              <li key={v.id} className="px-4 py-3 text-sm">
                <Link href={`/admin/videos/${v.slug}`} className="text-zinc-200 hover:text-white">
                  {v.title}
                </Link>
                <span className="ml-2 text-zinc-600">· {v.sourceSite}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <ScrapeRunOutcomeLists skipped={skipped} failed={failed} />
    </div>
  );
}
