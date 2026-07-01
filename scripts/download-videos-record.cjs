#!/usr/bin/env node
/**
 * Download full videos by recording the browser screen while playing.
 * Screenshots at every step for analysis.
 * 1. Age verification -> screenshot
 * 2. Exit fullscreen if auto-entered
 * 3. Click play -> screenshot
 * 4. Exit fullscreen again (player may auto-fullscreen on play)
 * 5. Poll for skip button, screenshot every 10s during poll
 * 6. Click skip -> screenshot
 * 7. Set max quality -> screenshot
 * 8. Go fullscreen (only after ad skipped)
 *
 * Run: node scripts/download-videos-record.cjs
 * Requires: npx playwright install chromium
 * Env: LIMIT, MAX_RECORD_SEC, CROP_BOTTOM_PX (default 80, removes gray bar at bottom)
 */

const { chromium } = require("playwright");
const { readdir, readFile, mkdir, copyFile, unlink } = require("fs/promises");
const { join } = require("path");
const { existsSync } = require("fs");
const { spawn } = require("child_process");

const PROJECT_ROOT = join(__dirname, "..");
const VIDEOS_DIR = join(PROJECT_ROOT, "videos");
const DOWNLOADS_DIR = join(PROJECT_ROOT, "downloads");
const RECORDINGS_DIR = join(PROJECT_ROOT, ".recordings");
const VIEWPORT = { width: 1920, height: 1080 };
const AD_WAIT_MS = 25000; // Pre-roll ad
const EXTRA_BUFFER_MS = 5000; // Buffer after video ends
const SCREENSHOTS_DIR = join(PROJECT_ROOT, ".screenshots");
// Cap recording time for testing: MAX_RECORD_SEC=120 records only 2 min per video
const MAX_RECORD_SEC = parseInt(process.env.MAX_RECORD_SEC || "0", 10);
const CROP_BOTTOM_PX = parseInt(process.env.CROP_BOTTOM_PX || "80", 10);
const DEBUG = process.env.DEBUG === "1";

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

async function dismissCookieBanner(page) {
  const clicked = await page.evaluate(() => {
    const modal = document.querySelector('[data-role="cookies-modal"]');
    if (!modal) return false;
    const buttons = modal.querySelectorAll('button, a');
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
    'button:has-text("Yes I am 18")',
    'button:has-text("I am 18 or older")',
    'button:has-text("Enter")',
    'button:has-text("Confirm")',
    'button:has-text("Agree")',
    'a:has-text("I am 18")',
    'a:has-text("Enter")',
    '[class*="age"] button',
    '[class*="age"] a',
    '[class*="confirm"]',
    '[data-role="age-gate-confirm"]',
    'button:has-text("18")',
  ];
  for (const sel of ageSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const text = (await btn.textContent()) || "";
        if (/18|enter|confirm|agree|yes|older/i.test(text)) {
          await btn.click({ force: true, timeout: 10000 });
          await page.waitForTimeout(3000);
          console.log(`  Clicked age verification`);
          return true;
        }
      }
    } catch (_) {}
  }
  try {
    const btn = page.locator('button, a').filter({ hasText: /18|enter|confirm/i }).first();
    await btn.click({ force: true, timeout: 10000 });
    await page.waitForTimeout(3000);
    console.log(`  Clicked age verification (fallback)`);
    return true;
  } catch (_) {}
  return false;
}

/** xhamster skip ad button class (from site inspector) */
const SKIP_AD_SELECTOR = ".xplayer-ads-block__skip";

/** Player container - scope all player selectors inside this */
const PLAYER = "#player-container";

/** Wait for skip button to appear (Playwright waitFor) and click immediately. */
async function waitForSkipAndClick(page, id) {
  try {
    const loc = page.locator(PLAYER).locator(SKIP_AD_SELECTOR).first();
    await loc.waitFor({ state: "visible", timeout: AD_WAIT_MS });
    await loc.click({ force: true });
    console.log(`  Clicked skip button (appeared, no timeout poll)`);
    return true;
  } catch (e) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const loc = frame.locator(PLAYER).locator(SKIP_AD_SELECTOR).first();
        await loc.waitFor({ state: "visible", timeout: 2000 });
        await loc.click({ force: true });
        console.log(`  Clicked skip button in iframe`);
        return true;
      } catch (_) {}
    }
    console.log(`  No skip button found after ${AD_WAIT_MS / 1000}s`);
    return false;
  }
}

