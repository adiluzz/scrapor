import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import SignOutButton from "@/components/auth/SignOutButton";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/scrape-runs", label: "Scrape runs" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/creators", label: "Creators" },
  { href: "/admin/applications", label: "Applications" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="flex">
        <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-6 text-xl font-black">
            <span className="text-white">Piss</span><span className="text-pink-500">ter</span>
            <span className="ml-1 text-xs font-normal text-zinc-500">admin</span>
          </div>
          <nav className="space-y-1">
            {nav.map((n) => (
              <Link key={n.href} href={n.href}
                className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white">
                {n.label}
              </Link>
            ))}
            <SignOutButton className="mt-4 block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:text-white" />
          </nav>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
