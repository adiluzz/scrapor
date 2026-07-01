#!/usr/bin/env node
/**
 * Download videos using a virtual browser.
 * - Opens each scraped video in Playwright
 * - Fullscreen viewport
 * - Waits for/plays through ads
 * - Intercepts video stream URL and downloads (main content only, not ad)
 *
 * Run: node scripts/download-videos.cjs
 * Requires: npm install playwright && npx playwright install chromium
 */

const { chromium } = require("playwright");
const { readdir, readFile, mkdir, writeFile } = require("fs/promises");
const { join } = require("path");
const { createWriteStream } = require("fs");
const https = require("https");
const http = require("http");

const PROJECT_ROOT = join(__dirname, "..");
const VIDEOS_DIR = join(PROJECT_ROOT, "videos");
const DOWNLOADS_DIR = join(PROJECT_ROOT, "downloads");

const VIEWPORT = { width: 1920, height: 1080 };
const AD_WAIT_MS = 20000; // Wait for pre-roll ad / overlay to finish
const PAGE_LOAD_TIMEOUT = 30000;
const VIDEO_WAIT_TIMEOUT = 60000;

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

async function loadVideosToProcess() {
  const videos = [];
  const files = await readdir(VIDEOS_DIR).catch(() => []);
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const path = join(VIDEOS_DIR, f);
    const data = JSON.parse(await readFile(path, "utf8"));
    videos.push({ ...data, dbId: data.id });
  }
  return videos;
}

async function dismissCookieBanner(page) {
  const clicked = await page.evaluate(() => {
    const modal = document.querySelector('[data-role="cookies-modal"]');
    if (!modal) return false;
    const buttons = modal.querySelectorAll("button, a");
    for (const btn of buttons) {
      const t = (btn.textContent || "").toLowerCase();
      if (/^(ok|accept|agree|i agree|allow all)$/.test(t.trim()) || t.includes("ok") || t.includes("accept")) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  if (clicked) {
    await page.waitForTimeout(1500);
    console.log(`  Dismissed cookie banner`);
    return;
  }
  try {
    const btn = page.locator('[data-role="cookies-modal"] button, [data-role="cookies-modal"] a').first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(1500);
      console.log(`  Dismissed cookie banner (fallback)`);
    }
  } catch (_) {}
}

async function handleAgeVerification(page) {
  const ageSelectors = [
    'button:has-text("I am 18")',
    'button:has-text("I am 18+")',
    'button:has-text("Enter")',
    'button:has-text("Confirm")',
    'button:has-text("Agree")',
    '[data-role="age-gate-confirm"]',
    'button:has-text("18")',
  ];
  for (const sel of ageSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const text = (await btn.textContent()) || "";
        if (/18|enter|confirm|agree|yes|older/i.test(text)) {
          await btn.click({ force: true, timeout: 5000 });
          await page.waitForTimeout(3000);
          console.log(`  Clicked age verification`);
          return true;
        }
      }
    } catch (_) {}
  }
  try {
    const btn = page.locator("button, a").filter({ hasText: /18|enter|confirm/i }).first();
    await btn.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(3000);
    console.log(`  Clicked age verification (fallback)`);
    return true;
  } catch (_) {}
  return false;
}

async function handleAdOverlays(page) {
  const skipSelectors = [
    ".xplayer-ads-block__skip",
    'button:has-text("Skip Ad")',
    'button:has-text("Skip ad")',
    'div:has-text("Skip Ad")',
    '[class*="skip"]',
    '[aria-label*="Skip"]',
    'button:has-text("Skip")',
    '[class*="close-ad"]',
    '.vjs-skip-ad',
  ];

  for (const sel of skipSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && (await btn.isVisible().catch(() => false))) {
        await btn.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(2000);
        return true;
      }
    } catch (_) {}
  }

  // Wait for ad overlay to disappear (many have countdown)
  await page.waitForTimeout(AD_WAIT_MS);
  return false;
}

async function tryGetVideoUrlFromPage(page) {
  return page.evaluate(() => {
    const video = document.querySelector("video");
    if (!video) return null;
    const src = video.src || video.currentSrc;
    if (src && !src.startsWith("blob:")) return src;
    const source = video.querySelector("source");
    return source ? source.src : null;
  });
}

