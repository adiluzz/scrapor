#!/usr/bin/env node
/**
 * Standalone scrape script: scrapes homepage, saves to DB and local directory.
 * Run: node scripts/run-scrape.mjs
 */

import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const VIDEOS_DIR = join(PROJECT_ROOT, "videos");

const prisma = new PrismaClient();

async function fetchHtml(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
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

function extractVideosFromHtml(html) {
  const seen = new Set();
  const videos = [];
  const linkRegex =
    /href="(https:\/\/xhamster\.com\/videos\/([^"]+))"[^>]*(?:title="([^"]*)"|aria-label="([^"]*)")/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const [, fullUrl, id, titleAttr, ariaLabel] = m;
    if (!fullUrl || !id || id.includes("creators") || id.includes("my/liked"))
      continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = titleAttr || ariaLabel || "";
    if (!title || title.length < 3) continue;
    videos.push({ id, title, url: fullUrl, thumbnail: "", duration: "" });
  }
  const imgRegex =
    /src="(https:\/\/ic-vt-nss\.xhcdn\.com[^"]+\.(?:jpg|jpeg|webp)[^"]*)"/g;
  const thumbnails = [];
  while ((m = imgRegex.exec(html)) !== null) thumbnails.push(m[1]);
  videos.forEach((v, i) => {
    if (thumbnails[i]) v.thumbnail = thumbnails[i];
  });
  return videos;
}

async function scrapeVideoDetail(url) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
  };
  const html = await fetchHtml(url, headers);
  const data = extractInitialsJson(html);
  if (!data) return null;

  const vm = data.videoModel;
  const ve = data.videoEntity;
  const vtc = data.videoTagsComponent;

  const slug = url.split("/videos/")[1]?.split("?")[0]?.trim() || ve?.idHashSlug || "";
  const title = vm?.title || ve?.title || "";
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

  return {
    slug,
    title,
    url,
    thumbnail: thumbnail || undefined,
    duration: duration ? String(duration) : undefined,
    description: description || undefined,
    tags,
    pornstars,
  };
}

async function main() {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
  };

  console.log("Fetching homepage...");
  const html = await fetchHtml("https://xhamster.com", headers);
  const homepageVideos = extractVideosFromHtml(html);
  console.log(`Found ${homepageVideos.length} videos on homepage`);

  await mkdir(VIDEOS_DIR, { recursive: true });
  console.log(`Saving to ${VIDEOS_DIR}`);

  let saved = 0;
  for (let i = 0; i < homepageVideos.length; i++) {
    const v = homepageVideos[i];
    console.log(`[${i + 1}/${homepageVideos.length}] ${v.title.slice(0, 50)}...`);

    const detail = await scrapeVideoDetail(v.url);
    if (!detail) continue;

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
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. Saved ${saved} videos to DB and ${VIDEOS_DIR}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
