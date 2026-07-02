import type { Metadata } from "next";
import { headers } from "next/headers";
import { normalizeHost } from "@/lib/site";

/** Core niche terms users search for on Google (piss drinking / watersports tube). */
export const NICHE_KEYWORDS = [
  "piss drinking porn",
  "piss drinking videos",
  "pee drinking porn",
  "golden shower videos",
  "watersports porn",
  "urine fetish",
  "piss swallowing",
  "piss in mouth",
  "piss drinking tube",
  "free piss drinking porn",
  "HD piss drinking",
  "lesbian piss drinking",
  "piss drinking compilation",
  "omorashi",
  "pee fetish",
] as const;

export const SITE_TAGLINE =
  "Free HD piss drinking, golden shower & watersports porn tube";

export function siteHomeTitle(siteName: string): string {
  return `${siteName} — Piss Drinking Porn & Golden Shower Videos`;
}

export function siteHomeDescription(siteName: string): string {
  return (
    `Watch free HD piss drinking porn on ${siteName}. ` +
    "Golden shower, pee drinking, piss swallowing & watersports videos updated daily. " +
    "Stream full-length urine fetish scenes in 720p and 1080p."
  );
}

export function truncateMeta(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export function keywordsMeta(extra: string[] = []): string[] {
  return [...new Set([...NICHE_KEYWORDS, ...extra.map((k) => k.trim()).filter(Boolean)])];
}

/** Resolve absolute site origin for canonical URLs and Open Graph. */
export async function getSiteBaseUrl(): Promise<string> {
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") || h.get("host"));
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export function adultMetadataExtras(): Metadata["other"] {
  return {
    rating: "RTA-5042-1996-1400-1577-RTA",
    "adult-content": "true",
  };
}

export function buildOpenGraph(input: {
  title: string;
  description: string;
  url?: string;
  image?: string | null;
  type?: "website" | "video.other";
}): Metadata["openGraph"] {
  return {
    title: input.title,
    description: truncateMeta(input.description, 200),
    type: input.type ?? "website",
    url: input.url,
    siteName: "Pisster",
    ...(input.image ? { images: [{ url: input.image, alt: input.title }] } : {}),
  };
}

export function tagPageTitle(tagName: string): string {
  return `${tagName} Piss Drinking Porn Videos`;
}

export function tagPageDescription(tagName: string, siteName: string): string {
  return truncateMeta(
    `Watch ${tagName} piss drinking & watersports porn videos on ${siteName}. ` +
      "Free HD golden shower and pee drinking scenes.",
  );
}

export function searchPageTitle(query: string): string {
  return `${query} Piss Drinking Porn Videos`;
}

export function searchPageDescription(query: string, siteName: string): string {
  return truncateMeta(
    `Search results for “${query}” — piss drinking, golden shower & pee fetish videos on ${siteName}.`,
  );
}

export function videoPageDescription(title: string, siteName: string, body?: string | null): string {
  if (body?.trim()) return truncateMeta(body);
  return truncateMeta(
    `Watch ${title} — free HD piss drinking porn on ${siteName}. ` +
      "Golden shower, pee drinking & watersports.",
  );
}

export function pornstarPageDescription(name: string, siteName: string, bio?: string | null): string {
  if (bio?.trim()) return truncateMeta(bio);
  return truncateMeta(
    `${name} piss drinking & watersports porn videos on ${siteName}. ` +
      "Watch golden shower and pee drinking scenes.",
  );
}

/** WebSite + SearchAction for homepage rich results. */
export function websiteJsonLd(baseUrl: string, siteName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: baseUrl,
    description: siteHomeDescription(siteName),
    inLanguage: "en",
    isFamilyFriendly: false,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd(baseUrl: string, siteName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: baseUrl,
    description: SITE_TAGLINE,
  };
}

export function videoObjectJsonLd(input: {
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  uploadDate: string;
  durationIso?: string;
  pageUrl: string;
  viewCount?: number;
  tags?: string[];
  embedUrl?: string;
}) {
  const keywords = keywordsMeta(input.tags ?? []).slice(0, 12).join(", ");
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.title,
    description: input.description || videoPageDescription(input.title, "Pisster"),
    thumbnailUrl: input.thumbnailUrl || undefined,
    uploadDate: input.uploadDate,
    duration: input.durationIso,
    url: input.pageUrl,
    embedUrl: input.embedUrl || input.pageUrl,
    inLanguage: "en",
    isFamilyFriendly: false,
    ...(keywords ? { keywords } : {}),
    ...(input.viewCount != null
      ? {
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: { "@type": "WatchAction" },
            userInteractionCount: input.viewCount,
          },
        }
      : {}),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function itemListJsonLd(input: { name: string; urls: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: input.name,
    numberOfItems: input.urls.length,
    itemListElement: input.urls.map((url, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url,
    })),
  };
}
