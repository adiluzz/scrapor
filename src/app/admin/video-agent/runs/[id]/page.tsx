import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import VideoAgentRunReview from "@/components/admin/VideoAgentRunReview";
import type { DetectionClip } from "@/components/admin/DetectionClipCard";
import {
  RUN_STATUS_COLORS,
  feedbackStats,
  modelLabel,
  parseRunTargets,
  parseSelectedVideoIds,
} from "@/lib/video-agent-runs";

export const dynamic = "force-dynamic";

const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || "pisster.com";

export default async function VideoAgentRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;

  const run = await prisma.videoAgentRun.findFirst({
    where: { id, siteId: user.siteId },
    include: {
      agent: { select: { name: true, key: true } },
      detections: {
        include: { feedback: true },
        orderBy: [{ videoId: "asc" }, { startSec: "asc" }],
      },
    },
  });
  if (!run) notFound();

  const targets = parseRunTargets(run.extractTargets);
  const selectedIds = parseSelectedVideoIds(run.selectedVideoIds);
  const selectedVideos =
    selectedIds.length > 0
      ? await prisma.video.findMany({
          where: { siteId: user.siteId, id: { in: selectedIds } },
          select: { id: true, slug: true, title: true },
          orderBy: { viewCount: "desc" },
        })
      : [];

  const stats = feedbackStats(run.detections);
  const watchBaseUrl = `https://${PRIMARY_DOMAIN}`;

  const detections: DetectionClip[] = run.detections.map((d) => ({
    id: d.id,
    videoId: d.videoId,
    videoTitle: d.videoTitle,
    label: d.label,
    startSec: d.startSec,
    endSec: d.endSec,
    screenX: d.screenX,
    screenY: d.screenY,
    screenW: d.screenW,
    screenH: d.screenH,
    confidence: d.confidence,
    feedback: d.feedback ? { approved: d.feedback.approved } : null,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/video-agent/runs" className="text-sm text-zinc-500 hover:text-white">
          ← Past analyses
        </Link>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">
          Analysis{" "}
          <span className={`text-base ${RUN_STATUS_COLORS[run.status] ?? "text-zinc-400"}`}>
            {run.status}
          </span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {new Date(run.createdAt).toLocaleString()}
          {run.updatedAt > run.createdAt && (
            <span> · updated {new Date(run.updatedAt).toLocaleString()}</span>
          )}
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 text-sm">
        <h2 className="text-base font-semibold text-white">Run details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-zinc-500">Agent</p>
            <p className="text-zinc-200">{run.agent.name}</p>
          </div>
          <div>
            <p className="text-zinc-500">Model</p>
            <p className="text-zinc-200">{modelLabel(run.analysisModel)}</p>
          </div>
          <div>
            <p className="text-zinc-500">Search query</p>
            <p className="text-zinc-200">{run.searchQuery}</p>
          </div>
          <div>
            <p className="text-zinc-500">Detection targets</p>
            <p className="text-zinc-200">{targets.join(", ") || "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-zinc-500">Prompt</p>
            <p className="whitespace-pre-wrap text-zinc-200">{run.userPrompt}</p>
          </div>
        </div>

        {run.error && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-red-300">
            {run.error}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          Videos analyzed ({selectedVideos.length || selectedIds.length})
        </h2>
        {selectedVideos.length > 0 ? (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {selectedVideos.map((v) => (
              <li key={v.id} className="px-4 py-3 text-sm">
                <a
                  href={`${watchBaseUrl}/videos/${v.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-200 hover:text-white"
                >
                  {v.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No video selection recorded for this run.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-base font-semibold text-white">Detections ({stats.total})</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-emerald-400">{stats.approved} approved</span>
            <span className="text-red-400">{stats.rejected} rejected</span>
            <span className="text-zinc-500">{stats.pending} pending review</span>
          </div>
        </div>

        <VideoAgentRunReview
          runId={run.id}
          initialStatus={run.status}
          initialDetections={detections}
        />
      </section>
    </div>
  );
}
