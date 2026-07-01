import { exec, spawn } from "child_process";
import { copyFile, mkdir } from "fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "path";
import { promisify } from "util";

export const execAsync = promisify(exec);
export const LESSONS_FILE = join(process.cwd(), "library", "scraping-lessons.md");

export type ProcessRunResult = {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};

export type Crawl4AiOptions = {
  url: string;
  extractionGoal?: string;
  cssSelector?: string;
  maxChars?: number;
  includeLinks?: boolean;
  includeMetadata?: boolean;
  timeoutSeconds?: number;
  pythonExecutable?: string;
};

export async function runProcess(
  command: string,
  args: string[],
  options?: { cwd?: string; timeoutSeconds?: number }
): Promise<ProcessRunResult> {
  const cwd = options?.cwd || process.cwd();
  const timeoutSeconds = Math.max(1, Math.min(options?.timeoutSeconds ?? 300, 86400));
  const timeoutMs = timeoutSeconds * 1000;

  return await new Promise<ProcessRunResult>((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        timedOut,
        stdout,
        stderr: `${stderr}\n${String(error.message || error)}`.trim(),
      });
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: code, timedOut, stdout, stderr });
    });
  });
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function normalizeLibraryImagePath(input: string): string {
  const p = (input || "").trim().replace(/^\/+/, "");
  if (!p.startsWith("library/")) throw new Error("Image path must be inside library/");
  if (p.includes("..")) throw new Error("Invalid image path");
  if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(p)) throw new Error("Path must point to an image file");
  return p;
}

/**
 * Rewrite rendered-page URLs to their raw/plain equivalents so we can skip
 * the browser entirely for known plain-text sources.
 */
function normalizeUrlForCrawl(url: string): { url: string; isPlainText: boolean } {
  // GitHub blob viewer → raw file content
  const githubBlob = url.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/
  );
  if (githubBlob) {
    const [, user, repo, branch, path] = githubBlob;
    return {
      url: `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`,
      isPlainText: true,
    };
  }
  // raw.githubusercontent.com is already plain text
  if (url.startsWith("https://raw.githubusercontent.com/")) {
    return { url, isPlainText: true };
  }
  // pastebin / gist raw
  if (/^https?:\/\/(pastebin\.com\/raw|gist\.githubusercontent\.com)/.test(url)) {
    return { url, isPlainText: true };
  }
  return { url, isPlainText: false };
}

/**
 * Fast plain-text fetch using Node's built-in fetch (no browser, no Python).
 * Used for URLs that return markdown/text directly.
 */
