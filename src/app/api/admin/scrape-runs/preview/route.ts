import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { isSourceSite } from "@/lib/source-sites";
import { PREVIEW_BATCH, searchScrapeCandidates } from "@/lib/scrape-search";
import { logger } from "@/lib/logger";

const schema = z.object({
  query: z.string().min(1).max(200),
  sources: z.array(z.string()).min(1),
  minDurationSec: z.number().int().min(0).max(36000).optional(),
  cursors: z.record(z.union([z.number(), z.string()])).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  excludeUrls: z.array(z.string().url()).optional(),
});

export async function POST(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sources = parsed.data.sources.filter(isSourceSite);
  if (sources.length === 0) return NextResponse.json({ error: "No valid source sites" }, { status: 400 });

  try {
    const result = await searchScrapeCandidates({
      query: parsed.data.query,
      sources,
      minDurationSec: parsed.data.minDurationSec,
      cursors: parsed.data.cursors,
      limit: parsed.data.limit ?? PREVIEW_BATCH,
      excludeUrls: parsed.data.excludeUrls,
    });
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err: String(err) }, "interactive scrape search failed");
    return NextResponse.json({ error: (err as Error).message || "Search failed" }, { status: 503 });
  }
}
