import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site";
import { buildOpenGraph, keywordsMeta, pageTitleMeta } from "@/lib/seo";
import StudioFrame from "@/components/studio/StudioFrame";

const CONTACT_EMAIL = "contact@sharlila.com";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") {
    return { title: "Contact" };
  }
  const ogTitle = `Contact · ${site.name}`;
  const description = `Casting, licensing, and collaborations with ${site.name}. ${CONTACT_EMAIL}`;
  return {
    title: pageTitleMeta(ogTitle, site.name),
    description,
    keywords: keywordsMeta(site, ["contact", CONTACT_EMAIL, "casting"]),
    alternates: { canonical: "/contact" },
    openGraph: buildOpenGraph({
      title: ogTitle,
      description,
      url: "/contact",
      siteName: site.name,
    }),
  };
}

export default async function ContactPage() {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") notFound();

  return (
    <StudioFrame>
      <p className="studio-kicker text-brand-300/80">{site.name} Productions</p>
      <h1 className="font-display mt-4 text-5xl text-white sm:text-7xl">Contact</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
        Casting, licensing, press, and collaborations go through the studio — not the tubes.
      </p>
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="mt-10 block font-display text-3xl text-brand-300 hover:text-brand-200 sm:text-4xl"
      >
        {CONTACT_EMAIL}
      </a>
      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        <article className="border border-white/10 bg-white/[0.03] p-6">
          <p className="studio-kicker text-zinc-500">Talent</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Booking house performers or proposing a guest. Include the picture, dates, and
            which roster names you want.
          </p>
        </article>
        <article className="border border-white/10 bg-white/[0.03] p-6">
          <p className="studio-kicker text-zinc-500">Network</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Distribution and licensing across the specialty sites. Start with{" "}
            <Link href="/our-network" className="text-zinc-200 underline-offset-4 hover:underline">
              Our Network
            </Link>
            .
          </p>
        </article>
      </div>
    </StudioFrame>
  );
}
