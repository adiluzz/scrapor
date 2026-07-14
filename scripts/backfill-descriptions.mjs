#!/usr/bin/env node
/**
 * One-time SEO backfill over all videos:
 *  1. Clean descriptions that leak scrape-source names/URLs (pornone,
 *     paradisehill, "watch free on…", …) — mirrors worker/seo_text.py.
 *  2. Generate a description for videos that have none, templated from
 *     title + tags + pornstars + duration with per-video seeded variation.
 *
 * Usage:
 *   node scripts/backfill-descriptions.mjs           # dry run (prints what would change)
 *   node scripts/backfill-descriptions.mjs --apply   # write changes
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const SOURCE_PATTERNS = [
  "(?:en\\.)?paradisehill\\.cc",
  "paradise\\s*hill",
  "pornone(?:\\.com)?",
  "eporner(?:\\.com)?",
  "xhamster(?:\\.com|\\.desi)?",
  "xnxx(?:\\.com)?",
  "abxxx(?:\\.com)?",
  "redtube(?:\\.com)?",
  "spankbang(?:\\.com)?",
  "youporn(?:\\.com)?",
  "hqporner(?:\\.com)?",
  "pornhub(?:\\.com)?",
];
const SOURCES = SOURCE_PATTERNS.join("|");

const BOILERPLATE_RES = [
  new RegExp(
    `[^.!?\\n]*\\b(?:watch|stream|download)[^.!?\\n]*\\b(?:free|now|online|full)\\b[^.!?\\n]*\\b(?:on|at)\\s+(?:${SOURCES})[^.!?\\n]*[.!?]?`,
    "gi"
  ),
  /[^.!?\n]*\buploaded\s+(?:by|to|on)\b[^.!?\n]*[.!?]?/gi,
  new RegExp(`[^.!?\\n]*\\bfor\\s+free\\s+(?:on|at)\\s+(?:${SOURCES})[^.!?\\n]*[.!?]?`, "gi"),
];
const SOURCE_RE = new RegExp(`(?:${SOURCES})`, "gi");
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const LEAK_TEST = new RegExp(`(?:${SOURCES})|https?:\\/\\/|www\\.`, "i");

function cleanDescription(text) {
  if (!text) return null;
  let out = String(text);
  for (const re of BOILERPLATE_RES) out = out.replace(re, " ");
  out = out.replace(URL_RE, " ").replace(SOURCE_RE, " ");
  out = out.replace(/\b(?:on|at|from|via)\s*(?=[.,!?]|$)/gi, "");
  out = out.replace(/\s+([.,!?;:])/g, "$1");
  out = out.replace(/([.,!?;:])\1+/g, "$1");
  out = out.replace(/\s{2,}/g, " ").replace(/^[\s\-–—,;:]+|[\s\-–—,;:]+$/g, "").trim();
  return out || null;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function formatDuration(sec) {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  return m >= 1 ? `${m} minute` : "";
}

/** Seeded per-video template so generated descriptions aren't identical. */
function generateDescription(video, siteName) {
  const tags = video.tags.map((t) => t.tag.name).slice(0, 4);
  const stars = video.pornstars.map((p) => p.pornstar.name).slice(0, 3);
  const dur = formatDuration(video.durationSec);
  const starsPart = stars.length ? ` featuring ${stars.join(", ")}` : "";
  const tagsPart = tags.length ? tags.join(", ").toLowerCase() : "hardcore";
  const durPart = dur ? `${dur} ` : "";
  const templates = [
    `${video.title} — ${durPart}${tagsPart} video${starsPart}. Stream it free in HD on ${siteName}.`,
    `Enjoy ${video.title}${starsPart}, a ${durPart}${tagsPart} scene streaming free on ${siteName}.`,
    `${video.title}: ${durPart}${tagsPart} action${starsPart}. Watch the full video free on ${siteName}.`,
    `Full ${tagsPart} video: ${video.title}${starsPart}. ${dur ? `Runtime ${dur}s. ` : ""}Free HD streaming on ${siteName}.`,
  ];
  const pick = templates[hashSeed(video.id) % templates.length];
  return pick.replace(/\s{2,}/g, " ").trim();
}

async function main() {
  const videos = await prisma.video.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      title: true,
      description: true,
      durationSec: true,
      site: { select: { name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      pornstars: { include: { pornstar: { select: { name: true } } } },
    },
  });

  let cleaned = 0;
  let generated = 0;
  for (const v of videos) {
    let next = null;
    if (v.description && LEAK_TEST.test(v.description)) {
      next = cleanDescription(v.description);
      if (!next) next = generateDescription(v, v.site.name);
      cleaned++;
    } else if (!v.description || !v.description.trim()) {
      next = generateDescription(v, v.site.name);
      generated++;
    }
    if (next && next !== v.description) {
      if (APPLY) {
        await prisma.video.update({ where: { id: v.id }, data: { description: next } });
      } else if (cleaned + generated <= 10) {
        console.log(`--- ${v.id} (${v.title.slice(0, 60)})`);
        console.log(`  old: ${(v.description || "").slice(0, 140)}`);
        console.log(`  new: ${next.slice(0, 140)}`);
      }
    }
  }

  console.log(
    `${APPLY ? "Updated" : "[dry-run] Would update"} ${cleaned} leaking + ${generated} empty descriptions (of ${videos.length} videos).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
