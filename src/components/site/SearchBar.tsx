"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TagIcon from "@/components/site/TagIcon";

type Suggestion = {
  type: "pornstar" | "tag" | "search";
  label: string;
  value: string;
  icon?: string | null;
  verified?: boolean;
};

/**
 * Autocomplete search box. Verified tags rank first and show their badge icon.
 * Submitting pushes the query into the URL (single source of truth).
 */
export default function SearchBar({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setOpen(true);
      } catch {
        /* ignore */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [value]);

  function go(query: string, target?: Suggestion) {
    setOpen(false);
    if (target?.type === "pornstar") router.push(`/pornstars/${target.value}`);
    else if (target?.type === "tag") router.push(`/tags/${target.value}`);
    else router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Enter") {
      if (active >= 0 && suggestions[active]) go(suggestions[active].label, suggestions[active]);
      else go(value);
    } else if (e.key === "Escape") setOpen(false);
  }

  const groupLabels: Record<string, string> = {
    pornstar: "Pornstars",
    tag: "Tags",
    search: "Searches",
  };

  return (
    <div ref={boxRef} className="relative w-full min-w-0 max-w-xl">
      <form
        onSubmit={(e) => { e.preventDefault(); go(value); }}
        className="flex min-w-0"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder="Search videos, pornstars, tags…"
          aria-label="Search videos, pornstars, tags"
          className="min-w-0 flex-1 rounded-l-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-brand-500 focus:outline-none sm:px-5 sm:py-2.5"
        />
        <button
          type="submit"
          aria-label="Search"
          className="inline-flex shrink-0 items-center justify-center rounded-r-full bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-500 sm:px-5"
        >
          <svg className="h-5 w-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <span className="hidden sm:inline">Search</span>
        </button>
      </form>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={`${s.type}-${s.value}-${i}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s.label, s)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                  active === i ? "bg-zinc-800 text-white" : "text-zinc-300"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  {s.type === "tag" && s.verified && (
                    <TagIcon icon={s.icon} slug={s.value} className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{s.label}</span>
                  {s.verified && (
                    <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300">
                      Verified
                    </span>
                  )}
                </span>
                <span className="ml-3 shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
                  {groupLabels[s.type]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
