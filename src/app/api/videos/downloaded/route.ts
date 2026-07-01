import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");

export async function GET() {
  try {
    const ids = new Set<string>();
    if (existsSync(DOWNLOADS_DIR)) {
      for (const entry of readdirSync(DOWNLOADS_DIR, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          // New layout: downloads/{id}/video.mp4
          if (existsSync(join(DOWNLOADS_DIR, entry.name, "video.mp4"))) {
            ids.add(entry.name);
          }
        } else if (entry.name.endsWith(".mp4") || entry.name.endsWith(".webm")) {
          // Legacy flat layout
          ids.add(entry.name.replace(/\.(mp4|webm)$/, ""));
        }
      }
    }
    return NextResponse.json({ downloaded: Array.from(ids) });
  } catch {
    return NextResponse.json({ downloaded: [] });
  }
}
