import Link from "next/link";
import CookieSettings from "@/components/site/CookieSettings";
import { listStudioTeam } from "@/lib/studio-talent";

export default async function StudioFooter({
  siteName,
  siteId,
}: {
  siteName: string;
  siteId?: string;
}) {
  const talent = siteId ? (await listStudioTeam(siteId)).slice(0, 8) : [];

  return (
    <footer className="mt-0 border-t border-white/10 bg-[#050403]">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:px-12">
        <div className="lg:col-span-4">
          <p className="font-display text-3xl text-white">{siteName}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-500">
            Adult film productions. House talent. A network of specialty sites.
          </p>
        </div>
        <div className="lg:col-span-3">
          <p className="studio-kicker text-zinc-500">Studio</p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li>
              <Link href="/team" className="hover:text-white">
                Talent
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-white">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/our-network" className="hover:text-white">
                Our Network
              </Link>
            </li>
          </ul>
        </div>
        <div className="lg:col-span-5">
          <p className="studio-kicker text-zinc-500">Talent</p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-zinc-400">
            {talent.map((star) => (
              <li key={star.slug}>
                <Link href={`/team/${star.slug}`} className="hover:text-white">
                  {star.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 px-5 py-6 text-xs text-zinc-600 sm:px-8 lg:px-12">
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
        <p className="mx-auto max-w-7xl px-5 pb-8 text-xs text-zinc-600 sm:px-8 lg:px-12">
          All models were 18 years of age or older at the time of depiction. This site is
          labeled with the RTA (Restricted To Adults) tag. © {new Date().getFullYear()}{" "}
          {siteName}.
        </p>
      </div>
    </footer>
  );
}
