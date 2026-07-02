import Link from "next/link";
import { NICHE_KEYWORDS } from "@/lib/seo";

/** Visible topical copy for crawlers and visitors — supports niche SEO without keyword stuffing. */
export default function SiteSeoIntro({ siteName }: { siteName: string }) {
  const featuredTags = NICHE_KEYWORDS.slice(0, 8);

  return (
    <section className="mt-12 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-6 text-sm leading-relaxed text-zinc-400">
      <h2 className="text-base font-semibold text-zinc-200">
        {siteName} — piss drinking &amp; watersports porn tube
      </h2>
      <p className="mt-2">
        {siteName} is a free HD adult tube focused on piss drinking porn, golden shower videos,
        pee drinking, piss swallowing, and urine fetish content. Browse full-length watersports
        scenes, discover performers, and stream in high quality — updated daily.
      </p>
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
    </section>
  );
}
