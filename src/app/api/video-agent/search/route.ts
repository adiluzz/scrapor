import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { searchAgentVideos } from "@/lib/queries";
import { parseUserPrompt } from "@/lib/video-agent/parse-prompt";
import { logger } from "@/lib/logger";

const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || "pisster.com";

/** Step 1: parse prompt and return matching catalog videos for user selection. */
export async function POST(request: Request) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!userPrompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  try {
    const parsed = await parseUserPrompt(userPrompt);
    const videos = await searchAgentVideos(auth.siteId, parsed.searchQuery);
    const watchBaseUrl = `https://${PRIMARY_DOMAIN}`;

    return NextResponse.json({
      searchQuery: parsed.searchQuery,
      extractTargets: parsed.extractTargets,
      videos: videos.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
        watchUrl: `${watchBaseUrl}/videos/${v.slug}`,
      })),
      total: videos.length,
    });
  } catch (err) {
    logger.error({ err }, "video-agent search failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
