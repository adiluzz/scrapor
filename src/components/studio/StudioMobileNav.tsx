"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/team", label: "Talent" },
  { href: "/our-network", label: "Network" },
  { href: "/contact", label: "Contact" },
];

export default function StudioMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="studio-mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="studio-kicker inline-flex h-10 items-center border border-brand-400/25 px-3 text-[11px] text-zinc-200"
      >
        {open ? "Close" : "Menu"}
      </button>
      {open ? (
        <div
          id="studio-mobile-nav"
          className="absolute inset-x-0 top-full border-b border-brand-400/15 bg-[#070605]/95 px-5 py-6 backdrop-blur-xl"
        >
          <nav className="flex flex-col gap-4">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="studio-kicker text-sm text-zinc-200"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/contact"
              onClick={() => setOpen(false)}
              className="studio-cta mt-2 inline-flex items-center justify-center px-5 py-2.5 text-[11px]"
            >
              Work with us
            </Link>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
