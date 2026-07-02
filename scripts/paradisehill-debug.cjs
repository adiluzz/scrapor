#!/usr/bin/env node
/**
 * Local ParadiseHill scraper debugger (Playwright + DOM selectors from browser inspection).
 *
 * Run:
 *   QUERY=anal LIMIT=2 node scripts/paradisehill-debug.cjs
 *   DOWNLOAD=1 QUERY=anal LIMIT=1 node scripts/paradisehill-debug.cjs
 *
 * Requires: npx playwright install chromium
 */

const { chromium } = require("playwright");
const { mkdir, writeFile, readFile, readdir, unlink } = require("fs/promises");
const { join } = require("path");
const { existsSync } = require("fs");
const { spawn } = require("child_process");

const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "downloads", "paradisehill-debug");
const BASE = "https://en.paradisehill.cc";
const QUERY = process.env.QUERY || "anal";
const LIMIT = parseInt(process.env.LIMIT || "3", 10);
const DOWNLOAD = process.env.DOWNLOAD === "1";
const HEADLESS = process.env.HEADLESS !== "0";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function dismissConsent(page) {
  const yes = page.locator('button:has-text("Yes")').first();
  if (await yes.isVisible({ timeout: 3000 }).catch(() => false)) {
    await yes.click();
    await page.waitForTimeout(1500);
    console.log("  ✓ consent accepted");
  }
}

async function dismissPopups(page) {
  for (const label of ["OK", "Cancel"]) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      if (label === "OK") await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  await page.evaluate(() => {
    for (const iframe of document.querySelectorAll("iframe")) {
      iframe.style.display = "none";
    }
  });
}

async function searchVideos(page, query, limit) {
  const url = `${BASE}/search/?pattern=${encodeURIComponent(query)}&what=1`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await dismissPopups(page);
  return page.evaluate(({ limit }) => {
    return Array.from(document.querySelectorAll(".list-film-item"))
      .slice(0, limit)
      .map((item) => {
        const a = item.querySelector("a[href]");
        const name = item.querySelector('[itemprop="name"]');
        const genre = item.querySelector('[itemprop="genre"]');
        const img = item.querySelector("img");
        return {
          url: new URL(a.getAttribute("href"), location.origin).href,
          title: (name?.textContent || a?.textContent || "").trim(),
          category: (genre?.textContent || "").trim(),
          thumbnail: img?.src || "",
        };
      });
  }, { limit });
}

async function scrapeDetail(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await dismissPopups(page);
  return page.evaluate(() => {
    const descP = document.querySelector(".opisanie p");
    const description = (descP?.textContent || "")
      .replace(/^Description:\s*/i, "")
      .trim();
    const actors = Array.from(document.querySelectorAll('a[href*="/actor/"]'))
      .map((a) => ({ href: a.href, name: a.textContent.trim() }))
      .filter((x) => x.name && /\/actor\/\d+\/?(?:\?|$)/.test(x.href))
      .map((x) => x.name)
      .filter((name, i, arr) => arr.indexOf(name) === i);
    const categories = Array.from(document.querySelectorAll('a[href*="/category/"]'))
      .map((a) => ({ href: a.href, name: a.textContent.trim() }))
      .filter((x) => /\/category\/[^/?#]+/.test(x.href))
      .map((x) => x.name)
      .filter((name, i, arr) => name && arr.indexOf(name) === i);
    const og = document.querySelector('meta[property="og:image"]');
    const poster = og?.content ? new URL(og.content, location.origin).href : "";
    let partUrls = [];
    const m = document.documentElement.innerHTML.match(/var videoList = (\[.*?\]);/s);
    if (m) {
      try {
        const list = JSON.parse(m[1]);
        partUrls = list.map((entry) => entry?.sources?.[0]?.src).filter(Boolean);
      } catch (_) {}
    }
    return {
      title: document.querySelector("h1")?.textContent?.trim() || "",
      description,
      actors,
      categories,
      poster,
      partUrls,
    };
  });
}

async function downloadParts(partUrls, destFile) {
  const tmpDir = join(OUT_DIR, ".tmp-" + Date.now());
  await mkdir(tmpDir, { recursive: true });
  const partFiles = [];
  for (let i = 0; i < partUrls.length; i++) {
    const pf = join(tmpDir, `part_${String(i + 1).padStart(3, "0")}.mp4`);
    console.log(`    downloading part ${i + 1}/${partUrls.length}`);
    await run("wget", ["-q", "--no-check-certificate", "-O", pf, partUrls[i]]);
    partFiles.push(pf);
  }
  const listFile = join(tmpDir, "concat.txt");
  await writeFile(listFile, partFiles.map((p) => `file '${p}'`).join("\n"));
  if (partFiles.length === 1) {
    await run("ffmpeg", ["-y", "-i", partFiles[0], "-c", "copy", destFile]);
  } else {
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", destFile]);
  }
  for (const f of await readdir(tmpDir)) {
    await unlink(join(tmpDir, f)).catch(() => {});
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  console.log(`Opening ${BASE} ...`);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await dismissConsent(page);

  console.log(`Searching "${QUERY}" (limit ${LIMIT}) ...`);
  const hits = await searchVideos(page, QUERY, LIMIT);
  console.log(`Found ${hits.length} result(s)`);

  const enriched = [];
  for (const hit of hits) {
    console.log(`\nDetail: ${hit.title}`);
    const detail = await scrapeDetail(page, hit.url);
    const merged = { ...hit, ...detail, partCount: detail.partUrls.length };
    enriched.push(merged);
    console.log(`  title: ${merged.title}`);
    console.log(`  actors: ${merged.actors.length}, categories: ${merged.categories.join(", ")}`);
    console.log(`  parts: ${merged.partUrls.length}`);
    if (DOWNLOAD && merged.partUrls.length) {
      const safe = merged.title.replace(/[^\w.-]+/g, "_").slice(0, 80);
      const dest = join(OUT_DIR, `${safe}.mp4`);
      console.log(`  downloading -> ${dest}`);
      await downloadParts(merged.partUrls, dest);
      merged.downloadedTo = dest;
    }
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
