import { prisma } from "@/lib/db";
import { dedupeKey } from "@/lib/dedupe-key";
import type { ScrapeCandidate } from "@/types/scrape-candidate";

type StoredCandidate = Pick<
  ScrapeCandidate,
  | "url"
  | "title"
  | "thumbnail"
  | "durationSec"
  | "sourceSite"
  | "description"
  | "tags"
  | "pornstars"
  | "_m3u8_base_url"
  | "_cdn_url"
  | "_part_urls"
>;

/**
 * Candidates that failed in an interactive scrape run: not saved on the run and
 * not already in the catalog (skipped rows are excluded).
 */
export async function failedScrapeCandidates(
  runId: string,
  selectedCandidatesJson: string | null
): Promise<StoredCandidate[]> {
  if (!selectedCandidatesJson) return [];

  let candidates: StoredCandidate[];
  try {
    candidates = JSON.parse(selectedCandidatesJson) as StoredCandidate[];
  } catch {
    return [];
  }
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const runVideos = await prisma.video.findMany({
    where: { scrapeRunId: runId },
    select: { sourceUrl: true, dedupeKey: true },
  });

  const successUrls = new Set(runVideos.map((v) => v.sourceUrl));
  const successKeys = new Set(runVideos.map((v) => v.dedupeKey).filter(Boolean) as string[]);

  const candidateKeys = candidates.map((c) => dedupeKey(c.url)).filter(Boolean);
  const catalogMatches = await prisma.video.findMany({
    where: {
      OR: [
        { sourceUrl: { in: candidates.map((c) => c.url) } },
        ...(candidateKeys.length ? [{ dedupeKey: { in: candidateKeys } }] : []),
      ],
    },
    select: { sourceUrl: true, dedupeKey: true },
  });
  const catalogUrls = new Set(catalogMatches.map((v) => v.sourceUrl));
  const catalogKeys = new Set(catalogMatches.map((v) => v.dedupeKey).filter(Boolean) as string[]);

  const seen = new Set<string>();
  const failed: StoredCandidate[] = [];

  for (const c of candidates) {
    const url = c.url?.trim();
    if (!url) continue;
    const key = dedupeKey(url) || url;
    if (seen.has(key)) continue;
    seen.add(key);

    if (successUrls.has(url)) continue;
    if (key && successKeys.has(key)) continue;
    if (catalogUrls.has(url)) continue;
    if (key && catalogKeys.has(key)) continue;

    failed.push(c);
  }

  return failed;
}
