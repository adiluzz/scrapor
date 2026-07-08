import { prisma } from "@/lib/db";
import { dedupeKey } from "@/lib/dedupe-key";
import type { ScrapeCandidate } from "@/types/scrape-candidate";

export type RunVideoOutcomeRow = {
  url: string;
  title: string | null;
  sourceSite: string | null;
  outcome: "SKIPPED" | "FAILED";
  reason: string;
  stage: string | null;
};

type StoredCandidate = Pick<ScrapeCandidate, "url" | "title" | "sourceSite">;

function candidateKey(url: string): string {
  return dedupeKey(url) || url;
}

/** Derive skipped/failed lists from interactive candidates when outcomes were not persisted. */
async function deriveOutcomesFromCandidates(
  runId: string,
  selectedCandidatesJson: string
): Promise<{ skipped: RunVideoOutcomeRow[]; failed: RunVideoOutcomeRow[] }> {
  let candidates: StoredCandidate[];
  try {
    candidates = JSON.parse(selectedCandidatesJson) as StoredCandidate[];
  } catch {
    return { skipped: [], failed: [] };
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { skipped: [], failed: [] };
  }

  const runVideos = await prisma.video.findMany({
    where: { scrapeRunId: runId },
    select: { sourceUrl: true, dedupeKey: true },
  });
  const successUrls = new Set(runVideos.map((v) => v.sourceUrl));
  const successKeys = new Set(runVideos.map((v) => v.dedupeKey).filter(Boolean) as string[]);

  const keys = candidates.map((c) => candidateKey(c.url)).filter(Boolean);
  const catalogMatches = await prisma.video.findMany({
    where: {
      OR: [
        { sourceUrl: { in: candidates.map((c) => c.url) } },
        ...(keys.length ? [{ dedupeKey: { in: keys } }] : []),
      ],
    },
    select: { sourceUrl: true, dedupeKey: true },
  });
  const catalogUrls = new Set(catalogMatches.map((v) => v.sourceUrl));
  const catalogKeys = new Set(catalogMatches.map((v) => v.dedupeKey).filter(Boolean) as string[]);

  const skipped: RunVideoOutcomeRow[] = [];
  const failed: RunVideoOutcomeRow[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const url = c.url?.trim();
    if (!url) continue;
    const key = candidateKey(url);
    if (seen.has(key)) {
      skipped.push({
        url,
        title: c.title ?? null,
        sourceSite: c.sourceSite ?? null,
        outcome: "SKIPPED",
        reason: "Duplicate in this run",
        stage: "dedup",
      });
      continue;
    }
    seen.add(key);

    if (successUrls.has(url) || (key && successKeys.has(key))) continue;

    if (catalogUrls.has(url) || (key && catalogKeys.has(key))) {
      skipped.push({
        url,
        title: c.title ?? null,
        sourceSite: c.sourceSite ?? null,
        outcome: "SKIPPED",
        reason: "Already in catalog",
        stage: "catalog",
      });
      continue;
    }

    failed.push({
      url,
      title: c.title ?? null,
      sourceSite: c.sourceSite ?? null,
      outcome: "FAILED",
      reason: "Failed during processing (detailed reason not recorded for this run)",
      stage: null,
    });
  }

  return { skipped, failed };
}

/** Load persisted outcomes, or derive from interactive candidates for older runs. */
export async function loadScrapeRunOutcomes(
  runId: string,
  selectedCandidatesJson: string | null,
  runStatus?: string
): Promise<{ skipped: RunVideoOutcomeRow[]; failed: RunVideoOutcomeRow[] }> {
  const rows = await prisma.scrapeRunOutcome.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length > 0) {
    const skipped: RunVideoOutcomeRow[] = [];
    const failed: RunVideoOutcomeRow[] = [];
    for (const r of rows) {
      const row: RunVideoOutcomeRow = {
        url: r.url,
        title: r.title,
        sourceSite: r.sourceSite,
        outcome: r.outcome,
        reason: r.reason,
        stage: r.stage,
      };
      if (r.outcome === "SKIPPED") skipped.push(row);
      else failed.push(row);
    }
    return { skipped, failed };
  }

  // While a run is active, unprocessed candidates are pending — not failed.
  if (runStatus === "RUNNING" || runStatus === "QUEUED") {
    return { skipped: [], failed: [] };
  }

  if (selectedCandidatesJson) {
    return deriveOutcomesFromCandidates(runId, selectedCandidatesJson);
  }

  return { skipped: [], failed: [] };
}
