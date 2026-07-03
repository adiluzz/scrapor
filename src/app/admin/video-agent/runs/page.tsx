import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import {
  RUN_STATUS_COLORS,
  feedbackStats,
  modelLabel,
  parseRunTargets,
  truncatePrompt,
} from "@/lib/video-agent-runs";

export const dynamic = "force-dynamic";

export default async function VideoAgentRunsPage() {
  const user = await requireAdmin();
  const runs = await prisma.videoAgentRun.findMany({
    where: { siteId: user.siteId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      agent: { select: { name: true } },
      detections: { include: { feedback: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/video-agent" className="text-sm text-zinc-500 hover:text-white">
            ← New analysis
          </Link>
          <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Past analyses</h1>
          <p className="mt-1 text-sm text-zinc-500">
            All video agent runs with detections and approval status.
          </p>
        </div>
        <Link
          href="/admin/video-agent"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          New analysis
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Prompt</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Detections</th>
              <th className="px-4 py-3">Approved</th>
              <th className="px-4 py-3">Rejected</th>
              <th className="px-4 py-3">Pending</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  No analyses yet.{" "}
                  <Link href="/admin/video-agent" className="text-brand-400 hover:underline">
                    Run your first analysis
                  </Link>
                </td>
              </tr>
            ) : (
              runs.map((run) => {
                const stats = feedbackStats(run.detections);
                return (
                  <tr key={run.id} className="hover:bg-zinc-900/50">
                    <td className="max-w-xs px-4 py-3">
                      <Link
                        href={`/admin/video-agent/runs/${run.id}`}
                        className="text-brand-400 hover:underline"
                        title={run.userPrompt}
                      >
                        {truncatePrompt(run.userPrompt)}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-zinc-600">
                        Search: {run.searchQuery}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{modelLabel(run.analysisModel)}</td>
                    <td className={`px-4 py-3 ${RUN_STATUS_COLORS[run.status] ?? "text-zinc-400"}`}>
                      {run.status}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{stats.total}</td>
                    <td className="px-4 py-3 text-emerald-400">{stats.approved}</td>
                    <td className="px-4 py-3 text-red-400">{stats.rejected}</td>
                    <td className="px-4 py-3 text-zinc-500">{stats.pending}</td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
