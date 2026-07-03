"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/brand/Logo";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/scrape-runs", label: "Scrape runs" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/creators", label: "Creators" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/api-keys", label: "API Keys" },
  { href: "/admin/video-agent", label: "Video Agent" },
  { href: "/admin/assistant", label: "Assistant" },
  { href: "/admin/settings", label: "Settings" },
];

function NavLinks({
  onNavigate,
  signOut,
}: {
  onNavigate?: () => void;
  signOut: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {nav.map((n) => {
        const active =
          n.href === "/admin"
            ? pathname === "/admin"
            : pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            className={`block rounded-lg px-3 py-2 text-sm ${
              active
                ? "bg-zinc-800 font-medium text-white"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
      <div className="mt-4">{signOut}</div>
    </nav>
  );
}

export default function AdminShell({
  children,
  signOut,
}: {
  children: React.ReactNode;
  signOut: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3 lg:hidden">
        <Logo admin href="/admin" />
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          {menuOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-zinc-800 bg-zinc-900 p-4 transition-transform duration-200 lg:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6">
          <Logo admin href="/admin" />
        </div>
        <NavLinks onNavigate={() => setMenuOpen(false)} signOut={signOut} />
      </aside>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-zinc-800 bg-zinc-900 p-4 lg:block">
          <div className="mb-6">
            <Logo admin href="/admin" />
          </div>
          <NavLinks signOut={signOut} />
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