/** Click fullscreen button (.fullscreen-button) inside player container */
async function clickFullscreenButton(page) {
  const btn = page.locator(PLAYER).locator(".fullscreen-button").first();
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click({ force: true });
  await page.waitForTimeout(1500);
  console.log(`  Clicked fullscreen button`);
}

/** Open settings menu (.control-bar .right-block .settings), select max quality. Quality change triggers play. */
async function openSettingsAndSetMaxQuality(page) {
  const settingsBtn = page.locator(PLAYER).locator(".control-bar .right-block .settings").first();
  await settingsBtn.waitFor({ state: "visible", timeout: 8000 });
  await settingsBtn.click();
  await page.waitForTimeout(800);
  console.log(`  Opened settings menu`);

  // Settings menu is inside a frame, in .settings-menu
  let frame = page.mainFrame();
  for (const f of page.frames()) {
    const hasMenu = await f.locator(".settings-menu").first().isVisible({ timeout: 500 }).catch(() => false);
    if (hasMenu) {
      frame = f;
      break;
    }
  }

  // Inside .settings-menu -> .chooser-control -> .quality (3 nested components, each step logged)
  // const settingsMenu = page.locator(".settings-menu").first();
  // // await settingsMenu.waitFor({ state: "visible", timeout: 5000 });
  // console.log(`  Step 1: Found .settings-menu`, settingsMenu);
  await page.waitForTimeout(600);

  const chooserControl = page.locator(".chooser-control").first();
  // await chooserControl.waitFor({ state: "visible", timeout: 5000 });
  console.log(`  Step 2: Found .chooser-control`);

  // const qualityBtn = chooserControl.locator(".quality").first();
  // await qualityBtn.waitFor({ state: "visible", timeout: 5000 });
  // console.log(`  Step 3: Found .quality`);

  await chooserControl.click();
  await page.waitForTimeout(600);
  console.log(`  Opened quality menu`);

  // Inside frame: span.quality.chooser-control.xp-settings-inner-list-inner contains child spans with data-value (e.g. "720p")
  // Remove 'p', parse number, click span with maximal value
  const clicked = await frame.evaluate(() => {
    const container = document.querySelector(".quality.chooser-control.xp-settings-inner-list-inner");
    if (!container) return false;
    const spans = container.querySelectorAll("span[data-value]");
    let maxRes = 0;
    let bestEl = null;
    for (const s of spans) {
      const val = (s.getAttribute("data-value") || "").trim();
      const numStr = val.replace(/p$/i, "");
      const res = parseInt(numStr, 10) || 0;
      if (res > maxRes) {
        maxRes = res;
        bestEl = s;
      }
    }
    if (bestEl) {
      bestEl.click();
      return true;
    }
    return false;
  });
  if (clicked) {
    console.log(`  Set max quality (triggers play)`);
  }
  await page.waitForTimeout(1500);
}

/** Get video duration in seconds via ffprobe. */
function getVideoDurationSec(path) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.on("close", (code) => {
      const sec = parseFloat(out.trim());
      resolve(isNaN(sec) ? 0 : sec);
    });
    p.on("error", reject);
  });
}

/** Trim: remove first skipSec, optionally limit to maxDurationSec (0 = no limit). */
async function trimVideo(inputPath, outputPath, skipSec, maxDurationSec = 0) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-ss", String(skipSec), "-i", inputPath];
    if (maxDurationSec > 0) args.push("-t", String(maxDurationSec));
    args.push("-c", "copy", outputPath);
    const p = spawn("ffmpeg", args, { stdio: "ignore" });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    p.on("error", reject);
  });
}

/** Crop N pixels from bottom of video (removes gray bar). */
async function cropVideoBottom(inputPath, outputPath, cropPx) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `crop=iw:ih-${cropPx}:0:0`,
      "-c:v",
      "libvpx",
      "-b:v",
      "2M",
      "-c:a",
      "copy",
      outputPath,
    ];
    const p = spawn("ffmpeg", args, { stdio: "ignore" });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    p.on("error", reject);
  });
}

/** Wait for main video to be playing (currentTime > 0). Returns true if video started. */
async function waitForVideoStarted(page, timeoutMs = 15000) {
  const pollMs = 500;
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += pollMs) {
    const playing = await page.evaluate(() => {
      const v = document.querySelector("video");
      if (!v) return false;
      return !v.paused && v.currentTime > 0.5;
    });
    if (playing) return true;
    await page.waitForTimeout(pollMs);
  }
  return false;
}

