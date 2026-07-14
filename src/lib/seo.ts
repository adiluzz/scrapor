import type { Metadata } from "next";
import { headers } from "next/headers";
import type { Site } from "@prisma/client";
import { normalizeHost, parseSeoKeywords } from "@/lib/site";

export type SeoSite = Pick<
  Site,
  | "name"
  | "seoTitle"
  | "seoDescription"
  | "seoKeywords"
  | "tagline"
  | "homeH1"
  | "ogImagePath"
  | "seoVideoTitleTpl"
  | "seoVideoDescTpl"
  | "seoPornstarTitleTpl"
  | "seoPornstarDescTpl"
  | "seoTagTitleTpl"
  | "seoTagDescTpl"
  | "seoCreatorTitleTpl"
  | "seoCreatorDescTpl"
  | "seoTagsIndexTitle"
  | "seoTagsIndexDesc"
  | "seoPornstarsIndexTitle"
  | "seoPornstarsIndexDesc"
  | "seoCreatorsIndexTitle"
  | "seoCreatorsIndexDesc"
>;

/**
 * Title for `metadata.title` under the site layout's `%s · SiteName` template.
 * When the rendered title already mentions the site name (e.g. a DB template
 * ending in "| Pisster"), return it as absolute so the layout template does
 * not append the site name a second time ("… | Pisster · Pisster").
 */
export function pageTitleMeta(
  title: string,
  siteName: string
): string | { absolute: string } {
  if (title.toLowerCase().includes(siteName.toLowerCase())) {
    return { absolute: title };
  }
  return title;
}

export function truncateMeta(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Niche phrase from homeH1 without a trailing "Videos". */
export function siteNiche(site: Pick<Site, "name" | "homeH1">): string {
  return site.homeH1?.replace(/\s+Videos$/i, "").trim() || site.name;
}

type TemplateVars = {
  title?: string;
  name?: string;
  site?: string;
  tagline?: string;
  niche?: string;
  query?: string;
  tags?: string;
  duration?: string;
  description?: string;
};

/** Replace `{placeholder}` tokens; unknown tokens left as-is. */
export function applySeoTemplate(tpl: string, vars: TemplateVars): string {
  return tpl.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => {
    const v = vars[key as keyof TemplateVars];
    return v != null && String(v).length > 0 ? String(v) : "";
  }).replace(/\s{2,}/g, " ").trim();
}

function siteVars(site: Pick<Site, "name" | "tagline" | "homeH1">): TemplateVars {
  return {
    site: site.name,
    tagline: site.tagline || "",
    niche: siteNiche(site),
  };
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

export function tagPageTitle(tagName: string, site: SeoSite): string {
  const tpl = site.seoTagTitleTpl?.trim();
  if (tpl) {
    return applySeoTemplate(tpl, { ...siteVars(site), name: tagName });
  }
  return `${tagName} ${siteNiche(site)} Videos`;
}

export function tagPageDescription(tagName: string, site: SeoSite): string {
  const tpl = site.seoTagDescTpl?.trim();
  if (tpl) {
    return truncateMeta(applySeoTemplate(tpl, { ...siteVars(site), name: tagName }));
  }
  return truncateMeta(
    `Watch ${tagName} videos on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

export function tagsIndexTitle(site: SeoSite): string {
  return site.seoTagsIndexTitle?.trim() || `Tags · ${site.name}`;
}

export function tagsIndexDescription(site: SeoSite): string {
  return (
    site.seoTagsIndexDesc?.trim() ||
    truncateMeta(`Browse tags on ${site.name}. ${siteHomeDescription(site).split(".")[0]}.`)
  );
}

/** Avoid "query Niche" when niche already contains the query (e.g. FBB homeH1). */
export function searchPageTitle(query: string, site: Pick<Site, "name" | "homeH1">): string {
  const niche = siteNiche(site);
  const q = query.trim();
  if (!q) return `Search · ${site.name}`;
  if (niche.toLowerCase().includes(q.toLowerCase())) {
    return `${niche} Videos`;
  }
  return `${q} ${niche} Videos`;
}

export function searchPageDescription(
  query: string,
  site: Pick<Site, "name" | "tagline">
): string {
  return truncateMeta(
    `Search results for “${query}” on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

export function videoPageTitle(title: string, site: SeoSite): string {
  const tpl = site.seoVideoTitleTpl?.trim();
  if (tpl) {
    return applySeoTemplate(tpl, { ...siteVars(site), title });
  }
  return title;
}

export function videoPageDescription(
  title: string,
  site: SeoSite,
  body?: string | null,
  extras?: { tags?: string; duration?: string }
): string {
  if (body?.trim()) return truncateMeta(body);
  const tpl = site.seoVideoDescTpl?.trim();
  if (tpl) {
    const rendered = applySeoTemplate(tpl, {
      ...siteVars(site),
      title,
      description: "",
      tags: extras?.tags || "",
      duration: extras?.duration || "",
    });
    if (rendered) return truncateMeta(rendered);
  }
  return truncateMeta(
    `Watch ${title} on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

export function pornstarPageTitle(name: string, site: SeoSite): string {
  const tpl = site.seoPornstarTitleTpl?.trim();
  if (tpl) {
    return applySeoTemplate(tpl, { ...siteVars(site), name });
  }
  return `${name} Videos`;
}

export function pornstarPageDescription(
  name: string,
  site: SeoSite,
  bio?: string | null
): string {
  const tpl = site.seoPornstarDescTpl?.trim();
  if (tpl) {
    const rendered = applySeoTemplate(tpl, {
      ...siteVars(site),
      name,
      description: bio?.trim() || "",
    });
    if (rendered) return truncateMeta(rendered);
  }
  if (bio?.trim()) return truncateMeta(bio);
  return truncateMeta(
    `${name} videos on ${site.name}. ${site.tagline || ""}`.trim(),
  );
}

export function pornstarsIndexTitle(site: SeoSite): string {
  return site.seoPornstarsIndexTitle?.trim() || `Pornstars · ${site.name}`;
}

export function pornstarsIndexDescription(site: SeoSite): string {
  return (
    site.seoPornstarsIndexDesc?.trim() ||
    truncateMeta(`Browse pornstars on ${site.name}. ${siteHomeDescription(site).split(".")[0]}.`)
  );
}

export function creatorPageTitle(name: string, site: SeoSite): string {
  const tpl = site.seoCreatorTitleTpl?.trim();
  if (tpl) {
    return applySeoTemplate(tpl, { ...siteVars(site), name });
  }
  return `${name} Videos`;
}

export function creatorPageDescription(
  name: string,
  site: SeoSite,
  bio?: string | null
): string {
  const tpl = site.seoCreatorDescTpl?.trim();
  if (tpl) {
    const rendered = applySeoTemplate(tpl, {
      ...siteVars(site),
      name,
      description: bio?.trim() || "",
    });
    if (rendered) return truncateMeta(rendered);
  }
  return pornstarPageDescription(name, site, bio);
}

export function creatorsIndexTitle(site: SeoSite): string {
  return site.seoCreatorsIndexTitle?.trim() || `Creators · ${site.name}`;
}

export function creatorsIndexDescription(site: SeoSite): string {
  return (
    site.seoCreatorsIndexDesc?.trim() ||
    truncateMeta(`Browse creators on ${site.name}.`)
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
