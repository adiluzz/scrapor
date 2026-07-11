"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  signedIn: boolean;
  signOut: React.ReactNode;
};

const links = [
  { href: "/tags", label: "Tags" },
  { href: "/pornstars", label: "Pornstars" },
  { href: "/creators", label: "Creators" },
  { href: "/our-network", label: "Our Network" },
] as const;

/**
 * Mobile-only hamburger for tube headers. Desktop keeps the inline nav.
 */
export default function TubeMobileNav({ signedIn, signOut }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col border-l border-zinc-800 bg-zinc-950 p-4 pt-[max(1rem,env(safe-area-inset-top))] transition-transform duration-200 ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2.5 ${
                  active
                    ? "bg-zinc-800 font-medium text-white"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="my-2 border-t border-zinc-800" />
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2.5 ${
                  pathname.startsWith("/dashboard")
                    ? "bg-zinc-800 font-medium text-white"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                Dashboard
              </Link>
              <div className="px-3 py-2">{signOut}</div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="mt-1 rounded-lg bg-brand-600 px-3 py-2.5 text-center font-medium text-white hover:bg-brand-500"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </aside>
    </div>
  );
}
