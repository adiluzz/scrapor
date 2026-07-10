export interface ScrapedVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: string;
  channel?: string;
  views?: string;
}

export interface VideoDetail {
  slug: string;
  title: string;
  url: string;
  thumbnail?: string;
  duration?: string;
  description?: string;
  tags: string[];
  categories?: string[];
  pornstars: string[];
}
