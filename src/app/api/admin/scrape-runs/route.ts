import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { isSourceSite } from "@/lib/source-sites";
import { redis, SCRAPE_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";

const candidateSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  thumbnail: z.string().optional(),
  durationSec: z.coerce.number().int().nullable().optional(),
  sourceSite: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pornstars: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  _m3u8_base_url: z.string().nullable().optional(),
  _cdn_url: z.string().nullable().optional(),
  _part_urls: z.array(z.string()).nullable().optional(),
});

const schema = z
  .object({
    query: z.string().max(200).optional(),
    sources: z.array(z.string()).min(1),
    minDurationSec: z.number().int().min(0).max(36000).optional(),
    // Videos to download per source this run. null/omitted = download ALL results.
    maxPerSite: z.number().int().min(1).max(10000).nullable().optional(),
    // Interactive mode: download only these pre-selected candidates.
    candidates: z.array(candidateSchema).min(1).optional(),
  })
  .refine((d) => Boolean(d.query?.trim()) || (d.candidates?.length ?? 0) > 0, {
    message: "Provide a search query or selected video candidates",
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
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "scrape run create validation failed");
    const msg = parsed.error.issues[0]?.message || "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sources = parsed.data.sources.filter(isSourceSite);
  if (sources.length === 0) return NextResponse.json({ error: "No valid source sites" }, { status: 400 });

  const candidates = parsed.data.candidates;
  if (candidates) {
    const invalid = candidates.find((c) => !isSourceSite(c.sourceSite));
    if (invalid) return NextResponse.json({ error: "Invalid candidate source site" }, { status: 400 });
  }

  const runQuery =
    parsed.data.query?.trim() ||
    (candidates?.length ? `URL import (${candidates.length} videos)` : "");

  const run = await prisma.scrapeRun.create({
    data: {
      siteId: g.siteId,
      query: runQuery,
      selectedSites: JSON.stringify(sources),
      minDurationSec: parsed.data.minDurationSec ?? 600,
      maxPerSite: candidates ? candidates.length : (parsed.data.maxPerSite ?? null),
      selectedCandidates: candidates ? JSON.stringify(candidates) : null,
      createdById: authUserId(g),
      status: "QUEUED",
      siteResults: {
        create: (candidates
          ? [...new Set(candidates.map((c) => c.sourceSite))]
          : sources
        ).map((sourceSite) => ({ sourceSite, status: "QUEUED" })),
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