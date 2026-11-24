import Image from "next/image";
import Link from "next/link";
import type { Site } from "@prisma/client";
import JsonLd from "@/components/site/JsonLd";
import StudioTalentCard from "@/components/studio/StudioTalentCard";
import { siteContactEmail } from "@/lib/legal-contact";
import type { StudioStar } from "@/lib/studio-talent";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { STUDIO_HEADLINE, STUDIO_SUBCOPY, STUDIO_TUBES } from "@/lib/studio-copy";

const tubeLinkClass = "text-zinc-200 underline decoration-white/20 underline-offset-4 hover:text-white";

const CRAFT = [
  {
    label: "01",
    title: "Collaboration",
    body: "We partner with independent performers and fitness/fetish creators. Transparent terms, split footage rights, and full PASS/TTS testing and 2257 compliance on every set.",
  },
  {
    label: "02",
    title: "Direction",
    body: "Long lenses, practical champagne lighting, and unhurried takes. Every frame is shot to look like an editorial still.",
  },
  {
    label: "03",
    title: "Network & Creator Stores",
    body: null,
  },
];

export default function StudioHome({
  site,
  base,
  featured,
}: {
  site: Site;
  base: string;
  featured: StudioStar[];
}) {
  const contactEmail = siteContactEmail(site.domain);

  return (
    <>
      <JsonLd data={websiteJsonLd(base, site, { includeSearch: false })} />
      <JsonLd data={organizationJsonLd(base, site)} />

      <section className="relative isolate min-h-[92vh] overflow-hidden">
        <Image
          src="/studio/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="studio-grain pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/25" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#070605] to-transparent" />
        <div className="relative mx-auto flex min-h-[92vh] w-full max-w-7xl flex-col justify-end px-5 pb-16 pt-28 sm:px-8 sm:pb-24 lg:px-12">
          <p className="studio-kicker text-brand-300/90">The house</p>
          <h1 className="font-display mt-5 max-w-5xl text-4xl font-medium leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
            {STUDIO_HEADLINE}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            {STUDIO_SUBCOPY}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/contact?intent=collab" className="studio-cta px-7 py-3 text-[11px]">
              Book a Collab
            </Link>
            <Link href="/our-network" className="studio-ghost px-7 py-3 text-[11px]">
              Explore Our Network
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="studio-kicker text-brand-300/80">The company</p>
            <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">Talent</h2>
          </div>
          <Link href="/team" className="studio-kicker text-zinc-300 hover:text-white">
            Full roster →
          </Link>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((star, index) => (
            <li key={star.slug}>
              <StudioTalentCard star={star} priority={index < 3} />
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-white/5 bg-black/30">
        <div className="mx-auto grid max-w-7xl gap-px bg-white/5 px-0 sm:grid-cols-3">
          {CRAFT.map((item) => (
            <article key={item.title} className="bg-[#070605] px-6 py-12 sm:px-8 lg:px-10">
              <p className="studio-kicker text-brand-300/70">{item.label}</p>
              <h3 className="font-display mt-4 text-3xl text-white">{item.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                {item.label === "03" ? (
                  <>
                    Our productions and creator storefronts live across our specialty tubes (
                    {STUDIO_TUBES.map((tube, index) => (
                      <span key={tube.domain}>
                        {index > 0 ? " and " : null}
                        <a
                          href={tube.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={tubeLinkClass}
                        >
                          {tube.domain}
                        </a>
                      </span>
                    ))}
                    ), giving performers 85% revenue share and direct traffic to their platforms.
                  </>
                ) : (
                  item.body
                )}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="work-with-us" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <p className="studio-kicker text-brand-300/80">Work with us</p>
        <h2 className="font-display mt-3 max-w-3xl text-4xl text-white sm:text-5xl">
          Two ways to collaborate.
        </h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col border border-white/10 bg-white/[0.03] p-8 sm:p-10">
            <p className="studio-kicker text-brand-300/70">On set</p>
            <h3 className="font-display mt-4 text-3xl text-white">In-Person Collaborations</h3>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">
              Co-produced scenes, shared footage rights, professional lighting, and fast scheduling
              for Las Vegas AVN Week Jan 2027 &amp; European dates.
            </p>
            <Link href="/contact?intent=collab" className="studio-cta mt-8 inline-flex w-fit px-6 py-3 text-[11px]">
              Book a Collab
            </Link>
          </article>
          <article className="flex flex-col border border-white/10 bg-white/[0.03] p-8 sm:p-10">
            <p className="studio-kicker text-brand-300/70">Online</p>
            <h3 className="font-display mt-4 text-3xl text-white">Creator Storefronts (85% Payout)</h3>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">
              Monetize existing FBB, fitness, or fetish clips on our targeted niche tubes with
              Paxum, USDT/USDC, or SEPA payouts.
            </p>
            <Link
              href="/contact?intent=storefront"
              className="studio-ghost mt-8 inline-flex w-fit px-6 py-3 text-[11px]"
            >
              Open a storefront
            </Link>
          </article>
        </div>
      </section>

      <section className="border-t border-white/5">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-28">
          <div>
            <p className="studio-kicker text-brand-300/80">Distribution</p>
            <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">Our Network</h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-zinc-400">
              Productions and creator storefronts live on the specialty tubes we operate. Performers
              keep 85% and get direct traffic to their own platforms.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {STUDIO_TUBES.map((tube) => (
                <li key={tube.domain}>
                  <a href={tube.href} target="_blank" rel="noopener noreferrer" className={tubeLinkClass}>
                    {tube.name} — {tube.domain}
                  </a>
                </li>
              ))}
            </ul>
            <Link href="/our-network" className="studio-ghost mt-8 inline-flex px-6 py-2.5 text-[11px]">
              Explore Our Network
            </Link>
          </div>
          <div className="flex flex-col justify-between border border-white/10 bg-white/[0.03] p-8 sm:p-10">
            <div>
              <p className="font-display text-3xl leading-snug text-zinc-100">
                Collaborations and storefronts go through the studio.
              </p>
              <a
                href={`mailto:${contactEmail}`}
                className="mt-6 block text-lg text-brand-300 hover:text-brand-200"
              >
                {contactEmail}
              </a>
            </div>
            <div className="mt-10">
              <Link href="/contact" className="studio-cta inline-flex px-6 py-3 text-[11px]">
                Contact the studio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
