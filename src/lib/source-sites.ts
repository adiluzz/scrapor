/**
 * Adult source sites supported by the scraper (subset of yt-dlp's porn-capable
 * extractors that have dedicated Python APIs / reliable search). The admin UI
 * renders these as checkboxes when creating a scrape run.
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
] as const;

export type SourceSite = (typeof SOURCE_SITES)[number];

export function isSourceSite(v: string): v is SourceSite {
  return (SOURCE_SITES as readonly string[]).includes(v);
}
