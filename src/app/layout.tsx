import type { Metadata } from "next";
import "./globals.css";

/**
 * Root layout stays brand-neutral. Per-site titles/descriptions come from
 * `(site)/layout` and auth pages via `generateMetadata` + `getCurrentSite()`.
 * `metadataBase` is only a fallback for absolute URLs when a page does not
 * set its own; site pages use `getSiteBaseUrl()`.
 */
const primaryDomain = process.env.PRIMARY_DOMAIN || "localhost";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${primaryDomain}`),
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
