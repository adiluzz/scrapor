import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { isSourceSite } from "@/lib/source-sites";
import { redis, SCRAPE_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";

const schema = z.object({
  query: z.string().min(1).max(200),
  sources: z.array(z.string()).min(1),
  minDurationSec: z.number().int().min(0).max(36000).optional(),
  // Videos to download per source this run. null/omitted = download ALL results.
  maxPerSite: z.number().int().min(1).max(10000).nullable().optional(),
});

export async function GET(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const runs = await prisma.scrapeRun.findMany({
    where: { siteId: g.siteId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { videos: true } } },
  });
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sources = parsed.data.sources.filter(isSourceSite);
  if (sources.length === 0) return NextResponse.json({ error: "No valid source sites" }, { status: 400 });

  const run = await prisma.scrapeRun.create({
    data: {
      siteId: g.siteId,
      query: parsed.data.query,
      selectedSites: JSON.stringify(sources),
      minDurationSec: parsed.data.minDurationSec ?? 600,
      maxPerSite: parsed.data.maxPerSite ?? null,
      createdById: authUserId(g),
      status: "QUEUED",
      siteResults: {
        create: sources.map((sourceSite) => ({ sourceSite, status: "QUEUED" })),
      },
    },
  });

  try {
    await redis.rpush(SCRAPE_QUEUE_KEY, run.id);
  } catch (err) {
    logger.error({ err: String(err), runId: run.id }, "failed to enqueue scrape run");
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: { status: "ERROR", finishedAt: new Date() },
    });
    return NextResponse.json({ error: "Failed to enqueue scrape run (Redis unavailable)" }, { status: 503 });
  }

  logger.info({ runId: run.id, sources }, "scrape run created");
  return NextResponse.json({ ok: true, id: run.id });
}