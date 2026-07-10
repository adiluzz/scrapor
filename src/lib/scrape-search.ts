import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { join } from "path";
import {
  redis,
  SCRAPE_SEARCH_QUEUE_KEY,
  scrapeSearchResultKey,
} from "@/lib/redis";
import type { ScrapeCandidate, ScrapeSearchResult } from "@/types/scrape-candidate";

export type ScrapeSearchParams = {
  query?: string;
  sources?: string[];
  urls?: string[];
  minDurationSec?: number;
  cursors?: Record<string, number | string>;
  limit?: number;
  /** Skip this many unique search hits before returning results (initial search only). */
  skip?: number;
  excludeUrls?: string[];
};

/** How long the web app waits for the worker to finish an interactive search. */
const SEARCH_TIMEOUT_MS = 1_800_000; // 30 minutes
const POLL_MS = 1_000;
const PREVIEW_BATCH = 50;

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function normalizeResult(raw: {
  videos: Array<Omit<ScrapeCandidate, "durationLabel">>;
  cursors: Record<string, number | string>;
  hasMore: boolean;
  errors?: Array<{ url: string; error: string }>;
}): ScrapeSearchResult {
  return {
    cursors: raw.cursors,
    hasMore: raw.hasMore,
    errors: raw.errors,
    videos: raw.videos.map((v) => ({
      ...v,
      durationLabel: formatDuration(v.durationSec),
    })),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLocalPythonSearch(params: ScrapeSearchParams): Promise<ScrapeSearchResult> {
  const script = join(process.cwd(), "scripts", "scrape_search.py");
  const payload = JSON.stringify({
    query: params.query,
    sources: params.sources,
    urls: params.urls,
    minDurationSec: params.minDurationSec ?? 600,
    cursors: params.cursors,
    limit: params.limit ?? PREVIEW_BATCH,
    skip: params.skip ?? 0,
    excludeUrls: params.excludeUrls,
  });

  return await new Promise((resolve, reject) => {
    const child = spawn("python3", [script], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `scrape_search.py exited ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as {
          videos: Array<Omit<ScrapeCandidate, "durationLabel">>;
          cursors: Record<string, number | string>;
          hasMore: boolean;
        };
        resolve(normalizeResult(parsed));
      } catch (e) {
        reject(new Error(`Invalid search output: ${(e as Error).message}`));
      }
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

async function runRedisSearch(params: ScrapeSearchParams): Promise<ScrapeSearchResult> {
  const requestId = randomUUID();
  await redis.rpush(
    SCRAPE_SEARCH_QUEUE_KEY,
    JSON.stringify({
      id: requestId,
      query: params.query,
      sources: params.sources,
      urls: params.urls,
      minDurationSec: params.minDurationSec ?? 600,
      cursors: params.cursors,
      limit: params.limit ?? PREVIEW_BATCH,
      skip: params.skip ?? 0,
      excludeUrls: params.excludeUrls,
    })
  );

  const deadline = Date.now() + SEARCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const raw = await redis.get(scrapeSearchResultKey(requestId));
    if (raw) {
      await redis.del(scrapeSearchResultKey(requestId));
      const parsed = JSON.parse(raw) as {
        ok?: boolean;
        error?: string;
        videos?: Array<Omit<ScrapeCandidate, "durationLabel">>;
        cursors?: Record<string, number | string>;
        hasMore?: boolean;
        errors?: Array<{ url: string; error: string }>;
      };
      if (parsed.ok === false) {
        throw new Error(parsed.error || "Search failed");
      }
      return normalizeResult({
        videos: parsed.videos ?? [],
        cursors: parsed.cursors ?? {},
        hasMore: parsed.hasMore ?? false,
        errors: parsed.errors,
      });
    }
    await sleep(POLL_MS);
  }
  throw new Error("Search timed out — is the scrape worker running?");
}

/** Search external source sites for interactive scrape preview. */
export async function searchScrapeCandidates(params: ScrapeSearchParams): Promise<ScrapeSearchResult> {
  if (process.env.SCRAPE_SEARCH_LOCAL !== "0") {
    try {
      return await runLocalPythonSearch(params);
    } catch {
      // Fall back to Redis when Python isn't available (production web container).
    }
  }
  return runRedisSearch(params);
}

export { PREVIEW_BATCH };
