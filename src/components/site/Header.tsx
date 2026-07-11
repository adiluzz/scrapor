import Link from "next/link";
import type { Site } from "@prisma/client";
import SearchBar from "@/components/site/SearchBar";
import SignOutButton from "@/components/auth/SignOutButton";
import Logo from "@/components/brand/Logo";
import { getCurrentUser } from "@/lib/session";

export default async function Header({
  site,
  initialQuery = "",
}: {
  site: Site;
  initialQuery?: string;
}) {
  const user = await getCurrentUser();
  const isStudio = site.kind === "STUDIO";

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/90 bg-zinc-950/90 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
        <Logo site={site} />

        {!isStudio ? (
          <div className="flex-1 md:px-6">
            <SearchBar initial={initialQuery} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <nav className="flex items-center gap-4 text-sm">
          {isStudio ? (
            <>
              <Link href="/" className="text-zinc-300 hover:text-white">
                Home
              </Link>
              <Link href="/contact" className="text-zinc-300 hover:text-white">
                Contact
              </Link>
              <Link href="/our-network" className="text-zinc-300 hover:text-white">
                Our Network
              </Link>
            </>
          ) : (
            <>
              <Link href="/tags" className="text-zinc-300 hover:text-white">
                Tags
              </Link>
              <Link href="/pornstars" className="text-zinc-300 hover:text-white">
                Pornstars
              </Link>
              <Link href="/creators" className="text-zinc-300 hover:text-white">
                Creators
              </Link>
              <Link href="/our-network" className="text-zinc-300 hover:text-white">
                Our Network
              </Link>
              {user ? (
                <>
                  <Link href="/dashboard" className="text-zinc-300 hover:text-white">
                    Dashboard
                  </Link>
                  <SignOutButton className="text-zinc-500 hover:text-white" />
                </>
              ) : (
                <>
                  <Link href="/login" className="text-zinc-300 hover:text-white">
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-full bg-brand-600 px-4 py-1.5 font-medium text-white hover:bg-brand-500"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
