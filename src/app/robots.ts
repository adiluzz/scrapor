import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { normalizeHost } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") || h.get("host"));
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/api", "/search", "/login", "/signup"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
