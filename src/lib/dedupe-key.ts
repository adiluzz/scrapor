/** Tracking query params stripped when building a generic dedupe key (mirrors worker/db.py). */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "referrer",
]);

/**
 * Stable per-video identity for dedup — mirrors worker/db.py canonical_key().
 * Used when comparing scrape candidates to catalog rows.
 */
export function dedupeKey(url: string): string {
  if (!url) return "";
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "";
  }

  let host = (parsed.hostname || "").toLowerCase().split("@").pop()?.split(":")[0] ?? "";
  host = host.replace(/^(?:www\d*|m|mobile|[a-z]{2})\./, "");
  const path = parsed.pathname || "/";
  const q = Object.fromEntries(parsed.searchParams.entries());

  if (host.includes("pornhub") && q.viewkey) return `pornhub:${q.viewkey}`;
  {
    const m = path.match(/\/watch\/(\d+)/);
    if (host.includes("youporn") && m) return `youporn:${m[1]}`;
  }
  {
    const m = path.match(/\/(\d+)/);
    if (host.includes("redtube") && m) return `redtube:${m[1]}`;
  }
  {
    const m = path.match(/\/video\.?([a-z0-9]+)/i);
    if (host.includes("xvideos") && m) return `xvideos:${m[1].toLowerCase()}`;
  }
  {
    const m = path.match(/\/video-?([a-z0-9]+)/i);
    if (host.includes("xnxx") && m) return `xnxx:${m[1].toLowerCase()}`;
  }
  {
    const m = path.match(/\/video-([a-z0-9]+)/i);
    if (host.includes("eporner") && m) return `eporner:${m[1].toLowerCase()}`;
  }
  {
    const m = path.match(/-(\d{4,})\/?$/) || path.match(/\/videos\/(\d+)/);
    if (host.includes("xhamster") && m) return `xhamster:${m[1]}`;
  }
  {
    const m = path.match(/^\/([a-z0-9]+)\/(?:video|play)\//i);
    if (host.includes("spankbang") && m) return `spankbang:${m[1].toLowerCase()}`;
  }
  if (host.includes("paradisehill")) {
    const hex = path.match(/^\/([0-9a-f]{10,})\/?$/i);
    if (hex) return `paradisehill:${hex[1].toLowerCase()}`;
    const slug = path.match(/^\/([^/?#]+)\/?$/);
    if (
      slug &&
      !/^(?:search|actor|actors|category|categories|porn|studios|news|help|upload|login|signup|order|for-advertisers|about|terms|confidentiality|dmca)$/i.test(
        slug[1]
      )
    ) {
      return `paradisehill:${slug[1].toLowerCase()}`;
    }
  }
  {
    const m = path.match(/\/(\d+)\/?$/);
    if (host.includes("pornone") && m) return `pornone:${m[1]}`;
  }
  {
    const m = path.match(/\/video\/(\d+)/);
    if (host.includes("abxxx") && m) return `abxxx:${m[1]}`;
  }

  const keep = Object.entries(q)
    .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const normPath = path.replace(/\/$/, "") || "/";
  const query = new URLSearchParams(keep).toString();
  const base = `${host}${normPath}`;
  return query ? `${base}?${query}` : base;
}
