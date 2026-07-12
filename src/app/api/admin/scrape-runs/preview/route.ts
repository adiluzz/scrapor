import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { isSourceSite } from "@/lib/source-sites";
import { PREVIEW_BATCH, searchScrapeCandidates } from "@/lib/scrape-search";
import { logger } from "@/lib/logger";

/** Interactive search can take a long time when the worker is busy / sites are slow. */
export const maxDuration = 1800;

const schema = z
  .object({
    query: z.string().max(200).optional(),
    sources: z.array(z.string()).optional(),
    urls: z.array(z.string().url()).min(1).max(50).optional(),
    minDurationSec: z.number().int().min(0).max(36000).optional(),
    cursors: z.record(z.union([z.number(), z.string()])).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    skip: z.number().int().min(0).max(100_000).optional(),
    excludeUrls: z.array(z.string().url()).optional(),
    searchMode: z.enum(["query", "category"]).optional(),
  })
  .refine(
    (d) =>
      (d.urls?.length ?? 0) > 0 ||
      (Boolean(d.query?.trim()) && (d.sources?.length ?? 0) > 0),
    { message: "Provide a search query + sources, or a list of video URLs" }
  );

export async function POST(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const urls = parsed.data.urls;
  const sources = (parsed.data.sources ?? []).filter(isSourceSite);

  if (!urls?.length && sources.length === 0) {
    return NextResponse.json({ error: "No valid source sites" }, { status: 400 });
  }

  try {
    const result = await searchScrapeCandidates({
      query: parsed.data.query?.trim(),
      sources: urls?.length ? undefined : sources,
      urls,
      minDurationSec: parsed.data.minDurationSec,
      cursors: parsed.data.cursors,
      limit: parsed.data.limit ?? PREVIEW_BATCH,
      skip: parsed.data.skip ?? 0,
      excludeUrls: parsed.data.excludeUrls,
      searchMode: parsed.data.searchMode ?? "query",
    });
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err: String(err) }, "interactive scrape search failed");
    return NextResponse.json({ error: (err as Error).message || "Search failed" }, { status: 503 });
  }
}
