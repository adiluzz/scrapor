#!/usr/bin/env node
/**
 * Migrates the flat downloads/ layout to the per-video directory layout
 * and generates missing thumbnail.mp4 files.
 *
 * Before: downloads/{id}.mp4  and  downloads/{id}-preview.mp4
 * After:  downloads/{id}/video.mp4  and  downloads/{id}/thumbnail.mp4
 *
 * Thumbnail strategy: single ffmpeg pass using the select filter.
 *   Selects the first 5 s of every 60 s → no temp files, low memory.
 */

import { existsSync, readdirSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const DOWNLOADS = join(ROOT, "downloads");

if (!existsSync(DOWNLOADS)) {
  console.log("No downloads/ directory — nothing to do.");
  process.exit(0);
}

// ── 1. Move any remaining flat files into per-video directories ─────────────

for (const entry of readdirSync(DOWNLOADS, { withFileTypes: true })) {
  if (entry.isDirectory()) continue;
  const name = entry.name;
  if (!name.endsWith(".mp4") && !name.endsWith(".webm")) continue;

  const previewMatch = name.match(/^(.+)-preview\.(mp4|webm)$/);
  if (previewMatch) {
    const id = previewMatch[1];
    const dir = join(DOWNLOADS, id);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, "thumbnail.mp4");
    if (!existsSync(dest)) { renameSync(join(DOWNLOADS, name), dest); console.log(`  thumbnail: ${name} → ${id}/thumbnail.mp4`); }
    continue;
  }

  const id = name.replace(/\.(mp4|webm)$/, "");
  const dir = join(DOWNLOADS, id);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, "video.mp4");
  if (!existsSync(dest)) { renameSync(join(DOWNLOADS, name), dest); console.log(`  video: ${name} → ${id}/video.mp4`); }
}

// ── 2. Generate missing thumbnails (one at a time, single ffmpeg pass) ──────

console.log("\nGenerating missing thumbnails…");

function ffprobe(filePath) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", filePath],
    { encoding: "utf8", timeout: 30_000 }
  );
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

/**
 * Single-pass thumbnail: select first 5 s of every 60 s block.
 * Uses ffmpeg's select filter — no temp files, streams through the video once.
 * Falls back to video-only if audio fails.
 */
function buildThumbnail(source, dest) {
  // select='lt(mod(t,60),5)' picks frames where position within each minute < 5 s
  const selectExpr = "lt(mod(t,60),5)";

  const tryRun = (withAudio) => {
    const args = withAudio
      ? [
          "-i", source,
          "-filter_complex",
          `[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2[v];` +
          `[0:a]aselect='${selectExpr}',asetpts=N/SR/TB[a]`,
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-crf", "26", "-preset", "fast",
          "-c:a", "aac", "-b:a", "96k",
          "-y", dest,
        ]
      : [
          "-i", source,
          "-vf", `select='${selectExpr}',setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          "-an",
          "-c:v", "libx264", "-crf", "26", "-preset", "fast",
          "-y", dest,
        ];

    const r = spawnSync("ffmpeg", args, { encoding: "utf8", timeout: 300_000 });
    return r.status === 0;
  };

  return tryRun(true) || tryRun(false);
}

const videoDirs = readdirSync(DOWNLOADS, { withFileTypes: true })
  .filter((e) => e.isDirectory());

let generated = 0;
let failed = 0;

for (const dir of videoDirs) {
  const id = dir.name;
  const videoPath = join(DOWNLOADS, id, "video.mp4");
  const thumbPath = join(DOWNLOADS, id, "thumbnail.mp4");

  if (!existsSync(videoPath)) continue;
  if (existsSync(thumbPath)) {
    console.log(`  ✓ ${id} — already has thumbnail`);
    continue;
  }

  const info = ffprobe(videoPath);
  const duration = parseFloat(info?.format?.duration ?? "0");
  if (duration < 5) {
    console.log(`  ⚠ ${id} — too short (${duration.toFixed(1)}s), skipping`);
    continue;
  }

  process.stdout.write(`  ⏳ ${id} (${Math.round(duration)}s)… `);
  const ok = buildThumbnail(videoPath, thumbPath);
  if (ok) { console.log("✓"); generated++; }
  else     { console.log("✗ failed"); failed++; }
}

console.log(`\nDone. Generated: ${generated}, Failed: ${failed}`);
