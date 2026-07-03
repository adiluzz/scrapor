import { NextResponse } from "next/server";
import {
  scrapeHomepageVideos,
  scrapeHomepageWithDetails,
} from "@/lib/scraper";
import { ensureDefaultSite } from "@/lib/site";
import { upsertVideoWithMedia, durationToSeconds } from "@/lib/videos";
import { guardAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const g = await guardAdmin(request);
    if (g instanceof NextResponse) return g;
    try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const full = searchParams.get("full") === "1";

    if (full) {
      const details = await scrapeHomepageWithDetails(page);
      const site = await ensureDefaultSite();
      let saved = 0;

      for (const v of details) {
        await upsertVideoWithMedia({
          siteId: site.id,
          sourceUrl: v.url,
          title: v.title,
          description: v.description ?? null,
          durationSec: durationToSeconds(v.duration),
          sourceSite: "XHamster",
          tags: v.tags,
          pornstars: v.pornstars,
        });
        saved++;
      }

      return NextResponse.json({
        message: `Scraped and saved ${saved} videos`,
        count: saved,
      });
    }

    const videos = await scrapeHomepageVideos(page);
    return NextResponse.json({ videos, count: videos.length });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scrape failed" },
      { status: 500 }
    );
  }
}