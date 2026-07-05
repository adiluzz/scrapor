#!/usr/bin/env node
/**
 * Local Eporner scraper debugger (Playwright browser + /dload/ fast path).
 *
 * Run:
 *   QUERY=anal LIMIT=5 node scripts/eporner-debug.cjs
 *   DOWNLOAD=1 QUALITY=240 LIMIT=5 node scripts/eporner-debug.cjs
 *
 * Requires: npx playwright install chromium
 */

const { chromium } = require("playwright");
const { mkdir, writeFile, unlink, readdir } = require("fs/promises");
const { join } = require("path");
const { existsSync } = require("fs");
const { spawn } = require("child_process");

const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "downloads", "eporner-debug");
const BASE = "https://www.eporner.com";
const QUERY = process.env.QUERY || "anal";
const LIMIT = parseInt(process.env.LIMIT || "5", 10);
const DOWNLOAD = process.env.DOWNLOAD === "1";
const QUALITY = parseInt(process.env.QUALITY || "240", 10);
const MIN_DURATION_SEC = parseInt(process.env.MIN_DURATION_SEC || "600", 10);
const HEADLESS = process.env.HEADLESS !== "0";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

function parseDuration(text) {
  if (!text) return 0;
  const s = String(text).trim().toLowerCase();
  const hm = s.match(/(\d+)\s*h/);
  const mm = s.match(/(\d+)\s*m/);
  const sec = s.match(/(\d+)\s*s/);
  if (hm || mm || sec) {
    return (hm ? parseInt(hm[1], 10) * 3600 : 0)
      + (mm ? parseInt(mm[1], 10) * 60 : 0)
      + (sec ? parseInt(sec[1], 10) : 0);
  }
  const clock = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    if (clock[3]) return parseInt(clock[1], 10) * 3600 + parseInt(clock[2], 10) * 60 + parseInt(clock[3], 10);
    return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  }
  return 0;
}

function pickDloadUrl(dloads, quality) {
  const maxQ = Math.min(quality, 720);
  const h264 = dloads.filter((d) => /h264/i.test(d.text));
  const eligible = h264
    .map((d) => {
      const m = d.text.match(/(\d+)p/);
      return { ...d, q: m ? parseInt(m[1], 10) : 0 };
    })
    .filter((d) => d.q > 0 && d.q <= 720);
  const exact = eligible.find((d) => d.q === maxQ);
  if (exact) return exact.href;
  const sorted = eligible.sort((a, b) => b.q - a.q);
  return sorted[0]?.href || h264.find((d) => /240p/.test(d.text))?.href || null;
}

