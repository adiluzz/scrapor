import Link from "next/link";
import type { Site } from "@prisma/client";
import { parseSeoKeywords } from "@/lib/site";

/** Visible topical copy for crawlers and visitors — supports niche SEO without keyword stuffing. */
export default function SiteSeoIntro({ site }: { site: Site }) {
  const featuredTags = parseSeoKeywords(site.seoKeywords).slice(0, 8);

  return (
    <section className="mt-12 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-6 text-sm leading-relaxed text-zinc-400">
      <h2 className="text-base font-semibold text-zinc-200">
        {site.name}
        {site.tagline ? ` — ${site.tagline}` : null}
      </h2>
      {site.homeIntroHtml ? (
        <div
          className="mt-2 [&_p]:mt-2 [&_p:first-child]:mt-0"
          dangerouslySetInnerHTML={{ __html: site.homeIntroHtml }}
        />
      ) : site.tagline ? (
        <p className="mt-2">{site.tagline}</p>
      ) : null}
      {featuredTags.length > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Popular searches:{" "}
          {featuredTags.map((term, i) => (
            <span key={term}>
              {i > 0 ? " · " : null}
              <Link
                href={`/search?q=${encodeURIComponent(term)}`}
                className="text-brand-400/90 hover:text-brand-300 hover:underline"
              >
                {term}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
