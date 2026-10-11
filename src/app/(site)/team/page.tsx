import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/site/JsonLd";
import StudioFrame from "@/components/studio/StudioFrame";
import StudioTalentFilter from "@/components/studio/StudioTalentFilter";
import { listStudioTeam } from "@/lib/studio-talent";
import { getCurrentSite } from "@/lib/site";
import { buildOpenGraph, getSiteBaseUrl, keywordsMeta, pageTitleMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") return { title: "Team" };
  const title = pageTitleMeta(`Talent · ${site.name}`, site.name);
  const description = `The ${site.name} house roster — original Israeli and international contracted talent.`;
  return {
    title,
    description,
    keywords: keywordsMeta(site, ["talent", "team", "studio performers"]),
    alternates: { canonical: "/team" },
    openGraph: buildOpenGraph({
      title,
      description,
      url: "/team",
      siteName: site.name,
    }),
  };
}

export default async function StudioTeamPage() {
  const [site, base] = await Promise.all([getCurrentSite(), getSiteBaseUrl()]);
  if (site.kind !== "STUDIO") notFound();
  const team = await listStudioTeam(site.id);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${site.name} talent`,
          numberOfItems: team.length,
          itemListElement: team.map((star, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${base}/team/${star.slug}`,
            name: star.name,
          })),
        }}
      />
      <StudioFrame wide>
        <p className="studio-kicker text-brand-300/80">The company</p>
        <h1 className="font-display mt-4 text-5xl text-white sm:text-7xl">Talent</h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400">
          A small house roster. Faces the industry has not already spent — signed in Israel
          and brought in from Europe and North America. Every performer is 18 or older.
        </p>
        <div className="mt-12">
          <StudioTalentFilter team={team} />
        </div>
      </StudioFrame>
    </>
  );
}
