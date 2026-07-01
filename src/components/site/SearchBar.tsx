"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Suggestion = { type: "pornstar" | "tag" | "search"; label: string; value: string };

/**
 * Autocomplete search box. Suggestions merge tags + pornstars + top past
 * searches. Submitting pushes the query into the URL (single source of truth).
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

  const groupLabels: Record<string, string> = { pornstar: "Pornstars", tag: "Tags", search: "Searches" };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <form
        onSubmit={(e) => { e.preventDefault(); go(value); }}
        className="flex"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder="Search videos, pornstars, tags…"
          className="flex-1 rounded-l-full bg-zinc-900 border border-zinc-700 px-5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-pink-500"
        />
        <button type="submit" className="rounded-r-full bg-pink-600 hover:bg-pink-500 px-5 text-white text-sm font-medium">
          Search
        </button>
      </form>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={`${s.type}-${s.value}-${i}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s.label, s)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  active === i ? "bg-zinc-800 text-white" : "text-zinc-300"
                }`}
              >
                <span className="truncate">{s.label}</span>
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