async function setMaxQuality(page) {
  const qualitySelectors = [
    '[class*="quality"]',
    '[aria-label*="quality"]',
    '[class*="settings"]',
    'button[title*="Quality"]',
    '.vjs-quality-selector',
  ];
  for (const sel of qualitySelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(500);
        const maxItem = await page.$('text=/1080|2160|4K|720|Highest|Max/i');
        if (maxItem) {
          await maxItem.click();
          await page.waitForTimeout(1000);
        }
        return;
      }
    } catch (_) {}
  }
}

async function exitFullscreen(page) {
  try {
    const isFull = await page.evaluate(() => !!document.fullscreenElement);
    if (isFull) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
    }
  } catch (_) {}
}

async function goFullscreen(page) {
  const fullscreenSelectors = [
    '[aria-label="Fullscreen"]',
    '[aria-label="fullscreen"]',
    'button[title*="Fullscreen"]',
    'button[title*="fullscreen"]',
    '[class*="fullscreen"]',
    '.vjs-fullscreen-control',
    'button[aria-label*="full screen"]',
  ];
  for (const sel of fullscreenSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click({ force: true });
        await page.waitForTimeout(2000);
        const isFull = await page.evaluate(() => !!document.fullscreenElement);
        if (isFull) {
          console.log(`  Entered fullscreen (clicked ${sel})`);
          return;
        }
      }
    } catch (_) {}
  }
  try {
    await page.evaluate(async () => {
      const video = document.querySelector("video");
      const el = video || document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
    });
    await page.waitForTimeout(2000);
    const isFull = await page.evaluate(() => !!document.fullscreenElement);
    if (isFull) {
      console.log(`  Entered fullscreen (requestFullscreen API)`);
      return;
    }
  } catch (_) {}
  try {
    await page.keyboard.press("f");
    await page.waitForTimeout(1500);
    console.log(`  Sent F for fullscreen (fallback)`);
  } catch (_) {}
}

async function takeScreenshot(page, id, step) {
  const path = join(SCREENSHOTS_DIR, `${id}-${step}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  Screenshot: ${step} -> ${path}`);
  return path;
}

