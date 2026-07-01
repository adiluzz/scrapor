#!/usr/bin/env node
/**
 * Alternative download: extract video URL from page JSON and fetch.
 * No Playwright required. Works when the site embeds the video URL in page data.
 * Run: node scripts/download-videos-fetch.cjs
 */

const { readdir, readFile, mkdir, writeFile } = require("fs/promises");
const { join } = require("path");
const { createWriteStream } = require("fs");
const https = require("https");
const http = require("http");

const PROJECT_ROOT = join(__dirname, "..");
const VIDEOS_DIR = join(PROJECT_ROOT, "videos");
const DOWNLOADS_DIR = join(PROJECT_ROOT, "downloads");

async function loadVideos() {
  const files = await readdir(VIDEOS_DIR).catch(() => []);
  const videos = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(await readFile(join(VIDEOS_DIR, f), "utf8"));
    videos.push(data);
  }
  return videos;
}

function extractInitialsJson(html) {
  const start = html.indexOf("window.initials=");
  if (start === -1) return null;
  const jsonStart = html.indexOf("{", start);
  if (jsonStart === -1) return null;
  let depth = 0;
  let end = jsonStart;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  try {
    return JSON.parse(html.slice(jsonStart, end).replace(/\\\//g, "/"));
  } catch {
    return null;
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = createWriteStream(destPath);
    protocol
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        require("fs").unlink(destPath, () => {});
        reject(err);
      });
  });
}

async function main() {
  const videos = await loadVideos();
  if (videos.length === 0) {
    console.log("No videos. Run npm run scrape first.");
    process.exit(1);
  }

  const limit = parseInt(process.env.LIMIT || "0", 10) || videos.length;
  const toProcess = videos.slice(0, limit);

  await mkdir(DOWNLOADS_DIR, { recursive: true });
  console.log(`Trying to extract video URLs from ${toProcess.length} pages (no browser)...\n`);

  let got = 0;
  for (let i = 0; i < toProcess.length; i++) {
    const v = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${v.title?.slice(0, 50)}...`);

    try {
      const res = await fetch(v.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html",
        },
      });
      const html = await res.text();
      const data = extractInitialsJson(html);
      if (!data) continue;

      const vm = data.videoModel;
      const ve = data.videoEntity;
      // downloadFile often returns 520 (blocked). trailerURL = preview clip, usually works.
      const mainUrl = vm?.downloadFile || ve?.downloadFile;
      const trailerUrl = vm?.trailerURL || ve?.trailerURL;
      const dest = join(DOWNLOADS_DIR, `${v.id}.mp4`);

      let ok = false;
      for (const url of [mainUrl, trailerUrl].filter(Boolean)) {
        if (!url || url.includes("blob:")) continue;
        try {
          await downloadFile(url, dest);
          const stat = require("fs").statSync(dest);
          if (stat.size > 100) {
            got++;
            console.log(`  ✓ ${stat.size > 500000 ? (stat.size / 1024 / 1024).toFixed(1) + " MB" : (stat.size / 1024).toFixed(0) + " KB preview"}`);
            ok = true;
            break;
          }
          require("fs").unlinkSync(dest);
        } catch (_) {}
      }
      if (!ok) console.log(`  ✗ Failed`);
    } catch (e) {
      console.log(`  ✗ ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nDone. Got ${got}/${toProcess.length} videos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
