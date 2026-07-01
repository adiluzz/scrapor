import Link from "next/link";
import SearchBar from "@/components/site/SearchBar";
import { getCurrentUser } from "@/lib/session";

export default async function Header({ initialQuery = "" }: { initialQuery?: string }) {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl font-black tracking-tight">
            <span className="text-white">Piss</span>
            <span className="text-pink-500">ter</span>
          </span>
        </Link>

        <div className="flex-1 md:px-6">
          <SearchBar initial={initialQuery} />
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/pornstars" className="text-zinc-300 hover:text-white">Pornstars</Link>
          <Link href="/creators" className="text-zinc-300 hover:text-white">Creators</Link>
          {user ? (
            <>
              <Link href="/dashboard" className="text-zinc-300 hover:text-white">Dashboard</Link>
              <Link href="/api/auth/signout" className="text-zinc-500 hover:text-white">Sign out</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-zinc-300 hover:text-white">Log in</Link>
              <Link href="/signup" className="rounded-full bg-pink-600 px-4 py-1.5 font-medium text-white hover:bg-pink-500">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