async function fetchPlainText(
  url: string,
  maxChars: number,
  timeoutSeconds: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "crawlpage-plain-fetch/1.0", Accept: "text/plain,text/html,*/*" },
    });
    const text = await res.text();
    return JSON.stringify({
      ok: res.ok,
      url,
      fetchMethod: "plain_fetch",
      statusCode: res.status,
      contentTruncated: text.length > maxChars,
      content: text.slice(0, maxChars),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      url,
      fetchMethod: "plain_fetch",
      error: (e as Error).message || "fetch failed",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function crawlPageWithCrawl4Ai(options: Crawl4AiOptions): Promise<string> {
  const python = options.pythonExecutable || process.env.CRAWL4AI_PYTHON || "python3";
  const maxChars = Math.max(1000, Math.min(options.maxChars ?? 12000, 50000));
  const timeoutSeconds = options.timeoutSeconds ?? 120;

  // Fast path: plain-text URLs don't need a browser at all.
  const { url: effectiveUrl, isPlainText } = normalizeUrlForCrawl(options.url);
  if (isPlainText) {
    return fetchPlainText(effectiveUrl, maxChars, timeoutSeconds);
  }

  const payload = {
    url: effectiveUrl,
    extractionGoal: options.extractionGoal || "",
    cssSelector: options.cssSelector || "",
    maxChars,
    includeLinks: options.includeLinks ?? true,
    includeMetadata: options.includeMetadata ?? true,
  };
  const script = String.raw`  // eslint-disable-line
import asyncio
import json
import re
import sys

# ---------------------------------------------------------------------------
# URL normalisation — rewrite rendered pages to their raw/plain equivalents
# so crawl4ai gets actual content instead of JS-rendered nav chrome.
# ---------------------------------------------------------------------------
def normalize_url(url):
    # GitHub blob viewer → raw file content
    m = re.match(
        r'https://github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)',
        url
    )
    if m:
        user, repo, branch, path = m.groups()
        return f'https://raw.githubusercontent.com/{user}/{repo}/{branch}/{path}'

    # GitHub tree view of a directory → keep as-is (crawl4ai handles it ok)
    return url


# ---------------------------------------------------------------------------
# Quality check — decide whether crawl4ai's result is worth using
# ---------------------------------------------------------------------------
def is_poor_quality(text, url):
    """Return True when the extracted text looks like nav/chrome rather than content."""
    if not text or len(text) < 300:
        return True
    nav_phrases = [
        'skip to content', 'toggle navigation', 'sign in', 'sign up',
        'all features', 'all solutions', 'github copilot', 'cookie policy',
    ]
    lower = text.lower()
    nav_hits = sum(1 for p in nav_phrases if p in lower)
    # If more than 3 nav phrases appear in the first 2000 chars it's mostly chrome
    first_chunk = lower[:2000]
    nav_density = sum(1 for p in nav_phrases if p in first_chunk)
    return nav_density >= 3


# ---------------------------------------------------------------------------
# Plain HTTP fallback — simple requests GET + basic HTML stripping
# ---------------------------------------------------------------------------
def plain_http_fetch(url, max_chars):
    try:
        import urllib.request
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (compatible; crawlpage-fallback/1.0)',
                'Accept': 'text/html,text/plain,application/xhtml+xml,*/*',
            }
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode('utf-8', errors='replace')
        # Remove scripts/styles then strip tags
        raw = re.sub(r'<script[\s\S]*?</script>', ' ', raw, flags=re.I)
        raw = re.sub(r'<style[\s\S]*?</style>', ' ', raw, flags=re.I)
        raw = re.sub(r'<[^>]+>', ' ', raw)
        raw = re.sub(r'&amp;', '&', raw)
        raw = re.sub(r'&lt;', '<', raw)
        raw = re.sub(r'&gt;', '>', raw)
        raw = re.sub(r'&quot;', '"', raw)
        raw = re.sub(r'&#39;', "'", raw)
        raw = re.sub(r'\s+', ' ', raw).strip()
        return raw[:max_chars], None
    except Exception as exc:
        return None, str(exc)


async def main():
    payload = json.loads(sys.argv[1])
    original_url = payload['url']
    effective_url = normalize_url(original_url)
    payload['url'] = effective_url
    max_chars = int(payload.get('maxChars') or 12000)

    text = None
    method = 'crawl4ai'

    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
    except Exception as exc:
        # crawl4ai not installed — go straight to plain HTTP
        text, err = plain_http_fetch(effective_url, max_chars)
        method = 'plain_http_fallback'
        if not text:
            print(json.dumps({
                "ok": False,
                "url": original_url,
                "error": f"crawl4ai not installed and plain HTTP failed: {err}",
                "hint": "Install crawl4ai with the installPythonPackages tool.",
            }))
            return
    else:
        run_config_kwargs = {
            "cache_mode": CacheMode.BYPASS,
            "word_count_threshold": 10,
            "remove_overlay_elements": True,
            "process_iframes": True,
            "page_timeout": 60000,
        }
        if payload.get("cssSelector"):
            run_config_kwargs["css_selector"] = payload["cssSelector"]

        browser_config = BrowserConfig(headless=True, verbose=False)
        run_config = CrawlerRunConfig(**run_config_kwargs)
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=effective_url, config=run_config)

        markdown_value = getattr(result, "markdown", "") or ""
        if isinstance(markdown_value, str):
            markdown = markdown_value
        else:
            markdown = (
                getattr(markdown_value, "fit_markdown", None)
                or getattr(markdown_value, "raw_markdown", None)
                or str(markdown_value)
            )
        cleaned_html = getattr(result, "cleaned_html", "") or ""
        text = markdown or cleaned_html

        # ----- quality gate -----
        if is_poor_quality(text, effective_url):
            fallback_text, _ = plain_http_fetch(effective_url, max_chars)
            if fallback_text and len(fallback_text) > len(text or ''):
                text = fallback_text
                method = 'plain_http_fallback'
            else:
                method = 'crawl4ai_low_quality'

    data = {
        "ok": True,
        "url": original_url,
        "effectiveUrl": effective_url if effective_url != original_url else None,
        "fetchMethod": method,
        "extractionGoal": payload.get("extractionGoal") or None,
        "contentTruncated": len(text or '') > max_chars,
        "content": (text or '')[:max_chars],
    }
    # Only include links when using crawl4ai (not available for plain HTTP)
    if method == 'crawl4ai' and payload.get("includeLinks"):
        try:
            data["links"] = getattr(result, "links", None) or {}
        except Exception:
            pass
    print(json.dumps(data, ensure_ascii=False))

asyncio.run(main())
`;

  const result = await runProcess(
    python,
    ["-c", script, JSON.stringify(payload)],
    { timeoutSeconds }
  );
  if (result.timedOut) {
    return JSON.stringify({
      ok: false,
      url: options.url,
      error: `crawl4ai timed out after ${timeoutSeconds} seconds`,
    });
  }
  const output = result.stdout.trim();
  if (result.exitCode !== 0) {
    return JSON.stringify({
      ok: false,
      url: options.url,
      exitCode: result.exitCode,
      error: "crawl4ai execution failed",
      stderr: result.stderr.slice(-4000),
      stdout: output.slice(-2000),
    });
  }
  return output || JSON.stringify({ ok: false, url: options.url, error: "crawl4ai returned no output" });
}

export function makeGenericSlug(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    return pathParts[pathParts.length - 1] || `agent-${Date.now()}`;
  } catch {
    return `agent-${Date.now()}`;
  }
}

/** Returns the directory for a video: downloads/{videoId}/ */
export function videoDir(videoId: string) {
  return join(process.cwd(), "downloads", videoId);
}

/** Returns the canonical path for the main video file. */
export function videoFilePath(videoId: string) {
  return join(videoDir(videoId), "video.mp4");
}

/** Returns the canonical path for the thumbnail preview video. */
export function thumbnailFilePath(videoId: string) {
  return join(videoDir(videoId), "thumbnail.mp4");
}

export async function saveVideoFileToDownloads(videoId: string, sourcePath: string, _preferredExt = ".mp4") {
  const dir = videoDir(videoId);
  await mkdir(dir, { recursive: true });
  const src = isAbsolute(sourcePath) ? sourcePath : join(process.cwd(), sourcePath);
  const dest = videoFilePath(videoId);
  await copyFile(src, dest);
  return dest;
}

export async function saveThumbnailToDownloads(videoId: string, sourcePath: string) {
  const dir = videoDir(videoId);
  await mkdir(dir, { recursive: true });
  const src = isAbsolute(sourcePath) ? sourcePath : join(process.cwd(), sourcePath);
  const dest = thumbnailFilePath(videoId);
  await copyFile(src, dest);
  return dest;
}

/**
 * Legacy assistant entry point: registers a downloaded video against the new
 * multi-tenant schema (default site), keyed on the globally-unique sourceUrl.
 */
export async function upsertVideoRecord(input: {
  url: string;
  title: string;
  thumbnail?: string | null;
  duration?: string | null;
  description?: string | null;
  tags?: string[];
  pornstars?: string[];
}) {
  const { ensureDefaultSite } = await import("@/lib/site");
  const { upsertVideoWithMedia, durationToSeconds } = await import("@/lib/videos");
  const site = await ensureDefaultSite();
  return upsertVideoWithMedia({
    siteId: site.id,
    sourceUrl: input.url,
    title: input.title,
    description: input.description || null,
    durationSec: durationToSeconds(input.duration),
    sourceSite: "assistant",
    tags: input.tags || [],
    pornstars: input.pornstars || [],
  });
}

export { basename, dirname, extname, isAbsolute, join, mkdir };
