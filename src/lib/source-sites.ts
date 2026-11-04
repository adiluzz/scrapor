/**
 * Adult source sites supported by the scraper. Downloads use yt-dlp when the
 * site has an extractor; Xozilla and PissHamster (and a few others) use a
 * custom HTML searcher in scripts/site_searchers.py because yt-dlp has no
 * extractor for them.
 * The admin UI renders these as checkboxes when creating a scrape run.
 */
export const SOURCE_SITES = [
  "PornHub",
  "XVideos",
  "XHamster",
  "XNXX",
  "YouPorn",
  "Eporner",
  "HQPorner",
  "RedTube",
  "SpankBang",
  "ParadiseHill",
  "PornOne",
  "ABXXX",
  "Xozilla",
  "PissHamster",
] as const;

export type SourceSite = (typeof SOURCE_SITES)[number];

export function isSourceSite(v: string): v is SourceSite {
  return (SOURCE_SITES as readonly string[]).includes(v);
}