async function searchVideos(page, query, limit, minDurationSec) {
  const url = `${BASE}/search/${encodeURIComponent(query)}/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  return page.evaluate(({ limit, minDurationSec }) => {
    function parseDuration(text) {
      if (!text) return 0;
      const s = String(text).trim().toLowerCase();
      const hm = s.match(/(\d+)\s*h/);
      const mm = s.match(/(\d+)\s*m/);
      const sec = s.match(/(\d+)\s*s/);
      if (hm || mm || sec) {
        return (hm ? parseInt(hm[1], 10) * 3600 : 0)
          + (mm ? parseInt(mm[1], 10) * 60 : 0)
          + (sec ? parseInt(sec[1], 10) : 0);
      }
      const clock = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (clock) {
        if (clock[3]) return parseInt(clock[1], 10) * 3600 + parseInt(clock[2], 10) * 60 + parseInt(clock[3], 10);
        return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
      }
      return 0;
    }

    const seen = new Set();
    const out = [];
    for (const item of document.querySelectorAll(".mb")) {
      const a = item.querySelector('a[href*="/video-"]');
      if (!a) continue;
      const href = new URL(a.getAttribute("href"), location.origin).href.replace(/\/?$/, "/");
      if (seen.has(href)) continue;
      seen.add(href);
      const title = (item.querySelector(".mbtit a")?.textContent || a.getAttribute("title") || "").trim();
      const durText = item.querySelector(".mbtim")?.textContent || "";
      const durationSec = parseDuration(durText);
      if (minDurationSec && durationSec && durationSec < minDurationSec) continue;
      const img = item.querySelector("img");
      const thumbnail = img?.src?.startsWith("http") ? img.src : img?.dataset?.src || "";
      out.push({ url: href, title, durationSec, durationText: durText.trim(), thumbnail });
      if (out.length >= limit) break;
    }
    return out;
  }, { limit, minDurationSec });
}

async function scrapeDetail(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    let title = h1?.textContent?.trim() || "";
    title = title.replace(/\s+\d+min\s*$/i, "").replace(/\s+\d+p\([^)]+\)\s*$/i, "").replace(/\s+\d+fps\s*$/i, "").trim();
    const durationText = document.querySelector(".vid-length")?.textContent?.trim() || "";
    const tags = Array.from(document.querySelectorAll('a[href*="/cat/"], a[href*="/tag/"]'))
      .map((a) => a.textContent.trim())
      .filter((name, i, arr) => name && arr.indexOf(name) === i);
    const pornstars = Array.from(document.querySelectorAll('a[href*="/pornstar/"]'))
      .map((a) => a.textContent.trim())
      .filter((name, i, arr) => name && arr.indexOf(name) === i);
    const dloads = Array.from(document.querySelectorAll(".download-h264 a, .download-av1 a"))
      .map((a) => ({ href: a.href, text: a.textContent.trim() }));
    let contentUrl = null;
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(node.textContent || "");
        if (data?.contentUrl) contentUrl = data.contentUrl;
      } catch (_) {}
    }
    const dataVid = document.querySelector("#EPvideo")?.getAttribute("data-vid") || null;
    return { title, durationText, tags, pornstars, dloads, contentUrl, dataVid };
  });
}

async function downloadWithSession(context, pageUrl, dloadUrl, destFile) {
  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const resp = await context.request.get(dloadUrl, { timeout: 900000 });
    if (!resp.ok()) throw new Error(`download HTTP ${resp.status()}`);
    const body = await resp.body();
    await writeFile(destFile, body);
    return { size: body.length, finalUrl: resp.url() };
  } finally {
    await page.close();
  }
}

async function probeDuration(path) {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", () => resolve(parseFloat(out.trim()) || 0));
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  console.log(`Searching "${QUERY}" (limit ${LIMIT}, min ${MIN_DURATION_SEC}s) ...`);
  const hits = await searchVideos(page, QUERY, LIMIT, MIN_DURATION_SEC);
  console.log(`Found ${hits.length} result(s)`);

  const enriched = [];
  for (const hit of hits) {
    console.log(`\nDetail: ${hit.title}`);
    const detail = await scrapeDetail(page, hit.url);
    const dloadUrl = pickDloadUrl(detail.dloads, QUALITY);
    const durationSec = parseDuration(detail.durationText) || hit.durationSec;
    const merged = {
      ...hit,
      ...detail,
      durationSec,
      dloadUrl,
      quality: QUALITY,
    };
    console.log(`  title: ${merged.title}`);
    console.log(`  duration: ${merged.durationText || hit.durationText} (${durationSec}s)`);
    console.log(`  dload: ${dloadUrl || "(none)"}`);
    if (DOWNLOAD && dloadUrl) {
      const safe = merged.title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "video";
      const dest = join(OUT_DIR, `${safe}.mp4`);
      console.log(`  downloading ${QUALITY}p -> ${dest}`);
      const dl = await downloadWithSession(context, hit.url, dloadUrl, dest);
      merged.downloadedTo = dest;
      merged.bytes = dl.size;
      merged.finalCdnUrl = dl.finalUrl;
      if (existsSync(dest)) {
        const probed = await probeDuration(dest);
        merged.probedDurationSec = probed;
        console.log(`  saved ${dl.size} bytes, ffprobe duration ${probed.toFixed(1)}s`);
        if (durationSec && probed > 0 && Math.abs(probed - durationSec) > 15) {
          console.warn(`  WARNING: duration mismatch (page ${durationSec}s vs file ${probed.toFixed(1)}s)`);
        }
      }
    }
    enriched.push(merged);
  }

  const outJson = join(OUT_DIR, "results.json");
  await writeFile(outJson, JSON.stringify(enriched, null, 2));
  console.log(`\nSaved metadata to ${outJson}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
