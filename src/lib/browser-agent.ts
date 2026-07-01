/**
 * Browser agent - manages a Playwright browser instance for the LLM assistant.
 * Provides tools: navigate, click, type, screenshot, getContent, recordVideo
 */

import { copyFile, mkdir } from "fs/promises";
import { join } from "path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const ASSISTANT_RECORDINGS = join(process.cwd(), "library", "assistant-recordings");

/** Extract a usable URL from whatever the model passes — handles nested objects and Python-dict strings. */
function normalizeUrl(raw: string): string {
  // Model sometimes sends the full arg object as the url string: "{'url': 'https://...'}"
  const match = raw.match(/https?:\/\/[^\s'"}\]]+/);
  if (match) return match[0];
  if (!raw.startsWith("http")) return `https://${raw}`;
  return raw;
}

/**
 * Simple async mutex — prevents concurrent Playwright calls from racing each other.
 * The model sometimes calls navigate + screenshot in parallel; serialising them avoids
 * "navigation was interrupted" errors and ensures the screenshot is taken AFTER the page loads.
 */
let browserLock: Promise<void> = Promise.resolve();
async function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  let resolve!: () => void;
  const prev = browserLock;
  browserLock = new Promise<void>((r) => { resolve = r; });
  await prev; // wait for any previous operation to finish
  try {
    return await fn();
  } finally {
    resolve(); // release the lock
  }
}

/** Viewport + Playwright video size (higher = sharper screen capture, not source bitrate). */
const RECORD_W = Number(process.env.ASSISTANT_RECORD_WIDTH || 1920);
const RECORD_H = Number(process.env.ASSISTANT_RECORD_HEIGHT || 1080);

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

function newRecordingContext(): Promise<BrowserContext> {
  if (!browser) throw new Error("No browser");
  return browser.newContext({
    viewport: { width: RECORD_W, height: RECORD_H },
    recordVideo: {
      dir: join(process.cwd(), ".recordings-agent"),
      size: { width: RECORD_W, height: RECORD_H },
    },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
}

async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) return page;
  if (browser) await browser.close();
  browser = await chromium.launch({ headless: false });
  context = await newRecordingContext();
  page = await context.newPage();
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);
  return page;
}

/**
 * Close any existing browser and open a fresh one already on the video URL.
 * The new WebM only contains what happens after this call—ideal for full-length captures without earlier browsing in the file.
 */
export async function browserStartCleanRecordingSession(rawUrl: string): Promise<string> {
  try {
    const url = normalizeUrl(rawUrl);
    await closeBrowser();
    browser = await chromium.launch({ headless: false });
    context = await newRecordingContext();
    page = await context.newPage();
    page.setDefaultTimeout(0);
    page.setDefaultNavigationTimeout(0);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return `Clean recording started at ${url} (${RECORD_W}x${RECORD_H}). Next: click play, skip ads (wait + click skip/skip ad buttons), fullscreen (F), then wait(seconds) for the FULL video duration, then recordVideo.`;
  } catch (e) {
    return `startCleanRecordingSession failed: ${(e as Error).message}`;
  }
}

/** Texts found on consent/language/age-gate overlays — click to auto-dismiss. */
const CONSENT_BUTTON_TEXTS = [
  "English", "Accept All", "Accept Cookies", "Accept & continue", "I Agree", "I agree",
  "Agree & Continue", "Enter", "Enter Site", "I am 18+", "I Am 18 Years Old Or Older",
  "Yes, I am 18", "Continue", "OK", "Got It", "Confirm", "Allow All",
];

/**
 * Click one visible consent/language/age-gate button using Playwright locators.
 * Uses getBoundingClientRect for visibility (works on fixed/absolute elements).
 * Returns the text of the button clicked, or null if none found.
 */
