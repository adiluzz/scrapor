import Link from "next/link";
import CookieSettings from "@/components/site/CookieSettings";
import PopularLinksStrip from "@/components/site/PopularLinksStrip";
import type { PopularLink } from "@/lib/popular-links";

export default function Footer({
  siteName,
  isStudio = false,
  popularTags = [],
  popularPornstars = [],
}: {
  siteName: string;
  isStudio?: boolean;
  popularTags?: PopularLink[];
  popularPornstars?: PopularLink[];
}) {
  const showHubs = !isStudio && (popularTags.length > 0 || popularPornstars.length > 0);

  return (
    <footer className="mt-16 border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-zinc-500">
        {showHubs && (
          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            <PopularLinksStrip title="Popular tags" links={popularTags} hrefPrefix="/tags" />
            <PopularLinksStrip
              title="Popular pornstars"
              links={popularPornstars}
              hrefPrefix="/pornstars"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/" className="hover:text-zinc-300">
            Home
          </Link>
          {!isStudio && (
            <>
              <Link href="/tags" className="hover:text-zinc-300">
                Tags
              </Link>
              <Link href="/pornstars" className="hover:text-zinc-300">
                Pornstars
              </Link>
              <Link href="/creators" className="hover:text-zinc-300">
                Creators
              </Link>
            </>
          )}
          {isStudio && (
            <Link href="/contact" className="hover:text-zinc-300">
              Contact
            </Link>
          )}
          <Link href="/our-network" className="hover:text-zinc-300">
            Our Network
          </Link>
          <Link href="/privacy" className="hover:text-zinc-300">
            Privacy
          </Link>
          <CookieSettings siteName={siteName} />
          <Link href="/2257" className="hover:text-zinc-300">
            2257 Statement
          </Link>
          <Link href="/dmca" className="hover:text-zinc-300">
            DMCA
          </Link>
        </div>
        <p className="mt-4 text-xs text-zinc-600">
          All models were 18 years of age or older at the time of depiction. This site is
          labeled with the RTA (Restricted To Adults) tag. © {new Date().getFullYear()}{" "}
          {siteName}.
        </p>
      </div>
    </footer>
  );
}
