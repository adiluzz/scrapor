import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StudioContactForm from "@/components/studio/StudioContactForm";
import StudioFrame from "@/components/studio/StudioFrame";
import { siteContactEmail } from "@/lib/legal-contact";
import { buildOpenGraph, keywordsMeta, pageTitleMeta } from "@/lib/seo";
import { getCurrentSite } from "@/lib/site";
import { STUDIO_TUBES, parseStudioInquiryIntent } from "@/lib/studio-copy";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") {
    return { title: "Contact" };
  }
  const contactEmail = siteContactEmail(site.domain);
  const ogTitle = `Contact · ${site.name}`;
  const description = `Book an in-person collaboration or open a creator storefront with ${site.name}. ${contactEmail}`;
  return {
    title: pageTitleMeta(ogTitle, site.name),
    description,
    keywords: keywordsMeta(site, ["contact", contactEmail, "collaboration", "creator storefront"]),
    alternates: { canonical: "/contact" },
    openGraph: buildOpenGraph({
      title: ogTitle,
      description,
      url: "/contact",
      siteName: site.name,
    }),
  };
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") notFound();
  const sp = await searchParams;
  const contactEmail = siteContactEmail(site.domain);
  const intent = parseStudioInquiryIntent(sp.intent);

  return (
    <StudioFrame>
      <p className="studio-kicker text-brand-300/80">{site.name} Productions</p>
      <h1 className="font-display mt-4 text-5xl text-white sm:text-7xl">Contact</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
        In-person collaborations and creator storefronts go through the studio. We read every
        message sent to this address.
      </p>
      <a
        href={`mailto:${contactEmail}`}
        className="mt-10 block font-display text-3xl text-brand-300 hover:text-brand-200 sm:text-4xl"
      >
        {contactEmail}
      </a>

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        <article className="border border-white/10 bg-white/[0.03] p-6">
          <p className="studio-kicker text-zinc-500">On set</p>
          <h2 className="font-display mt-3 text-2xl text-white">In-Person Collaborations</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Co-produced scenes, shared footage rights, professional lighting, and fast scheduling
            for Las Vegas AVN Week Jan 2027 &amp; European dates.
          </p>
        </article>
        <article className="border border-white/10 bg-white/[0.03] p-6">
          <p className="studio-kicker text-zinc-500">Online</p>
          <h2 className="font-display mt-3 text-2xl text-white">Creator Storefronts (85% Payout)</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Monetize existing FBB, fitness, or fetish clips on our targeted niche tubes with Paxum,
            USDT/USDC, or SEPA payouts. Distribution runs on{" "}
            {STUDIO_TUBES.map((tube, index) => (
              <span key={tube.domain}>
                {index > 0 ? " and " : null}
                <a
                  href={tube.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-200 underline underline-offset-4 hover:text-white"
                >
                  {tube.domain}
                </a>
              </span>
            ))}
            .
          </p>
        </article>
      </div>

      <div className="mt-10">
        <StudioContactForm contactEmail={contactEmail} initialIntent={intent} />
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        Looking for the tubes?{" "}
        <Link href="/our-network" className="text-zinc-300 underline-offset-4 hover:underline">
          Explore Our Network
        </Link>
        .
      </p>
    </StudioFrame>
  );
}
