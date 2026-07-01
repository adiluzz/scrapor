import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import type { Site } from "@prisma/client";

const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || "pisster.com";
const ADMIN_SUBDOMAIN = process.env.ADMIN_SUBDOMAIN || "admin";

const cache = new Map<string, { site: Site; at: number }>();
const TTL_MS = 60_000;

/** Strip port + a leading `admin.` from a host header to get the site domain. */
export function normalizeHost(host: string | null | undefined): string {
  let h = (host || PRIMARY_DOMAIN).toLowerCase().split(":")[0].trim();
  if (h.startsWith(`${ADMIN_SUBDOMAIN}.`)) h = h.slice(ADMIN_SUBDOMAIN.length + 1);
  // treat localhost/127.0.0.1 as the primary domain in dev
  if (h === "localhost" || h === "127.0.0.1" || h === "") h = PRIMARY_DOMAIN;
  return h;
}

export function isAdminHost(host: string | null | undefined): boolean {
  const h = (host || "").toLowerCase().split(":")[0];
  return h.startsWith(`${ADMIN_SUBDOMAIN}.`);
}

/**
 * Resolve (and lazily create) the Site for a given domain. Cached briefly so
 * every request doesn't hit the DB.
 */
export async function getSiteByDomain(domain: string): Promise<Site> {
  const key = normalizeHost(domain);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.site;

  let site = await prisma.site.findUnique({ where: { domain: key } });
  if (!site) {
    // Fall back to the primary domain's site; create it if it's the very first boot.
    site =
      (await prisma.site.findUnique({ where: { domain: PRIMARY_DOMAIN } })) ??
      (await prisma.site.upsert({
        where: { domain: PRIMARY_DOMAIN },
        update: {},
        create: { domain: PRIMARY_DOMAIN, name: "Pisster" },
      }));
  }
  cache.set(key, { site, at: Date.now() });
  return site;
}

/** Resolve the current request's Site from the Host header (server components/routes). */
export async function getCurrentSite(): Promise<Site> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  return getSiteByDomain(host || PRIMARY_DOMAIN);
}

/** Convenience: just the id. */
export async function getCurrentSiteId(): Promise<string> {
  return (await getCurrentSite()).id;
}

/** Ensure the primary site exists (used by seeds/workers). */
export async function ensureDefaultSite(): Promise<Site> {
  return prisma.site.upsert({
    where: { domain: PRIMARY_DOMAIN },
    update: {},
    create: { domain: PRIMARY_DOMAIN, name: "Pisster" },
  });
}
