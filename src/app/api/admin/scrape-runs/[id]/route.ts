import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { redis, SCRAPE_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { failedScrapeCandidates } from "@/lib/scrape-retry";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(_request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const run = await prisma.scrapeRun.findFirst({
    where: { id, siteId: g.siteId },
    include: {
      siteResults: { orderBy: { sourceSite: "asc" } },
      videos: { orderBy: { createdAt: "desc" }, take: 100 },
      outcomes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ run });
}

const actionSchema = z.object({ action: z.enum(["stop", "continue", "retry-failed"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const run = await prisma.scrapeRun.findFirst({ where: { id, siteId: g.siteId } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "stop") {
    // Only in-flight runs can be stopped. The worker polls this status and bails
    // out of its loop; STOPPED runs are never auto-resumed on restart.
    if (run.status !== "RUNNING" && run.status !== "QUEUED") {
      return NextResponse.json({ error: `Cannot stop a ${run.status} run` }, { status: 409 });
    }
    await prisma.scrapeRun.update({
      where: { id },
      data: { status: "STOPPED", finishedAt: new Date() },
    });
    try {
      await redis.lrem(SCRAPE_QUEUE_KEY, 0, id);
    } catch (err) {
      logger.warn({ err: String(err), runId: id }, "failed to remove stopped run from queue");
    }
    logger.info({ runId: id }, "scrape run stopped by admin");
    return NextResponse.json({ ok: true, status: "STOPPED" });
  }

  if (parsed.data.action === "retry-failed") {
    if (run.status === "RUNNING" || run.status === "QUEUED") {
      return NextResponse.json({ error: "Stop the run before retrying failed videos" }, { status: 409 });
    }
    if (!run.selectedCandidates) {
      return NextResponse.json(
        { error: "Retry failed is only available for interactive runs with selected candidates" },
        { status: 400 }
      );
    }

    const failed = await failedScrapeCandidates(id, run.selectedCandidates);
    if (failed.length === 0) {
      return NextResponse.json({ error: "No failed videos to retry" }, { status: 400 });
    }

    const sources = [...new Set(failed.map((c) => c.sourceSite))];

    await prisma.$transaction([
      prisma.scrapeRunOutcome.deleteMany({ where: { runId: id } }),
      prisma.scrapeRun.update({
        where: { id },
        data: {
          status: "QUEUED",
          finishedAt: null,
          selectedCandidates: JSON.stringify(failed),
          maxPerSite: failed.length,
          newVideos: 0,
          skipped: 0,
          failed: 0,
          totalFound: failed.length,
        },
      }),
      ...sources.map((sourceSite) =>
        prisma.scrapeRunSite.updateMany({
          where: { runId: id, sourceSite },
          data: {
            status: "QUEUED",
            found: 0,
            newVideos: 0,
            skipped: 0,
            failed: 0,
            error: null,
          },
        })
      ),
    ]);

    try {
      await redis.rpush(SCRAPE_QUEUE_KEY, id);
    } catch (err) {
      logger.error({ err: String(err), runId: id }, "failed to enqueue retry-failed scrape run");
      return NextResponse.json({ error: "Failed to enqueue (Redis unavailable)" }, { status: 503 });
    }

    logger.info({ runId: id, retryCount: failed.length }, "scrape run retry-failed queued");
    return NextResponse.json({ ok: true, status: "QUEUED", retryCount: failed.length });
  }

  // action === "continue"
  if (run.status !== "STOPPED") {
    return NextResponse.json({ error: `Cannot continue a ${run.status} run` }, { status: 409 });
  }
  await prisma.scrapeRun.update({
    where: { id },
    data: { status: "QUEUED", finishedAt: null },
  });
  try {
    await redis.rpush(SCRAPE_QUEUE_KEY, id);
  } catch (err) {
    logger.error({ err: String(err), runId: id }, "failed to re-enqueue continued run");
  }
  logger.info({ runId: id }, "scrape run continued by admin");
  return NextResponse.json({ ok: true, status: "QUEUED" });
}