async function downloadVideoForUrl(page, videoUrl, destPath, dbId) {
  if (!videoUrl || videoUrl.includes("blob:")) return false;

  // Prefer MP4 over m3u8 for simplicity
  if (videoUrl.includes(".m3u8")) {
    console.log(`  HLS stream detected - requires ffmpeg. Saving URL to ${destPath}.url.txt`);
    await writeFile(destPath + ".url.txt", videoUrl);
    return true;
  }

  if (videoUrl.match(/\.(mp4|webm|mkv)(\?|$)/i)) {
    console.log(`  Downloading from: ${videoUrl.slice(0, 80)}...`);
    await downloadFile(videoUrl, destPath);
    return true;
  }

  return false;
}

async function processOneVideo(browser, video, index, total) {
  const { url, dbId, title, slug } = video;
  const safeTitle = (title || slug || dbId).replace(/[<>:"/\\|?*]/g, "_").slice(0, 100);
  const destPath = join(DOWNLOADS_DIR, `${dbId}.mp4`);

  console.log(`[${index + 1}/${total}] ${safeTitle}`);

  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });

  const videoUrls = [];
  let mainVideoUrl = null;

  const page = await context.newPage();

  page.on("response", async (response) => {
    const reqUrl = response.url();
    const isVideo =
      reqUrl.match(/\.(mp4|m3u8|webm|ts)(\?|$)/i) ||
      (reqUrl.includes("xhcdn") && reqUrl.includes("video"));
    const isExcluded =
      reqUrl.includes("ad") ||
      reqUrl.includes("preview") ||
      reqUrl.includes("thumb") ||
      reqUrl.includes(".t.mp4");
    if (isVideo && !isExcluded) {
      videoUrls.push(reqUrl);
    }
  });

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_LOAD_TIMEOUT });
  } catch (e) {
    console.log(`  Failed to load: ${e.message}`);
    await context.close();
    return false;
  }

  await page.waitForTimeout(2000);

  for (let i = 0; i < 3; i++) {
    await dismissCookieBanner(page);
    await page.waitForTimeout(800);
    const modalVisible = await page.locator('[data-role="cookies-modal"]').isVisible({ timeout: 500 }).catch(() => false);
    if (!modalVisible) break;
  }

  const modalStillThere = await page.locator('[data-role="cookies-modal"]').isVisible({ timeout: 500 }).catch(() => false);
  if (modalStillThere) {
    await page.evaluate(() => {
      const m = document.querySelector('[data-role="cookies-modal"]');
      if (m && m.parentNode) m.parentNode.removeChild(m);
    });
    console.log(`  Removed cookie modal (fallback)`);
    await page.waitForTimeout(500);
  }

  await handleAgeVerification(page);
  await page.waitForTimeout(1000);

  // Handle ad overlays
  await handleAdOverlays(page);

  // Try to click play if video is paused
  const playSelectors = [".xplayer-start-button", 'button[aria-label*="Play"]', 'button[title*="Play"]', ".vjs-big-play-button", '[class*="play"]'];
  for (const sel of playSelectors) {
    try {
      const playBtn = await page.$(sel);
      if (playBtn && (await playBtn.isVisible().catch(() => false))) {
        await playBtn.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(3000);
        break;
      }
    } catch (_) {}
  }

  // Wait for main video to load (after ad)
  await page.waitForTimeout(5000);

  // Get video URL from page or from intercepted requests
  mainVideoUrl = await tryGetVideoUrlFromPage(page);
  if (!mainVideoUrl && videoUrls.length > 0) {
    // Prefer longest URL (often main content) or last non-ad
    const candidates = videoUrls.filter((u) => !u.includes("ad-"));
    mainVideoUrl = candidates[candidates.length - 1] || videoUrls[videoUrls.length - 1];
  }

  const ok = await downloadVideoForUrl(page, mainVideoUrl, destPath, dbId);
  await context.close();
  return ok;
}

async function main() {
  const limit = parseInt(process.env.LIMIT || process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "0", 10);

  console.log("Loading videos from", VIDEOS_DIR);
  let videos = await loadVideosToProcess();
  if (videos.length === 0) {
    console.log("No videos found. Run 'npm run scrape' first.");
    process.exit(1);
  }

  if (limit > 0) {
    videos = videos.slice(0, limit);
    console.log(`Limiting to first ${limit} videos.`);
  }

  await mkdir(DOWNLOADS_DIR, { recursive: true });
  console.log(`Found ${videos.length} videos. Downloads will go to ${DOWNLOADS_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });

  let success = 0;
  for (let i = 0; i < videos.length; i++) {
    try {
      const ok = await processOneVideo(browser, videos[i], i, videos.length);
      if (ok) success++;
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  await browser.close();
  console.log(`\nDone. ${success}/${videos.length} videos processed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
