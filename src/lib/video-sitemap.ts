/** Helpers for Google Video Sitemap XML (video namespace). */

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function sitemapVideoTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  return t.length <= 100 ? t : `${t.slice(0, 99).trim()}…`;
}

export function sitemapVideoDescription(text: string, fallback: string): string {
  const t = (text || fallback).replace(/\s+/g, " ").trim();
  return t.length <= 2048 ? t : `${t.slice(0, 2047).trim()}…`;
}

/** Stable, crawler-friendly thumbnail URL (not IP-bound CDN links). */
export function publicVideoThumbnailUrl(base: string, videoId: string): string {
  return `${base}/media/thumbnail/${videoId}`;
}

/** Stable, crawler-friendly preview MP4 for video:content_loc (not signed CDN URLs). */
export function publicVideoContentUrl(base: string, videoId: string): string {
  return `${base}/media/preview/${videoId}`;
}

export function iso8601(date: Date): string {
  return date.toISOString();
}

export type VideoSitemapEntry = {
  pageUrl: string;
  thumbnailUrl: string;
  title: string;
  description: string;
  /** Direct link to raw video bytes (preview clip). Required by Google; must differ from pageUrl. */
  contentUrl: string;
  durationSec?: number | null;
  /** Real source upload date; omitted from the XML when unknown (never fake it with scrape time). */
  publicationDate?: Date | null;
  viewCount?: number;
  tags?: string[];
  lastModified?: Date;
};

export function renderVideoSitemapUrl(entry: VideoSitemapEntry): string {
  const lines = [
    "  <url>",
    `    <loc>${escapeXml(entry.pageUrl)}</loc>`,
  ];

  if (entry.lastModified) {
    lines.push(`    <lastmod>${iso8601(entry.lastModified)}</lastmod>`);
  }

  lines.push("    <video:video>");
  lines.push(`      <video:thumbnail_loc>${escapeXml(entry.thumbnailUrl)}</video:thumbnail_loc>`);
  lines.push(`      <video:title>${escapeXml(entry.title)}</video:title>`);
  lines.push(`      <video:description>${escapeXml(entry.description)}</video:description>`);
  lines.push(`      <video:content_loc>${escapeXml(entry.contentUrl)}</video:content_loc>`);

  if (entry.durationSec && entry.durationSec > 0) {
    lines.push(`      <video:duration>${Math.floor(entry.durationSec)}</video:duration>`);
  }

  if (entry.publicationDate) {
    lines.push(`      <video:publication_date>${iso8601(entry.publicationDate)}</video:publication_date>`);
  }

  if (entry.viewCount != null && entry.viewCount >= 0) {
    lines.push(`      <video:view_count>${entry.viewCount}</video:view_count>`);
  }

  lines.push("      <video:family_friendly>no</video:family_friendly>");
  lines.push("      <video:requires_subscription>no</video:requires_subscription>");
  lines.push("      <video:live>no</video:live>");

  for (const tag of (entry.tags ?? []).slice(0, 32)) {
    lines.push(`      <video:tag>${escapeXml(tag)}</video:tag>`);
  }

  lines.push("    </video:video>");
  lines.push("  </url>");

  return lines.join("\n");
}

export function renderUrlOnlySitemapEntry(url: string, lastModified?: Date): string {
  const lines = ["  <url>", `    <loc>${escapeXml(url)}</loc>`];
  if (lastModified) lines.push(`    <lastmod>${iso8601(lastModified)}</lastmod>`);
  lines.push("  </url>");
  return lines.join("\n");
}

export function renderSitemapXml(body: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
    body,
    "</urlset>",
  ].join("\n");
}

export function renderSitemapIndexXml(
  sitemaps: { loc: string; lastModified?: Date | null }[]
): string {
  const body = sitemaps
    .map((s) => {
      const lines = ["  <sitemap>", `    <loc>${escapeXml(s.loc)}</loc>`];
      if (s.lastModified) lines.push(`    <lastmod>${iso8601(s.lastModified)}</lastmod>`);
      lines.push("  </sitemap>");
      return lines.join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    "</sitemapindex>",
  ].join("\n");
}

/** Videos per chunked video sitemap (`/sitemaps/videos-{n}.xml`). */
export const SITEMAP_VIDEO_CHUNK_SIZE = 1000;
