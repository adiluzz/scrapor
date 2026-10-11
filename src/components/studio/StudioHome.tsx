import Image from "next/image";
import Link from "next/link";
import type { Site } from "@prisma/client";
import JsonLd from "@/components/site/JsonLd";
import StudioTalentCard from "@/components/studio/StudioTalentCard";
import type { StudioStar } from "@/lib/studio-talent";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";

const CRAFT = [
  {
    label: "01",
    title: "Casting",
    body: "We sign faces the industry has not already spent. House talent first — then the right guest for the picture.",
  },
  {
    label: "02",
    title: "Direction",
    body: "Long lenses, practical light, and scenes that hold. Every frame is built to look like a still you would keep.",
  },
  {
    label: "03",
    title: "Network",
    body: "The productions feed a family of specialty tubes. One studio. Several doors into the same catalog.",
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
  const h1 = site.homeH1 || `${site.name} Productions`;

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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#070605] to-transparent" />
        <div className="relative mx-auto flex min-h-[92vh] w-full max-w-7xl flex-col justify-end px-5 pb-16 pt-28 sm:px-8 sm:pb-24 lg:px-12">
          <p className="studio-kicker text-brand-300/90">Adult film studio</p>
          <h1 className="font-display mt-5 max-w-4xl text-5xl font-medium leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-8xl">
            {h1}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            {site.tagline ||
              "Cinematic adult productions. House talent. A network of specialty rooms."}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/team" className="studio-cta px-7 py-3 text-[11px]">
              Meet the talent
            </Link>
            <Link href="/contact" className="studio-ghost px-7 py-3 text-[11px]">
              Work with us
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-white/5">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:px-12 lg:py-28">
          <div className="lg:col-span-4">
            <p className="studio-kicker text-brand-300/80">The house</p>
            <h2 className="font-display mt-4 text-4xl text-white sm:text-5xl">
              Built like a feature. Cast like a lookbook.
            </h2>
          </div>
          <div className="space-y-6 text-base leading-relaxed text-zinc-400 lg:col-span-7 lg:col-start-6">
            <p>
              {site.name} is an adult film production company. We do not run a tube on this
              domain. We make pictures — then we place them across a network of specialty
              sites that already know their audience.
            </p>
            <p>
              The house look is dark, close, and expensive: champagne light, long takes, and
              performers the industry has not already worn out. Some of them we found in
              Israel. Some of them we brought in from elsewhere. All of them are ours.
            </p>
            {site.homeIntroHtml ? (
              <div
                className="prose prose-invert max-w-none text-zinc-400"
                dangerouslySetInnerHTML={{ __html: site.homeIntroHtml }}
              />
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="studio-kicker text-brand-300/80">The company</p>
            <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">House talent</h2>
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
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-28">
        <div>
          <p className="studio-kicker text-brand-300/80">Distribution</p>
          <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">The network</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-zinc-400">
            Productions leave this house and land on the specialty tubes we operate. Same
            catalog DNA. Different rooms.
          </p>
          <Link href="/our-network" className="studio-ghost mt-8 inline-flex px-6 py-2.5 text-[11px]">
            Explore the network
          </Link>
        </div>
        <div className="flex flex-col justify-between border border-white/10 bg-white/[0.03] p-8 sm:p-10">
          <p className="font-display text-3xl leading-snug text-zinc-100">
            Casting, licensing, and collaborations go through the studio — not the tubes.
          </p>
          <div className="mt-10">
            <Link href="/contact" className="studio-cta inline-flex px-6 py-3 text-[11px]">
              Contact the studio
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
