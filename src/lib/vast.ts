export type VastAd = {
  mediaUrl: string;
  skipOffsetSec: number | null;
  duration: number | null;
  clickThrough: string | null;
  impressionUrls: string[];
};

function parseTimeToSec(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/(\d+):(\d+):(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

/**
 * Minimal, non-IMA VAST parser. Fetches the tag and extracts the best linear
 * MediaFile (prefers progressive mp4). Returns null on empty/error/no-ad so the
 * player can gracefully skip ads.
 */
export async function fetchVastAd(tagUrl: string, timeoutMs = 4000): Promise<VastAd | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(tagUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const xml = new DOMParser().parseFromString(await res.text(), "text/xml");

    const linear = xml.querySelector("Linear");
    if (!linear) return null;

    const mediaFiles = Array.from(linear.querySelectorAll("MediaFile"))
      .map((mf) => ({
        url: (mf.textContent || "").trim(),
        type: mf.getAttribute("type") || "",
        bitrate: parseInt(mf.getAttribute("bitrate") || "0", 10),
      }))
      .filter((mf) => mf.url);
    if (mediaFiles.length === 0) return null;

    const mp4 = mediaFiles.find((m) => m.type.includes("mp4")) || mediaFiles[0];

    const skipOffset = linear.getAttribute("skipoffset");
    const duration = linear.querySelector("Duration")?.textContent || null;
    const clickThrough = xml.querySelector("ClickThrough")?.textContent?.trim() || null;
    const impressionUrls = Array.from(xml.querySelectorAll("Impression"))
      .map((i) => (i.textContent || "").trim())
      .filter(Boolean);

    return {
      mediaUrl: mp4.url,
      skipOffsetSec: parseTimeToSec(skipOffset),
      duration: parseTimeToSec(duration),
      clickThrough,
      impressionUrls,
    };
  } catch {
    return null;
  }
}

/** Fire impression pixels (best effort). */
export function fireImpressions(urls: string[]) {
  for (const u of urls) {
    try {
      new Image().src = u;
    } catch {
      /* ignore */
    }
  }
}