async function clickConsentButton(p: Page): Promise<string | null> {
  // First try: use page.evaluate with getBoundingClientRect (handles fixed/absolute positioning)
  try {
    const clicked = await p.evaluate((texts: string[]) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']"));
      for (const text of texts) {
        const match = els.find((el) => {
          const t = el.textContent?.trim() || "";
          if (t !== text && !t.includes(text)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0; // visible in DOM
        });
        if (match) {
          (match as HTMLElement).click();
          return match.textContent?.trim() || "button";
        }
      }
      return null;
    }, CONSENT_BUTTON_TEXTS);

    if (clicked) {
      await p.waitForLoadState("domcontentloaded").catch(() => {});
      await p.waitForTimeout(400);
      return clicked;
    }
  } catch { /* ignore */ }

  // Second try: JS-based click that bypasses CSS visibility (works on hidden/fixed overlays)
  try {
    const clicked = await p.evaluate((texts: string[]) => {
      const all = Array.from(document.querySelectorAll<HTMLElement>('a, button, [role="button"]'));
      for (const text of texts) {
        const el = all.find(el => {
          const t = (el.textContent || '').trim();
          return t === text || t.startsWith(text);
        });
        if (el) { el.click(); return el.textContent?.trim() || text; }
      }
      return null;
    }, CONSENT_BUTTON_TEXTS);
    if (clicked) {
      await p.waitForLoadState("domcontentloaded").catch(() => {});
      await p.waitForTimeout(400);
      return clicked;
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * After navigation, try to auto-dismiss common consent / language / age-gate overlays.
 * Runs up to 3 passes to handle stacked overlays (language → age gate → cookie).
 */
async function autoDismissOverlay(p: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const clicked = await clickConsentButton(p);
    if (!clicked) break;
  }
}

export async function browserDismissOverlay(): Promise<string> {
  try {
    const p = await getPage();
    const messages: string[] = [];
    // Up to 3 passes in case multiple overlays stack (language → age gate → cookie)
    for (let i = 0; i < 3; i++) {
      const clicked = await clickConsentButton(p);
      if (!clicked) break;
      messages.push(`Clicked: "${clicked}"`);
    }
    const url = p.url();
    const preview = await p.evaluate(() => {
      const clone = document.body?.cloneNode(true) as HTMLElement | null;
      clone?.querySelectorAll("script,style,noscript").forEach((el) => el.remove());
      return clone?.innerText?.slice(0, 300) || "";
    }).catch(() => "");
    if (messages.length === 0) return `No overlay found. Current URL: ${url}\nPreview: ${preview}`;
    return `Dismissed overlays: ${messages.join(", ")}\nCurrent URL: ${url}\nPreview: ${preview.slice(0, 200)}`;
  } catch (e) {
    return `dismissOverlay failed: ${(e as Error).message}`;
  }
}

export async function browserNavigate(rawUrl: string): Promise<string> {
  return withBrowserLock(async () => {
    try {
      let url = normalizeUrl(rawUrl);
      // Bypass xhamster language selector by appending lang=en
      if (/xhamster\.com\/?$/.test(url) && !url.includes("lang=")) {
        url = url.includes("?") ? `${url}&lang=en` : `${url}?lang=en`;
      }
      const p = await getPage();
      await p.goto(url, { waitUntil: "domcontentloaded" });
      // Auto-dismiss language selectors, cookie banners, age gates.
      await autoDismissOverlay(p);
      const currentUrl = p.url();
      const text = await p.evaluate(() => {
        const clone = document.body?.cloneNode(true) as HTMLElement | null;
        clone?.querySelectorAll("script,style,noscript").forEach((el) => el.remove());
        return clone?.innerText?.slice(0, 600) || "";
      }).catch(() => "");
      return `Navigated to ${currentUrl}\n\nPage preview:\n${text || "(empty)"}`;
    } catch (e) {
      return `navigate failed: ${(e as Error).message}`;
    }
  });
}

export async function browserClick(selector: string): Promise<string> {
  try {
    const p = await getPage();
    // Try force-click first (bypasses overlays), fall back to normal click
    await p.click(selector, { force: false }).catch(async () => {
      await p.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) el.click();
        else throw new Error(`No element found for selector: ${sel}`);
      }, selector);
    });
    return `Clicked element: ${selector}`;
  } catch (e) {
    return `click failed for "${selector}": ${(e as Error).message}. Try evaluateJS or clickAt instead.`;
  }
}

