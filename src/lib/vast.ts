export const VAST_TRACKING_EVENTS = [
  "start",
  "firstQuartile",
  "midpoint",
  "thirdQuartile",
  "complete",
  "skip",
  "error",
] as const;

export type VastTrackingEvent = (typeof VAST_TRACKING_EVENTS)[number];
export type VastTracking = Record<VastTrackingEvent, string[]>;

export function emptyVastTracking(): VastTracking {
  return {
    start: [],
    firstQuartile: [],
    midpoint: [],
    thirdQuartile: [],
    complete: [],
    skip: [],
    error: [],
  };
}

export type VastAd = {
  mediaUrl: string;
  skipOffsetSec: number | null;
  duration: number | null;
  clickThrough: string | null;
  clickTracking: string[];
  impressionUrls: string[];
  tracking: VastTracking;
};

export type VastFetchOptions = {
  clientIp?: string;
  referer?: string;
  userAgent?: string;
  timeoutMs?: number;
  maxDepth?: number;
  /**
   * Fetch from the page itself. The browser sets IP, User-Agent, and Referer;
   * those headers are forbidden to set from script and a server-supplied
   * User-Agent would make the ad network see a bot.
   */
  browser?: boolean;
};

function parseTimeToSec(t: string | null | undefined): number | null {
  if (!t) return null;
  const s = t.trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const hms = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/);
  if (hms) {
    const h = hms[1] ? parseInt(hms[1], 10) : 0;
    return h * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }
  const pct = s.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) return null; // percentage skip — caller falls back to configured skip
  return null;
}

function tagText(xml: string, tag: string): string | null {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"));
  if (cdata?.[1]) return cdata[1].trim();
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
  return plain?.[1]?.trim() || null;
}

function tagTexts(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]+))</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const val = (m[1] || m[2] || "").trim();
    if (val) out.push(val);
  }
  return out;
}

function block(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "i"));
  return m?.[0] || null;
}

function collectTracking(xml: string): VastTracking {
  const out = emptyVastTracking();
  const re = /<Tracking\b([^>]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/Tracking>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const event = m[1].match(/\bevent="([^"]+)"/i)?.[1];
    const url = (m[2] || m[3] || "").trim();
    if (!url || !event || !(event in out)) continue;
    out[event as VastTrackingEvent].push(url);
  }
  return out;
}

function mergeTracking(into: VastTracking, extra: VastTracking) {
  for (const event of VAST_TRACKING_EVENTS) into[event].push(...extra[event]);
}

type ParsedVast = {
  ad: VastAd | null;
  wrapperUrl: string | null;
  impressionUrls: string[];
  clickTracking: string[];
  tracking: VastTracking;
};

/** Parse one VAST XML document (inline or wrapper). Works in Node and browser. */
export function parseVastXml(xml: string): ParsedVast {
  const impressionUrls = tagTexts(xml, "Impression");
  const clickTracking = tagTexts(xml, "ClickTracking");
  const tracking = collectTracking(xml);
  const wrapperUrl = tagText(xml, "VASTAdTagURI");
  if (wrapperUrl) {
    return { ad: null, wrapperUrl, impressionUrls, clickTracking, tracking };
  }

  const linear = block(xml, "Linear");
  if (!linear) {
    return { ad: null, wrapperUrl: null, impressionUrls, clickTracking, tracking };
  }

  const mediaFiles: { url: string; type: string; bitrate: number }[] = [];
  const mfRe = /<MediaFile([^>]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/MediaFile>/gi;
  let m: RegExpExecArray | null;
  while ((m = mfRe.exec(linear))) {
    const attrs = m[1] || "";
    const url = (m[2] || m[3] || "").trim();
    if (!url) continue;
    const type = attrs.match(/\btype="([^"]+)"/i)?.[1] || "";
    const bitrate = parseInt(attrs.match(/\bbitrate="(\d+)"/i)?.[1] || "0", 10);
    mediaFiles.push({ url, type, bitrate });
  }
  if (mediaFiles.length === 0) {
    return { ad: null, wrapperUrl: null, impressionUrls, clickTracking, tracking };
  }

  const pick =
    mediaFiles.find((f) => f.type.includes("mp4")) ||
    mediaFiles.find((f) => f.type.includes("webm")) ||
    [...mediaFiles].sort((a, b) => b.bitrate - a.bitrate)[0];

  const skipRaw = linear.match(/\bskipoffset="([^"]+)"/i)?.[1] || null;
  const durationRaw = tagText(linear, "Duration");

  return {
    ad: {
      mediaUrl: pick.url,
      skipOffsetSec: parseTimeToSec(skipRaw),
      duration: parseTimeToSec(durationRaw),
      clickThrough: tagText(xml, "ClickThrough"),
      clickTracking,
      impressionUrls,
      tracking,
    },
    wrapperUrl: null,
    impressionUrls,
    clickTracking,
    tracking,
  };
}

function hasVastPayload(xml: string): boolean {
  return /<Ad\b/i.test(xml) || /<Wrapper\b/i.test(xml) || /<Linear\b/i.test(xml);
}

/** Fetch a VAST tag, follow Wrapper chains, return a playable ad or null. */
export async function resolveVastAd(
  tagUrl: string,
  opts: VastFetchOptions = {}
): Promise<VastAd | null> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxDepth = opts.maxDepth ?? 5;
  let url = tagUrl;
  const collectedImpressions: string[] = [];
  const collectedClicks: string[] = [];
  const collectedTracking = emptyVastTracking();

  for (let depth = 0; depth < maxDepth; depth++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: "application/xml,text/xml,*/*",
      };
      if (!opts.browser) {
        headers["User-Agent"] = opts.userAgent || "Mozilla/5.0 (compatible; Pisster/1.0)";
        if (opts.referer) headers.Referer = opts.referer;
        if (opts.clientIp) headers["X-Forwarded-For"] = opts.clientIp;
      }

      const res = await fetch(url, { signal: controller.signal, headers, cache: "no-store" });
      clearTimeout(timer);
      if (!res.ok) return null;

      const xml = await res.text();
      if (!hasVastPayload(xml)) return null;

      const parsed = parseVastXml(xml);
      collectedImpressions.push(...parsed.impressionUrls);
      collectedClicks.push(...parsed.clickTracking);
      mergeTracking(collectedTracking, parsed.tracking);

      if (parsed.wrapperUrl) {
        url = parsed.wrapperUrl;
        continue;
      }
      if (!parsed.ad) return null;

      parsed.ad.impressionUrls = [...new Set(collectedImpressions)];
      parsed.ad.clickTracking = [...new Set(collectedClicks)];
      parsed.ad.tracking = collectedTracking;
      return parsed.ad;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }
  return null;
}

/** @deprecated Prefer POST /api/videos/[id]/vast — kept for tests. */
export async function fetchVastAd(tagUrl: string, timeoutMs = 4000): Promise<VastAd | null> {
  return resolveVastAd(tagUrl, { timeoutMs });
}

/** Fire impression or tracking pixels (best effort). */
export function fireImpressions(urls: string[], macros?: Record<string, string>) {
  for (const raw of urls) {
    let u = raw;
    if (macros) {
      for (const [key, value] of Object.entries(macros)) u = u.split(key).join(value);
    }
    try {
      new Image().src = u;
    } catch {
      /* ignore */
    }
  }
}
