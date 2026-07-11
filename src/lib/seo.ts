import type { Metadata } from "next";
import { headers } from "next/headers";
import type { Site } from "@prisma/client";
import { normalizeHost, parseSeoKeywords } from "@/lib/site";

export function truncateMeta(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export function siteHomeTitle(site: Pick<Site, "name" | "seoTitle">): string {
  return site.seoTitle?.trim() || `${site.name}`;
}

export function siteHomeDescription(
  site: Pick<Site, "name" | "seoDescription" | "tagline">
): string {
  return (
    site.seoDescription?.trim() ||
    site.tagline?.trim() ||
    `Watch videos on ${site.name}.`
  );
}

export function keywordsMeta(site: Pick<Site, "seoKeywords">, extra: string[] = []): string[] {
  const base = parseSeoKeywords(site.seoKeywords);
  return [...new Set([...base, ...extra.map((k) => k.trim()).filter(Boolean)])];
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
  siteName: string;
}): Metadata["openGraph"] {
  return {
    title: input.title,
    description: truncateMeta(input.description, 200),
    type: input.type ?? "website",
    url: input.url,
    siteName: input.siteName,
    ...(input.image ? { images: [{ url: input.image, alt: input.title }] } : {}),
  };
}

export function tagPageTitle(tagName: string, site: Pick<Site, "name" | "homeH1">): string {
  const niche = site.homeH1?.replace(/\s+Videos$/i, "") || site.name;
  return `${tagName} ${niche} Videos`;
}

export function tagPageDescription(
  tagName: string,
  site: Pick<Site, "name" | "tagline">
): string {
  return truncateMeta(
    `Watch ${tagName} videos on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

export function searchPageTitle(query: string, site: Pick<Site, "name" | "homeH1">): string {
  const niche = site.homeH1?.replace(/\s+Videos$/i, "") || site.name;
  return `${query} ${niche} Videos`;
}

export function searchPageDescription(
  query: string,
  site: Pick<Site, "name" | "tagline">
): string {
  return truncateMeta(
    `Search results for “${query}” on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

export function videoPageDescription(
  title: string,
  site: Pick<Site, "name" | "tagline">,
  body?: string | null
): string {
  if (body?.trim()) return truncateMeta(body);
  return truncateMeta(
    `Watch ${title} on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

export function pornstarPageDescription(
  name: string,
  site: Pick<Site, "name" | "tagline">,
  bio?: string | null
): string {
  if (bio?.trim()) return truncateMeta(bio);
  return truncateMeta(
    `${name} videos on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

/** WebSite + SearchAction for homepage rich results. */
export function websiteJsonLd(baseUrl: string, site: Pick<Site, "name" | "seoDescription" | "tagline">) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: baseUrl,
    description: siteHomeDescription(site),
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

export function organizationJsonLd(
  baseUrl: string,
  site: Pick<Site, "name" | "tagline" | "seoDescription" | "ogImagePath">
) {
  const logoUrl = `${baseUrl}${site.ogImagePath || "/apple-icon"}`;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: baseUrl,
    logo: {
      "@type": "ImageObject",
      url: logoUrl,
      width: 180,
      height: 180,
    },
    description: site.tagline || site.seoDescription || site.name,
  };
}

export function videoObjectJsonLd(input: {
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  contentUrl?: string | null;
  uploadDate: string;
  durationIso?: string;
  pageUrl: string;
  viewCount?: number;
  tags?: string[];
  embedUrl?: string;
  siteName: string;
  siteKeywords?: string[];
}) {
  const keywords = [...new Set([...(input.siteKeywords ?? []), ...(input.tags ?? [])])]
    .slice(0, 12)
    .join(", ");
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.title,
    description:
      input.description ||
      `Watch ${input.title} on ${input.siteName}.`,
    thumbnailUrl: input.thumbnailUrl || undefined,
    contentUrl: input.contentUrl || undefined,
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
