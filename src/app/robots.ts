import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "pisster.com";
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/api"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
