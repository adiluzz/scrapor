#!/usr/bin/env node
/**
 * Scrape using Playwright - single tab, blocks popups.
 * Run: node scripts/run-scrape-playwright.cjs
 * Use when fetch-based scrape fails or opens too many tabs.
 */

const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const { mkdir, writeFile } = require("fs/promises");
const { join } = require("path");

const PROJECT_ROOT = join(__dirname, "..");
const VIDEOS_DIR = join(PROJECT_ROOT, "videos");
const BASE_URL = "https://xhamster.com";

const prisma = new PrismaClient();

const LIMIT = parseInt(process.env.LIMIT || "0", 10) || 999;

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

async function main() {
  console.log("Launching browser (single tab, popups blocked)...\n");

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "0",
    args: ["--disable-features=TranslateUI", "--no-first-run"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Close any popup/new tab (not our main page)
  context.on("page", (popup) => {
    if (popup !== page) {
      console.log("  [popup blocked] closing extra tab");
      popup.close().catch(() => {});
    }
  });

  // Block window.open (target="_blank" etc)
  await page.addInitScript(() => {
    window.open = function () {
      return null;
    };
  });

  try {
    console.log("Loading homepage...");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    const homepageVideos = await page.evaluate(() => {
      const seen = new Set();
      const videos = [];
      const links = document.querySelectorAll('a[href*="/videos/"]');
      for (const a of links) {
        const href = a.getAttribute("href");
        if (!href || href.includes("creators") || href.includes("my/liked")) continue;
        const m = href.match(/\/videos\/([^/?#]+)/);
        if (!m) continue;
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        const fullUrl = href.startsWith("http") ? href : `https://xhamster.com${href}`;
        const title = a.getAttribute("title") || a.getAttribute("aria-label") || a.textContent?.trim() || "";
        if (!title || title.length < 3) continue;
        videos.push({ id, title, url: fullUrl });
      }
      return videos;
    });

    console.log(`Found ${homepageVideos.length} videos on homepage`);
    const toProcess = homepageVideos.slice(0, LIMIT);
    if (LIMIT < homepageVideos.length) {
      console.log(`Processing first ${LIMIT} (set LIMIT=0 for all)\n`);
    }

    await mkdir(VIDEOS_DIR, { recursive: true });

    let saved = 0;
    for (let i = 0; i < toProcess.length; i++) {
      const v = toProcess[i];
      console.log(`[${i + 1}/${toProcess.length}] ${v.title.slice(0, 50)}...`);

      try {
        await page.goto(v.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch (e) {
        console.log(`  Skip: ${e.message}`);
        continue;
      }

      const html = await page.content();
      const data = extractInitialsJson(html);
      if (!data) {
        console.log("  Skip: no video data");
        continue;
      }

      const vm = data.videoModel;
      const ve = data.videoEntity;
      const vtc = data.videoTagsComponent;

      const slug = v.url.split("/videos/")[1]?.split("?")[0]?.trim() || ve?.idHashSlug || v.id || "";
      const title = vm?.title || ve?.title || v.title || "";
      const description = vm?.description || ve?.description || "";
      const thumbnail = vm?.thumbURL || ve?.thumbBig || "";
      const duration = vm?.duration || ve?.duration || "";

      const tags = [];
      const pornstars = [];
      if (Array.isArray(vtc?.tags)) {
        for (const t of vtc.tags) {
          if (t?.name) {
            tags.push(t.name);
            if (t.isPornstar || t.isCreator) pornstars.push(t.name);
          }
        }
      }
      if (Array.isArray(ve?.pornstarModels)) {
        for (const p of ve.pornstarModels) {
          const name = p?.name || p?.title;
          if (name && !pornstars.includes(name)) pornstars.push(name);
        }
      }

      const detail = {
        slug,
        title,
        url: v.url,
        thumbnail: thumbnail || undefined,
        duration: duration ? String(duration) : undefined,
        description: description || undefined,
        tags,
        pornstars,
      };

      const record = await prisma.video.upsert({
        where: { slug: detail.slug },
        create: {
          slug: detail.slug,
          title: detail.title,
          url: detail.url,
          thumbnail: detail.thumbnail ?? null,
          duration: detail.duration ?? null,
          description: detail.description ?? null,
          tags: JSON.stringify(detail.tags),
          pornstars: JSON.stringify(detail.pornstars),
        },
        update: {
          title: detail.title,
          url: detail.url,
          thumbnail: detail.thumbnail ?? undefined,
          duration: detail.duration ?? undefined,
          description: detail.description ?? undefined,
          tags: JSON.stringify(detail.tags),
          pornstars: JSON.stringify(detail.pornstars),
        },
      });

      const filePath = join(VIDEOS_DIR, `${record.id}.json`);
      await writeFile(
        filePath,
        JSON.stringify(
          {
            id: record.id,
            slug: record.slug,
            title: record.title,
            url: record.url,
            thumbnail: record.thumbnail,
            duration: record.duration,
            description: record.description,
            tags: detail.tags,
            pornstars: detail.pornstars,
          },
          null,
          2
        )
      );
      saved++;
      await new Promise((r) => setTimeout(r, 800));
    }

    console.log(`\nDone. Saved ${saved} videos to DB and ${VIDEOS_DIR}`);
  } finally {
    await browser.close();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
