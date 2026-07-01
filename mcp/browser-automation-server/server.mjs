import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chromium } from "playwright";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const SCREENSHOT_DIR = join(process.cwd(), "library", "mcp-screenshots");
const RECORDING_DIR = join(process.cwd(), "library", "mcp-recordings");
const TEMP_RECORDING_DIR = join(process.cwd(), ".recordings-mcp");

let browser = null;
let context = null;
let page = null;

function textResult(text) {
  return {
    content: [{ type: "text", text }],
  };
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toSafeBaseName(input) {
  const base = (input || "capture").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  return base || "capture";
}

async function closeSession() {
  if (context) {
    await context.close();
  }
  if (browser) {
    await browser.close();
  }
  browser = null;
  context = null;
  page = null;
}

async function ensureSession({
  headless = true,
  width = 1920,
  height = 1080,
  recordVideo = true,
} = {}) {
  if (page && !page.isClosed()) return page;

  await mkdir(TEMP_RECORDING_DIR, { recursive: true });
  browser = await chromium.launch({ headless });
  context = await browser.newContext({
    viewport: { width, height },
    recordVideo: recordVideo
      ? {
          dir: TEMP_RECORDING_DIR,
          size: { width, height },
        }
      : undefined,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  page = await context.newPage();
  return page;
}

function requirePage() {
  if (!page || page.isClosed()) {
    throw new Error("No active page. Call browser_open first.");
  }
  return page;
}

async function collectClickTargets(activePage) {
  return activePage.evaluate(() => {
    const selectorFor = (el) => {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || "")
        .toString()
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((c) => c.replace(/[^a-zA-Z0-9_-]/g, ""))
        .filter(Boolean)
        .join(".");
      return cls ? `${tag}.${cls}` : tag;
    };

    const candidates = Array.from(
      document.querySelectorAll(
        "a,button,[role='button'],input[type='button'],input[type='submit'],[onclick]"
      )
    );

    return candidates
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visible =
          rect.width > 4 &&
          rect.height > 4 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.bottom > 0 &&
          rect.right > 0;
        if (!visible) return null;

        const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
        return {
          selector: selectorFor(el),
          text: text.slice(0, 120),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter(Boolean)
      .slice(0, 80);
  });
}

const server = new McpServer({
  name: "scrapor-browser-mcp",
  version: "1.0.0",
});

server.tool(
  "browser_open",
  "Open browser and optionally navigate to a URL.",
  {
    url: z.string().url().optional(),
    headless: z.boolean().optional(),
    width: z.number().int().min(640).max(3840).optional(),
    height: z.number().int().min(480).max(2160).optional(),
    recordVideo: z.boolean().optional(),
    reset: z.boolean().optional(),
  },
  async ({ url, headless, width, height, recordVideo, reset }) => {
    if (reset) await closeSession();
    const activePage = await ensureSession({ headless, width, height, recordVideo });
    if (url) {
      await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    }

    const title = await activePage.title();
    return textResult(`Browser ready.\nURL: ${activePage.url()}\nTitle: ${title}`);
  }
);

server.tool(
  "browser_navigate",
  "Navigate the current page to a URL.",
  { url: z.string().url() },
  async ({ url }) => {
    const activePage = requirePage();
    await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    return textResult(`Navigated to ${activePage.url()}`);
  }
);

server.tool(
  "browser_click",
  "Click using selector, coordinates, or text match.",
  {
    selector: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    text: z.string().optional(),
    timeoutMs: z.number().int().min(500).max(20000).optional(),
  },
  async ({ selector, x, y, text, timeoutMs }) => {
    const activePage = requirePage();
    const timeout = timeoutMs ?? 6000;

    if (selector) {
      await activePage.click(selector, { timeout });
      return textResult(`Clicked selector: ${selector}`);
    }

    if (typeof x === "number" && typeof y === "number") {
      await activePage.mouse.click(x, y);
      return textResult(`Clicked coordinates (${x}, ${y})`);
    }

    if (text) {
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const textRegex = new RegExp(escaped, "i");

      const roleButton = activePage.getByRole("button", { name: textRegex }).first();
      if ((await roleButton.count()) > 0) {
        await roleButton.click({ timeout });
        return textResult(`Clicked button by label: ${text}`);
      }

      const byText = activePage.getByText(textRegex).first();
      if ((await byText.count()) > 0) {
        await byText.click({ timeout });
        return textResult(`Clicked element by visible text: ${text}`);
      }

      const targets = await collectClickTargets(activePage);
      const hit = targets.find((t) => t.text && t.text.toLowerCase().includes(text.toLowerCase()));
      if (hit) {
        await activePage.mouse.click(hit.x, hit.y);
        return textResult(
          `Clicked best text match at (${hit.x}, ${hit.y}) using target "${hit.text}" (${hit.selector})`
        );
      }

      throw new Error(`No clickable target found for text: ${text}`);
    }

    throw new Error("Provide one of: selector, x+y, or text.");
  }
);

server.tool(
  "browser_type",
  "Type text into an input selector.",
  {
    selector: z.string(),
    text: z.string(),
    clearFirst: z.boolean().optional(),
  },
  async ({ selector, text, clearFirst }) => {
    const activePage = requirePage();
    if (clearFirst) {
      await activePage.fill(selector, "", { timeout: 6000 });
    }
    await activePage.fill(selector, text, { timeout: 6000 });
    return textResult(`Typed into ${selector}`);
  }
);

server.tool(
  "browser_screenshot",
  "Take screenshot and save to disk.",
  { name: z.string().optional(), fullPage: z.boolean().optional() },
  async ({ name, fullPage }) => {
    const activePage = requirePage();
    await mkdir(SCREENSHOT_DIR, { recursive: true });

    const filename = `${toSafeBaseName(name || "shot")}-${nowStamp()}.png`;
    const path = join(SCREENSHOT_DIR, filename);
    await activePage.screenshot({ path, type: "png", fullPage: !!fullPage });
    return textResult(`Saved screenshot: ${path}`);
  }
);

server.tool(
  "browser_get_click_targets",
  "List likely clickable elements with text and coordinates.",
  {},
  async () => {
    const activePage = requirePage();
    const targets = await collectClickTargets(activePage);
    return textResult(JSON.stringify({ url: activePage.url(), targets }, null, 2));
  }
);

server.tool(
  "browser_save_video",
  "Finalize current recording and save video file.",
  { name: z.string().optional() },
  async ({ name }) => {
    const activePage = requirePage();
    const activeContext = context;
    if (!activeContext) throw new Error("No active browser context.");

    const video = activePage.video();
    if (!video) {
      throw new Error("Video recording is not enabled. Re-open with recordVideo=true.");
    }

    const keepUrl = activePage.url();
    await activeContext.close();
    context = null;
    page = null;

    const source = await video.path();
    await mkdir(RECORDING_DIR, { recursive: true });
    const filename = `${toSafeBaseName(name || "recording")}-${nowStamp()}.webm`;
    const destination = join(RECORDING_DIR, filename);
    await copyFile(source, destination);

    await ensureSession({ recordVideo: true });
    await page.goto(keepUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    return textResult(`Saved recording: ${destination}`);
  }
);

server.tool(
  "browser_close",
  "Close browser and clear active session.",
  {},
  async () => {
    await closeSession();
    return textResult("Browser closed.");
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
