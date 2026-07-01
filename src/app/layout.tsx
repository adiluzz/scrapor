import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scrapor - Video Scraper",
  description: "Penetration testing video scraper",
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