export async function browserClickAt(x: number, y: number): Promise<string> {
  try {
    const p = await getPage();
    await p.mouse.click(x, y);
    return `Clicked at coordinates (${x}, ${y})`;
  } catch (e) {
    return `clickAt failed: ${(e as Error).message}`;
  }
}

export async function browserType(selector: string, text: string): Promise<string> {
  try {
    const p = await getPage();
    await p.fill(selector, text);
    return `Typed "${text}" into ${selector}`;
  } catch (e) {
    return `type failed for "${selector}": ${(e as Error).message}`;
  }
}

export async function browserPress(key: string): Promise<string> {
  try {
    const p = await getPage();
    await p.keyboard.press(key);
    return `Pressed key: ${key}`;
  } catch (e) {
    return `press failed: ${(e as Error).message}`;
  }
}

export async function browserWait(seconds: number): Promise<string> {
  try {
    const p = await getPage();
    await p.waitForTimeout(seconds * 1000);
    return `Waited ${seconds} seconds`;
  } catch (e) {
    return `wait failed: ${(e as Error).message}`;
  }
}

const ASSISTANT_SCREENSHOTS = join(process.cwd(), "library", "assistant-screenshots");

export async function browserScreenshot(): Promise<string> {
  return withBrowserLock(async () => {
    try {
      const p = await getPage();
      const buffer = await p.screenshot({ type: "png" });
      return Buffer.from(buffer).toString("base64");
    } catch (e) {
      return `screenshot failed: ${(e as Error).message}`;
    }
  });
}

/**
 * Take a screenshot and save it to library/assistant-screenshots/{filename}.png
 * Use this when the user asks to save a photo with a specific name.
 */
export async function browserSaveScreenshot(filename: string): Promise<string> {
  try {
    const p = await getPage();
    const buffer = await p.screenshot({ type: "png" });
    const safe = filename.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_") || "screenshot";
    const base = safe.endsWith(".png") ? safe : `${safe}.png`;
    await mkdir(ASSISTANT_SCREENSHOTS, { recursive: true });
    const path = join(ASSISTANT_SCREENSHOTS, base);
    const { writeFile } = await import("fs/promises");
    await writeFile(path, buffer);
    return `Saved screenshot to library/assistant-screenshots/${base}`;
  } catch (e) {
    return `saveScreenshot failed: ${(e as Error).message}`;
  }
}

export async function browserGetContent(): Promise<string> {
  return withBrowserLock(async () => {
    try {
      const p = await getPage();
      const content = await p.evaluate(() => {
        const body = document.body;
        if (!body) return "";
        const clone = body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
        return clone.innerText.slice(0, 8000);
      });
      return content || "(no content)";
    } catch (e) {
      return `getContent failed: ${(e as Error).message}`;
    }
  });
}

export async function browserGetUrl(): Promise<string> {
  return withBrowserLock(async () => {
    try {
      const p = await getPage();
      return p.url();
    } catch (e) {
      return `getUrl failed: ${(e as Error).message}`;
    }
  });
}

/**
 * Save the current browser recording to library/assistant-recordings.
 * The browser records continuously; this finalizes and saves the video.
 */
