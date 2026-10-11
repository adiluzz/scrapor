import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/site/JsonLd";
import StudioPortrait from "@/components/studio/StudioPortrait";
import StudioTalentCard from "@/components/studio/StudioTalentCard";
import StudioTalentGallery from "@/components/studio/StudioTalentGallery";
import {
  getStudioStar,
  listRelatedStudioTeam,
  personJsonLd,
} from "@/lib/studio-talent";
import { getCurrentSite } from "@/lib/site";
import { buildOpenGraph, getSiteBaseUrl, keywordsMeta, pageTitleMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const star = site.kind === "STUDIO" ? await getStudioStar(site.id, slug) : null;
  if (!star) return { title: "Not found" };
  const title = pageTitleMeta(`${star.name} · ${site.name}`, site.name);
  const description = `${star.name} — ${star.role} at ${site.name}. ${star.tagline}`;
  return {
    title,
    description,
    keywords: keywordsMeta(site, [star.name, star.origin, "studio talent"]),
    alternates: { canonical: `/team/${star.slug}` },
    openGraph: buildOpenGraph({
      title: `${star.name} · ${site.name}`,
      description,
      url: `/team/${star.slug}`,
      siteName: site.name,
      image: star.photo || site.ogImagePath,
    }),
  };
}

export default async function StudioStarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [site, base] = await Promise.all([getCurrentSite(), getSiteBaseUrl()]);
  if (site.kind !== "STUDIO") notFound();
  const star = await getStudioStar(site.id, slug);
  if (!star) notFound();
  const related = await listRelatedStudioTeam(site.id, star.slug, 4);

  return (
    <>
      <JsonLd data={personJsonLd(base, site.name, star)} />
      <article>
        <div className="grid lg:min-h-[88vh] lg:grid-cols-2">
          <div className="relative min-h-[70vh] lg:min-h-full">
            <StudioPortrait
              star={star}
              priority
              className="absolute inset-0"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
          <div className="flex flex-col justify-center px-5 py-12 sm:px-10 lg:px-16">
            <p className="studio-kicker text-brand-300/80">
              <Link href="/team" className="hover:text-brand-200">
                Talent
              </Link>
              <span className="mx-2 text-zinc-600">/</span>
              {star.origin}
            </p>
            <h1 className="font-display mt-4 text-5xl text-white sm:text-7xl">{star.name}</h1>
            <p className="mt-4 text-lg text-zinc-300">{star.tagline}</p>
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              <div>
                <dt className="studio-kicker text-zinc-500">Role</dt>
                <dd className="mt-1 text-zinc-200">{star.role}</dd>
              </div>
              <div>
                <dt className="studio-kicker text-zinc-500">Based</dt>
                <dd className="mt-1 text-zinc-200">{star.basedIn}</dd>
              </div>
              <div>
                <dt className="studio-kicker text-zinc-500">Signed</dt>
                <dd className="mt-1 text-zinc-200">{star.signed}</dd>
              </div>
              <div>
                <dt className="studio-kicker text-zinc-500">Languages</dt>
                <dd className="mt-1 text-zinc-200">{star.languages.join(" · ")}</dd>
              </div>
            </dl>
            <div className="mt-10 space-y-5 text-base leading-relaxed text-zinc-400">
              {star.bio.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-12 flex flex-wrap gap-3">
              <Link href="/contact" className="studio-cta px-6 py-2.5 text-[11px]">
                Booking & casting
              </Link>
              <Link href="/team" className="studio-ghost px-6 py-2.5 text-[11px]">
                Full roster
              </Link>
            </div>
          </div>
        </div>

        <StudioTalentGallery star={star} />

        {related.length > 0 ? (
          <section className="border-t border-white/5 px-5 py-16 sm:px-8 lg:px-12">
            <div className="mx-auto max-w-7xl">
              <p className="studio-kicker text-brand-300/80">Also in the company</p>
              <h2 className="font-display mt-3 text-3xl text-white sm:text-4xl">More talent</h2>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((other) => (
                  <li key={other.slug}>
                    <StudioTalentCard star={other} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}