async function processOneVideo(browser, video, index, total) {
  const { id, url, title, duration } = video;
  let durationSec = parseInt(duration || "0", 10) || 60;
  if (MAX_RECORD_SEC > 0 && durationSec > MAX_RECORD_SEC) {
    console.log(`  Capping to ${MAX_RECORD_SEC}s (full: ${Math.floor(durationSec / 60)}m)`);
    durationSec = MAX_RECORD_SEC;
  }
  const waitMs = (durationSec + 30) * 1000 + EXTRA_BUFFER_MS; // +30s for ads

  console.log(`[${index + 1}/${total}] ${title?.slice(0, 50)}... (${Math.floor(durationSec / 60)}m ${durationSec % 60}s)`);

  const destPath = join(DOWNLOADS_DIR, `${id}.webm`);
  if (existsSync(destPath)) {
    const stat = require("fs").statSync(destPath);
    if (stat.size > 100000) {
      console.log(`  Already downloaded (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      return true;
    }
  }

  const recordStartTime = Date.now();
  if (DEBUG) console.log(`  [DEBUG] recordStartTime=${recordStartTime}`);

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: RECORDINGS_DIR,
      size: VIEWPORT,
    },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  context.on("page", (popup) => {
    if (popup !== page) popup.close().catch(() => {});
  });
  await page.addInitScript(() => {
    window.open = function () {
      return null;
    };
  });

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  } catch (e) {
    console.log(`  Failed to load: ${e.message}`);
    await context.close();
    return false;
  }
  await takeScreenshot(page, id, "01-after-load");

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
  await page.waitForTimeout(2000);
  await takeScreenshot(page, id, "02-after-age-verify");

  await openSettingsAndSetMaxQuality(page);
  await takeScreenshot(page, id, "03-after-quality");

  await clickFullscreenButton(page);
  await takeScreenshot(page, id, "04-after-fullscreen");

  const skipped = await waitForSkipAndClick(page, id);
  const skipEndTime = Date.now();
  const elapsedSec = (skipEndTime - recordStartTime) / 1000;
  const skipOffsetSec = skipped
    ? Math.max(0, elapsedSec - 1)
    : Math.min(8, Math.max(0, elapsedSec - 1)); // no skip: trim at most 8s to avoid cutting content
  await takeScreenshot(page, id, "05-after-skip");
  if (DEBUG) {
    console.log(`  [DEBUG] skipEndTime=${skipEndTime}, elapsed=${((skipEndTime - recordStartTime) / 1000).toFixed(1)}s`);
    console.log(`  [DEBUG] skipOffsetSec=${skipOffsetSec.toFixed(1)} (trim from start)`);
  }
  if (skipped) {
    console.log(`  Recording starts after skip (trimming first ${skipOffsetSec.toFixed(1)}s)`);
  } else {
    console.log(`  No skip - trimming first ${skipOffsetSec.toFixed(1)}s`);
  }

  await page.waitForTimeout(2000);

  console.log(`  Recording for ${Math.ceil(waitMs / 1000)}s...`);
  await page.waitForTimeout(waitMs);

  const videoObj = page.video();
  const recordedPath = videoObj ? await videoObj.path() : null;
  await context.close();

  if (recordedPath && existsSync(recordedPath)) {
    const tempPath = join(DOWNLOADS_DIR, `${id}-raw.webm`);
    await copyFile(recordedPath, tempPath);

    try {
      let workPath = tempPath;
      if (skipOffsetSec > 2) {
        await trimVideo(tempPath, destPath, skipOffsetSec, 0);
        workPath = destPath;
        const afterTrimDuration = await getVideoDurationSec(destPath).catch(() => 0);
        if (afterTrimDuration > durationSec + 5) {
          const trimEndPath = join(DOWNLOADS_DIR, `${id}-trimmed.webm`);
          await trimVideo(destPath, trimEndPath, 0, durationSec);
          await copyFile(trimEndPath, destPath);
          await unlink(trimEndPath).catch(() => {});
          console.log(`  ✓ Trimmed start (${skipOffsetSec.toFixed(1)}s) + end to ${durationSec}s`);
        } else {
          console.log(`  ✓ Trimmed start (${skipOffsetSec.toFixed(1)}s), duration ${afterTrimDuration.toFixed(1)}s`);
        }
      } else {
        const afterDuration = await getVideoDurationSec(tempPath).catch(() => 0);
        if (afterDuration > durationSec + 5) {
          await trimVideo(tempPath, destPath, 0, durationSec);
          workPath = destPath;
          console.log(`  ✓ Trimmed end to match video (${durationSec}s)`);
        } else {
          const { rename } = require("fs/promises");
          await rename(tempPath, destPath).catch(() => copyFile(tempPath, destPath));
          workPath = destPath;
        }
      }
      await unlink(tempPath).catch(() => {});

      if (DEBUG && existsSync(destPath)) {
        const dur = await getVideoDurationSec(destPath).catch(() => 0);
        console.log(`  [DEBUG] After trim: duration=${dur.toFixed(1)}s, skipOffsetSec=${skipOffsetSec.toFixed(1)}`);
      }

      if (CROP_BOTTOM_PX > 0 && existsSync(destPath)) {
        try {
          const cropPath = join(DOWNLOADS_DIR, `${id}-cropped.webm`);
          await cropVideoBottom(destPath, cropPath, CROP_BOTTOM_PX);
          await copyFile(cropPath, destPath);
          await unlink(cropPath).catch(() => {});
          console.log(`  ✓ Cropped ${CROP_BOTTOM_PX}px from bottom`);
        } catch (e) {
          console.log(`  Crop skipped: ${e.message}`);
        }
      }
    } catch (e) {
      await copyFile(tempPath, destPath);
      await unlink(tempPath).catch(() => {});
      console.log(`  ✓ Saved (ffmpeg failed, using full recording)`);
    }
    const stat = require("fs").statSync(destPath);
    console.log(`  ✓ Saved ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    return true;
  }

  console.log(`  ✗ Recording failed`);
  return false;
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
  await mkdir(RECORDINGS_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  console.log(`Recording ${toProcess.length} videos (full length, fullscreen, max quality)\n`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--start-maximized",
      ],
    });
  } catch (e) {
    try {
      browser = await chromium.launch({
        channel: "chrome",
        headless: false,
        args: ["--autoplay-policy=no-user-gesture-required", "--start-maximized"],
      });
    } catch (e2) {
      console.error("Browser not found. Run: npx playwright install chromium");
      process.exit(1);
    }
  }

  let success = 0;
  for (let i = 0; i < toProcess.length; i++) {
    try {
      const ok = await processOneVideo(browser, toProcess[i], i, toProcess.length);
      if (ok) success++;
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  await browser.close();

  const { rm } = require("fs/promises");
  await rm(RECORDINGS_DIR, { recursive: true, force: true }).catch(() => {});

  console.log(`\nDone. ${success}/${toProcess.length} videos recorded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