export async function browserRecordVideo(_url?: string): Promise<string> {
  try {
    const p = page;
    if (!p || !context) return "recordVideo failed: No browser session. Call startCleanRecordingSession first.";
    const video = p.video();
    if (!video) return "recordVideo failed: Video recording not available on this context.";
    const currentUrl = p.url();
    const id = (currentUrl.match(/\/([a-z0-9-]+)(?:\?|$)/i) || [])[1]?.replace(/[^a-z0-9-]/gi, "") || `vid-${Date.now()}`;

    await context.close();
    context = null;
    page = null;

    const srcPath = await video.path();
    await mkdir(ASSISTANT_RECORDINGS, { recursive: true });
    const destPath = join(ASSISTANT_RECORDINGS, `${id}.webm`);
    await copyFile(srcPath, destPath);

    await getPage();
    await page!.goto(currentUrl, { waitUntil: "domcontentloaded" }).catch(() => {});

    return `Saved recording to ${destPath}`;
  } catch (e) {
    return `recordVideo failed: ${(e as Error).message}`;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}

export type ScrapedLink = {
  url: string;
  title: string;
  thumbnail: string;
  duration: string;
};

/**
 * Extract all video links from the current page (works on any tube site, not just xhamster).
 * Looks for anchors that have an associated thumbnail image and a title.
 * Returns up to 50 video entries with URL, title, thumbnail and duration.
 */
export async function browserScrapeVideoLinks(): Promise<ScrapedLink[] | string> {
  try {
  const p = await getPage();
  const currentOrigin = new URL(p.url()).origin;
  const links = await p.evaluate((origin): ScrapedLink[] => {
    const seen = new Set<string>();
    const results: ScrapedLink[] = [];
    const DURATION_RE = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;
    const SKIP_PATHS = ["/my/", "/creators/", "/channels/", "/tags/", "/categories/", "/pornstars/", "/models/"];

    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));

    for (const a of anchors) {
      const href = a.href || "";
      if (!href || href === "#") continue;
      // Only follow links on the same site.
      if (!href.startsWith(origin) && !href.startsWith("/")) continue;
      if (SKIP_PATHS.some((s) => href.includes(s))) continue;
      if (seen.has(href)) continue;

      // Must have a thumbnail image inside the link or its card container.
      const card =
        a.closest("li, article, [class*='thumb'], [class*='video'], [class*='item'], [class*='card']") ||
        a.parentElement;
      const img =
        a.querySelector<HTMLImageElement>("img") ||
        card?.querySelector<HTMLImageElement>("img");
      if (!img) continue;

      // Title
      const title = (
        a.getAttribute("title") ||
        a.getAttribute("aria-label") ||
        img.getAttribute("alt") ||
        a.querySelector("[class*='title'], h2, h3, h4, strong")?.textContent ||
        a.textContent ||
        ""
      ).trim();
      if (title.length < 2) continue;

      seen.add(href);

      const thumbnail =
        img.src ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-original") ||
        "";

      // Skip logo/sprite/icon/svg images — real video thumbnails have photo-like URLs
      if (!thumbnail || /logo|sprite|icon|placeholder|blank\.gif|1x1|\.svg$/i.test(thumbnail)) continue;
      // Only accept individual video/watch pages — must contain /videos/ or /video/ in path
      const path = new URL(href).pathname;
      if (!/\/(videos?|watch)\//.test(path)) continue;
      // Skip navigation/utility paths
      if (/\/(password|login|register|signup|categories|pornstars|channels|photos|tags|models|creators|live|premium|dating|subscriptions|chat)/.test(href)) continue;

      // Duration: prefer an element that looks like a badge, fall back to regex on card text.
      const durEl = card?.querySelector<HTMLElement>(
        "[class*='duration'], [class*='time'], [class*='label'], [class*='length'], [class*='runtime']"
      );
      const durText = durEl?.textContent?.trim() || "";
      const durMatch = !durText ? DURATION_RE.exec(card?.textContent || "") : null;
      const duration = durText || durMatch?.[1] || "";

      results.push({ url: href, title, thumbnail, duration });
      if (results.length >= 50) break;
    }

    return results;
  }, currentOrigin);
  return links;
  } catch (e) {
    return `scrapeVideoLinks failed: ${(e as Error).message}`;
  }
}

