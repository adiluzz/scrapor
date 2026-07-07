/** A source-site video candidate shown in the interactive scrape picker. */
export type ScrapeCandidate = {
  url: string;
  title: string;
  thumbnail: string;
  durationSec: number | null;
  durationLabel: string;
  sourceSite: string;
  inCatalog: boolean;
  description?: string;
  tags?: string[];
  pornstars?: string[];
  _m3u8_base_url?: string | null;
  _cdn_url?: string | null;
  _part_urls?: string[] | null;
};

export type ScrapeSearchResult = {
  videos: ScrapeCandidate[];
  cursors: Record<string, number | string>;
  hasMore: boolean;
};
