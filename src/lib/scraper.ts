import * as cheerio from "cheerio";
import type { ScrapedVideo, VideoDetail } from "@/types/video";

const BASE_URL = "https://xhamster.com";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

const EXCLUDED_PATHS = ["/my/liked/videos", "/creators/videos/", "/channels/"];

function isVideoLink(href: string): boolean {
  if (!href.includes("/videos/")) return false;
  return !EXCLUDED_PATHS.some((p) => href.includes(p));
}

/** Extract window.initials JSON from video page HTML */
function extractInitialsJson(html: string): Record<string, unknown> | null {
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
    const raw = html.slice(jsonStart, end).replace(/\\\//g, "/");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Regex fallback when DOM structure varies */
function extractVideosFromHtml(html: string): ScrapedVideo[] {
  const seen = new Set<string>();
  const videos: ScrapedVideo[] = [];

  const linkRegex =
    /href="(https:\/\/xhamster\.com\/videos\/([^"]+))"[^>]*(?:title="([^"]*)"|aria-label="([^"]*)")/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const [, fullUrl, id, titleAttr, ariaLabel] = m;
    if (!fullUrl || !id || !isVideoLink(fullUrl)) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = titleAttr || ariaLabel || "";
    if (!title || title.length < 3) continue;

    videos.push({
      id,
      title,
      url: fullUrl,
      thumbnail: "",
      duration: "",
    });
  }

  const imgRegex =
    /src="(https:\/\/ic-vt-nss\.xhcdn\.com[^"]+\.(?:jpg|jpeg|webp)[^"]*)"/g;
  const thumbnails: string[] = [];
  while ((m = imgRegex.exec(html)) !== null) thumbnails.push(m[1]);

  videos.forEach((v, i) => {
    if (thumbnails[i]) v.thumbnail = thumbnails[i];
  });

  return videos;
}

export async function scrapeHomepageVideos(page = 1): Promise<ScrapedVideo[]> {
  const url = page === 1 ? BASE_URL : `${BASE_URL}/?page=${page}`;

  const response = await fetch(url, { headers: FETCH_HEADERS });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const html = await response.text();
  const videos = extractVideosFromHtml(html);

  if (videos.length === 0) {
    const $ = cheerio.load(html);
    const seen = new Set<string>();

    $('a[href*="/videos/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      if (!href || !isVideoLink(href)) return;

      const match = href.match(/\/videos\/([^/?#]+)/);
      if (!match) return;

      const id = match[1];
      if (seen.has(id)) return;
      seen.add(id);

      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      const title =
        $el.attr("title") || $el.attr("aria-label") || $el.text().trim();
      if (!title || title.length < 3) return;

      let thumbnail = "";
      const $container = $el.closest(
        "[data-video-id], .video-list__item, .thumb-list__item, [class*='thumb']"
      );
      const $img = ($container.length ? $container : $el.parent())
        .find("img")
        .first();
      if ($img.length) {
        thumbnail =
          $img.attr("src") ||
          $img.attr("data-src") ||
          $img.attr("data-lazy-src") ||
          "";
      }

      const $durationEl = ($container.length ? $container : $el.parent())
        .find("[class*='duration'], [class*='time']")
        .first();
      const duration = $durationEl.text().trim() || "";

      videos.push({ id, title, url: fullUrl, thumbnail, duration });
    });
  }

  return videos;
}

/** Scrape a single video page for full details (title, tags, description, pornstars) */
export async function scrapeVideoDetail(
  urlOrSlug: string
): Promise<VideoDetail | null> {
  const url = urlOrSlug.startsWith("http")
    ? urlOrSlug
    : `${BASE_URL}/videos/${urlOrSlug}`;

  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) return null;

  const html = await response.text();
  const data = extractInitialsJson(html);
  if (!data) return null;

  const videoModel = data.videoModel as Record<string, unknown> | undefined;
  const videoEntity = data.videoEntity as Record<string, unknown> | undefined;
  const videoTagsComponent = data.videoTagsComponent as Record<string, unknown> | undefined;

  const title =
    (videoModel?.title as string) ||
    (videoEntity?.title as string) ||
    "";
  const slug =
    (url.split("/videos/")[1]?.split("?")[0] || "").trim() ||
    (videoEntity?.idHashSlug as string) ||
    (videoEntity?.slug as string) ||
    "";
  const description =
    (videoModel?.description as string) ||
    (videoEntity?.description as string) ||
    "";
  const thumbnail = (videoModel?.thumbURL as string) || (videoEntity?.thumbBig as string) || "";
  const duration = (videoModel?.duration as string) || (videoEntity?.duration as string) || "";

  const tags: string[] = [];
  const categories: string[] = [];
  const pornstars: string[] = [];

  const tagsData = videoTagsComponent?.tags as Array<{
    name?: string;
    url?: string;
    link?: string;
    pageURL?: string;
    isPornstar?: boolean;
    isCreator?: boolean;
  }> | undefined;
  if (Array.isArray(tagsData)) {
    for (const t of tagsData) {
      if (!t?.name) continue;
      const href = (t.url || t.link || t.pageURL || "").toLowerCase();
      if (href.includes("/categories/")) {
        if (!categories.includes(t.name)) categories.push(t.name);
      } else if (href.includes("/pornstars/") || t.isPornstar) {
        if (!pornstars.includes(t.name)) pornstars.push(t.name);
      } else if (href.includes("/creators/") || href.includes("/channels/") || t.isCreator) {
        // creators/channels are not pornstars or categories
      } else if (!tags.includes(t.name)) {
        tags.push(t.name);
      }
    }
  }

  const pornstarModels = videoEntity?.pornstarModels as Array<{ name?: string; title?: string }> | undefined;
  if (Array.isArray(pornstarModels)) {
    for (const p of pornstarModels) {
      const name = p?.name || p?.title;
      if (name && !pornstars.includes(name)) {
        pornstars.push(name);
      }
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
    categories,
    pornstars,
  };
}

/** Scrape homepage, then visit each video and scrape full details */
export async function scrapeHomepageWithDetails(
  page = 1,
  onProgress?: (current: number, total: number, video: ScrapedVideo) => void
): Promise<VideoDetail[]> {
  const homepageVideos = await scrapeHomepageVideos(page);
  const results: VideoDetail[] = [];

  for (let i = 0; i < homepageVideos.length; i++) {
    const v = homepageVideos[i];
    onProgress?.(i + 1, homepageVideos.length, v);

    const detail = await scrapeVideoDetail(v.url);
    if (detail) {
      results.push({
        ...detail,
        thumbnail: detail.thumbnail || v.thumbnail,
        duration: detail.duration || v.duration,
      });
    }

    // Rate limit: small delay between requests
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}