/**
 * Type a search query into the site's search input and submit it.
 * Works on any tube site. After this, call scrapePageVideos to get results.
 */
export async function browserSearchOnPage(query: string): Promise<string> {
  const p = await getPage();
  const selectors = [
    'input[name="q"]',
    'input[name="query"]',
    'input[name="search"]',
    'input[type="search"]',
    'input[placeholder*="search" i]',
    ".search-form input",
    "form[role='search'] input",
    "[class*='search'] input",
  ];
  for (const sel of selectors) {
    try {
      const el = p.locator(sel).first();
      if (await el.isVisible()) {
        await el.fill(query);
        await el.press("Enter");
        await p.waitForTimeout(3000);
        return `Searched for "${query}". Current URL: ${p.url()}`;
      }
    } catch {
      // Try next selector.
    }
  }
  return `No search input found on this page. Current URL: ${p.url()}`;
}

/**
 * Detect whether the current page is a LISTING page or a single VIDEO page.
 * Works on any tube site — uses DOM heuristics rather than URL patterns.
 */
export async function browserDetectPageType(): Promise<string> {
  const p = await getPage();
  const url = p.url();

  const meta = await p.evaluate(() => {
    const title = document.title || "";

    // A video watch page: has a <video> element with a non-zero duration, or a dedicated player container.
    const videoEl = document.querySelector<HTMLVideoElement>("video");
    const hasVideoEl = !!videoEl;
    const videoDuration = videoEl?.duration || 0;
    const hasPlayerContainer = !!document.querySelector(
      "#player-container, [id*='player'], [class*='player'], [class*='xplayer']"
    );

    // Count card-style anchor+image pairs — many of these = listing page.
    const cardCount = Array.from(document.querySelectorAll("a[href]")).filter((a) => {
      const card =
        a.closest("li, article, [class*='thumb'], [class*='video'], [class*='item'], [class*='card']") ||
        a.parentElement;
      return !!(a.querySelector("img") || card?.querySelector("img"));
    }).length;

    const hasSearchInput = !!document.querySelector('input[name="q"], input[type="search"], [class*="search"] input');
    const isSearchPage = /search|find|query/i.test(window.location.pathname);

    return { title, hasVideoEl, videoDuration, hasPlayerContainer, cardCount, hasSearchInput, isSearchPage };
  });

  let pageType: string;
  // A dedicated video page: has a player AND few cards (not a listing).
  if ((meta.hasVideoEl || meta.hasPlayerContainer) && meta.cardCount < 5) {
    pageType = "video";
  } else if (meta.isSearchPage && meta.cardCount > 0) {
    pageType = "search";
  } else if (meta.cardCount >= 3) {
    pageType = "listing";
  } else {
    pageType = "unknown";
  }

  return JSON.stringify({
    pageType,
    url,
    ...meta,
    hint:
      pageType === "video"
        ? "VIDEO PAGE: Follow the recording flow. Verify you are NOT on a listing page before recording."
        : pageType === "listing"
        ? "LISTING PAGE: Call scrapePageVideos to get all video links, then navigate to each and record."
        : pageType === "search"
        ? "SEARCH RESULTS PAGE: Call scrapePageVideos to get video links."
        : "Unknown page. Take a screenshot to understand the layout.",
  });
}

/**
 * Run arbitrary JavaScript in the current page and return the serialised result.
 * Use this to inspect video state, read metadata, or interact with elements.
 */
export async function browserEvaluateJS(script: string): Promise<string> {
  const p = await getPage();
  try {
    // Wrap in an async IIFE so the script can use return statements.
    const result = await p.evaluate(
      new Function("return (async function(){" + script + "})()") as () => Promise<unknown>
    );
    return JSON.stringify(result ?? null);
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
}
