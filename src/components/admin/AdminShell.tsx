"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Logo from "@/components/brand/Logo";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/websites", label: "Websites" },
  { href: "/admin/scrape-runs", label: "Scrape runs" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/pornstars", label: "Pornstars" },
  { href: "/admin/creators", label: "Creators" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/api-keys", label: "API Keys" },
  { href: "/admin/video-agent", label: "Video Agent" },
  { href: "/admin/video-editor", label: "Video editor" },
  { href: "/admin/ad-clips", label: "Ad clips" },
  { href: "/admin/ads", label: "Promo ads" },
  { href: "/admin/assistant", label: "Assistant" },
  { href: "/admin/settings", label: "Settings" },
];

const SIDEBAR_KEY = "admin-sidebar-collapsed";

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

type LogoSite = {
  name: string;
  logoKey: string | null;
  primaryColor: string;
};

export default function AdminShell({
  children,
  signOut,
  site,
}: {
  children: React.ReactNode;
  signOut: React.ReactNode;
  site?: LogoSite | null;
}) {
  const pathname = usePathname();
  const isVideoEditor = pathname === "/admin/video-editor" || pathname.startsWith("/admin/video-editor/");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored === "1") {
        setSidebarCollapsed(true);
      } else if (stored === "0") {
        setSidebarCollapsed(false);
      } else if (isVideoEditor) {
        setSidebarCollapsed(true);
      }
    } catch {
      if (isVideoEditor) setSidebarCollapsed(true);
    }
    setSidebarReady(true);
  }, [isVideoEditor]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const logo = <Logo site={site} admin href="/admin" />;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3 lg:hidden">
        {logo}
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
        <div className="mb-6">{logo}</div>
        <NavLinks onNavigate={() => setMenuOpen(false)} signOut={signOut} />
      </aside>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-zinc-800 bg-zinc-900 transition-[width] duration-200 lg:block ${
            sidebarReady && sidebarCollapsed ? "w-0 overflow-hidden border-r-0 p-0" : "w-56 p-4"
          }`}
        >
          <div className="mb-6 flex items-center justify-between gap-2">
            <div className="min-w-0">{logo}</div>
            <button
              type="button"
              aria-label="Collapse admin menu"
              onClick={toggleSidebar}
              className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <NavLinks signOut={signOut} />
        </aside>

        <div className="relative min-w-0 flex-1">
          {/* Desktop sidebar expand tab when collapsed */}
          {sidebarReady && sidebarCollapsed && (
            <button
              type="button"
              aria-label="Open admin menu"
              onClick={toggleSidebar}
              className="fixed left-0 top-1/2 z-30 hidden -translate-y-1/2 rounded-r-lg border border-l-0 border-zinc-700 bg-zinc-900 px-1.5 py-3 text-zinc-400 shadow-lg hover:bg-zinc-800 hover:text-white lg:block"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <main
            className={`min-w-0 flex-1 ${isVideoEditor ? "p-0" : "p-4 sm:p-6 lg:p-8"}`}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
