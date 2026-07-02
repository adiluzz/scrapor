import type { Metadata } from "next";
import "./globals.css";

const primaryDomain = process.env.PRIMARY_DOMAIN || "pisster.com";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${primaryDomain}`),
  title: {
    default: "Pisster — Piss Drinking Porn Tube",
    template: "%s · Pisster",
  },
  description:
    "Free HD piss drinking porn, golden shower & watersports videos. Pee drinking, piss swallowing & urine fetish tube updated daily.",
  robots: { index: true, follow: true },
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
