import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import type { Site } from "@prisma/client";

/** Platform domain that hosts admin (admin.${ADMIN_BASE_DOMAIN}). */
export const ADMIN_BASE_DOMAIN = process.env.ADMIN_BASE_DOMAIN || "sharlila.com";
const ADMIN_SUBDOMAIN = process.env.ADMIN_SUBDOMAIN || "admin";
/** Legacy fallback when creating the first site only. */
export const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || "pisster.com";

const cache = new Map<string, { site: Site; at: number }>();
const networkCache = { sites: null as Site[] | null, at: 0 };
const TTL_MS = 60_000;

export function parseSeoKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((k) => String(k).trim()).filter(Boolean);
    }
  } catch {
    /* fall through */
  }
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Strip port from a host header. */
export function stripPort(host: string | null | undefined): string {
  return (host || "").toLowerCase().split(":")[0].trim();
}

/**
 * Public site domain from Host. Strips www. Does NOT strip admin. —
 * admin is a separate host on ADMIN_BASE_DOMAIN.
 */
export function normalizeHost(host: string | null | undefined): string {
  let h = stripPort(host);
  if (h.startsWith("www.")) h = h.slice(4);
  if (h === "localhost" || h === "127.0.0.1" || h === "") h = PRIMARY_DOMAIN;
  return h;
}

export function isAdminHost(host: string | null | undefined): boolean {
  const h = stripPort(host);
  return h === `${ADMIN_SUBDOMAIN}.${ADMIN_BASE_DOMAIN}`;
}

export function adminHost(): string {
  return `${ADMIN_SUBDOMAIN}.${ADMIN_BASE_DOMAIN}`;
}

/**
 * Resolve Site for a public domain. Unknown hosts throw (no silent Pisster fallthrough).
 * Admin host is not a public Site — use getAdminPlatformSite() for platform admin context.
 */
export async function getSiteByDomain(domain: string): Promise<Site> {
  const key = normalizeHost(domain);
  if (isAdminHost(key) || key === `${ADMIN_SUBDOMAIN}.${key}`) {
    // admin.sharlila.com → not a public catalog host
  }
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.site;

  let site = await prisma.site.findUnique({ where: { domain: key } });
  if (!site && key === PRIMARY_DOMAIN) {
    site = await ensureDefaultSite();
  }
  if (!site) {
    throw new Error(`Unknown site domain: ${key}`);
  }
  cache.set(key, { site, at: Date.now() });
  return site;
}

/** Resolve site for Host; on admin host, returns Sharlila (platform) site. */
export async function getCurrentSite(): Promise<Site> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || PRIMARY_DOMAIN;
  if (isAdminHost(host)) {
    return getAdminPlatformSite();
  }
  return getSiteByDomain(host);
}

export async function getAdminPlatformSite(): Promise<Site> {
  const hit = cache.get(ADMIN_BASE_DOMAIN);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.site;
  let site = await prisma.site.findUnique({ where: { domain: ADMIN_BASE_DOMAIN } });
  if (!site) {
    site = await prisma.site.upsert({
      where: { domain: ADMIN_BASE_DOMAIN },
      update: {},
      create: {
        domain: ADMIN_BASE_DOMAIN,
        name: "Sharlila",
        kind: "STUDIO",
        slug: "sharlila",
        primaryColor: "#C4A574",
        logoKey: "sharlila-mark",
        logoPath: "/brand/sharlila-lockup.png",
        mailFromName: "Sharlila",
        networkOrder: 2,
        isNetworkMember: true,
      },
    });
  }
  cache.set(ADMIN_BASE_DOMAIN, { site, at: Date.now() });
  return site;
}

export async function getCurrentSiteId(): Promise<string> {
  return (await getCurrentSite()).id;
}

export async function getSiteIdForAuth(
  auth?: { siteId: string } | null
): Promise<string> {
  if (auth?.siteId) return auth.siteId;
  return getCurrentSiteId();
}

/** Network members for Our Network page (cached briefly). */
export async function listNetworkSites(): Promise<Site[]> {
  if (networkCache.sites && Date.now() - networkCache.at < TTL_MS) {
    return networkCache.sites;
  }
  const sites = await prisma.site.findMany({
    where: { isNetworkMember: true },
    orderBy: [{ networkOrder: "asc" }, { name: "asc" }],
  });
  networkCache.sites = sites;
  networkCache.at = Date.now();
  return sites;
}

export async function listTubeSites(): Promise<Site[]> {
  return prisma.site.findMany({
    where: { kind: "TUBE" },
    orderBy: [{ networkOrder: "asc" }, { name: "asc" }],
  });
}

export async function listAllSites(): Promise<Site[]> {
  return prisma.site.findMany({
    orderBy: [{ networkOrder: "asc" }, { name: "asc" }],
  });
}

export function invalidateSiteCache() {
  cache.clear();
  networkCache.sites = null;
  networkCache.at = 0;
}

/** Ensure Pisster exists (seeds/workers). Prefer seed.mjs for full network. */
export async function ensureDefaultSite(): Promise<Site> {
  return prisma.site.upsert({
    where: { domain: PRIMARY_DOMAIN },
    update: {},
    create: {
      domain: PRIMARY_DOMAIN,
      name: "Pisster",
      kind: "TUBE",
      slug: "pisster",
      primaryColor: "#D4AF37",
      logoKey: "golden-drop",
      logoPath: "/brand/pisster-lockup.png",
      mailFromName: "Pisster",
      tagline: "Free HD piss drinking, golden shower & watersports porn tube",
      seoTitle: "Pisster — Piss Drinking Porn & Golden Shower Videos",
      homeH1: "Piss Drinking Porn Videos",
      exoInsClass: "eas6a97888e2",
    },
  });
}
