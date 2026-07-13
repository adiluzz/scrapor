import type { Metadata } from "next";
import { getSiteBaseUrl } from "@/lib/seo";
import "./globals.css";

/**
 * Root layout stays brand-neutral. Per-site titles/descriptions come from
 * `(site)/layout` and auth pages via `generateMetadata` + `getCurrentSite()`.
 * `metadataBase` must follow the request Host so relative canonicals / og:url
 * resolve to the correct multi-tenant domain (not PRIMARY_DOMAIN).
 */
export async function generateMetadata(): Promise<Metadata> {
  const base = await getSiteBaseUrl();
  return {
    metadataBase: new URL(base),
    title: {
      default: "Video site",
      template: "%s",
    },
    robots: { index: true, follow: true },
    icons: {
      icon: [
        { url: "/icon", type: "image/png", sizes: "48x48" },
        { url: "/apple-icon", type: "image/png", sizes: "180x180" },
      ],
      apple: { url: "/apple-icon", type: "image/png", sizes: "180x180" },
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-zinc-950 text-zinc-100">
        {children}
      </body>
    </html>
  );
}
