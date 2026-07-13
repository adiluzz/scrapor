import { prisma } from "@/lib/db";

export type ScrapeRunSourceStats = {
  sourceSite: string;
  newVideos: number;
  skipped: number;
  failed: number;
  /** Processed outcomes + new videos (lower bound for "found"). */
  processed: number;
};

export type ScrapeRunDisplayStats = {
  newVideos: number;
  skipped: number;
  failed: number;
  bySource: Map<string, ScrapeRunSourceStats>;
};

/**
 * Authoritative run stats from persisted videos + outcome rows.
 * Prefer these over ScrapeRun / ScrapeRunSite counters, which reset when the
 * worker restarts mid-run.
 */
export async function loadScrapeRunDisplayStats(
  runId: string
): Promise<ScrapeRunDisplayStats> {
  const [videoGroups, outcomeGroups] = await Promise.all([
    prisma.video.groupBy({
      by: ["sourceSite"],
      where: { scrapeRunId: runId },
      _count: { _all: true },
    }),
    prisma.scrapeRunOutcome.groupBy({
      by: ["sourceSite", "outcome"],
      where: { runId },
      _count: { _all: true },
    }),
  ]);

  const bySource = new Map<string, ScrapeRunSourceStats>();

  function slot(sourceSite: string | null | undefined): ScrapeRunSourceStats {
    const key = sourceSite || "unknown";
    let row = bySource.get(key);
    if (!row) {
      row = { sourceSite: key, newVideos: 0, skipped: 0, failed: 0, processed: 0 };
      bySource.set(key, row);
    }
    return row;
  }

  for (const g of videoGroups) {
    const row = slot(g.sourceSite);
    row.newVideos += g._count._all;
  }
  for (const g of outcomeGroups) {
    const row = slot(g.sourceSite);
    if (g.outcome === "SKIPPED") row.skipped += g._count._all;
    else if (g.outcome === "FAILED") row.failed += g._count._all;
  }

  let newVideos = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of bySource.values()) {
    row.processed = row.newVideos + row.skipped + row.failed;
    newVideos += row.newVideos;
    skipped += row.skipped;
    failed += row.failed;
  }

  return { newVideos, skipped, failed, bySource };
}

/** Batch version for the scrape-runs list page. */
export async function loadScrapeRunDisplayStatsMany(
  runIds: string[]
): Promise<Map<string, Omit<ScrapeRunDisplayStats, "bySource">>> {
  const out = new Map<string, Omit<ScrapeRunDisplayStats, "bySource">>();
  for (const id of runIds) {
    out.set(id, { newVideos: 0, skipped: 0, failed: 0 });
  }
  if (runIds.length === 0) return out;

  const [videoGroups, outcomeGroups] = await Promise.all([
    prisma.video.groupBy({
      by: ["scrapeRunId"],
      where: { scrapeRunId: { in: runIds } },
      _count: { _all: true },
    }),
    prisma.scrapeRunOutcome.groupBy({
      by: ["runId", "outcome"],
      where: { runId: { in: runIds } },
      _count: { _all: true },
    }),
  ]);

  for (const g of videoGroups) {
    if (!g.scrapeRunId) continue;
    const row = out.get(g.scrapeRunId);
    if (row) row.newVideos = g._count._all;
  }
  for (const g of outcomeGroups) {
    const row = out.get(g.runId);
    if (!row) continue;
    if (g.outcome === "SKIPPED") row.skipped = g._count._all;
    else if (g.outcome === "FAILED") row.failed = g._count._all;
  }

  return out;
}
