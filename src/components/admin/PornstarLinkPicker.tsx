"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { slugify } from "@/lib/slug";

export type PornstarLink = {
  id: string;
  name: string;
  slug: string;
  videoCount?: number;
};

function sameStar(a: PornstarLink, b: PornstarLink) {
  if (a.id && b.id) return a.id === b.id;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

function optionLabel(star: PornstarLink, suggestions: PornstarLink[]) {
  const duplicates = suggestions.filter(
    (item) => item.name.trim().toLowerCase() === star.name.trim().toLowerCase()
  ).length;
  const parts = [star.name];
  if (duplicates > 1 || (star.slug && star.slug !== slugify(star.name))) {
    parts.push(`/${star.slug}`);
  }
  if (star.videoCount != null) {
    parts.push(`${star.videoCount} video${star.videoCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

/**
 * Pick a pornstar by name. The slug is only the public URL and is never used
 * to decide which profile gets linked. A new profile is offered only when
 * that name does not already exist.
 */
export default function PornstarLinkPicker({
  value,
  onChange,
  suggestions,
}: {
  value: PornstarLink[];
  onChange: (links: PornstarLink[]) => void;
  suggestions: PornstarLink[];
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = suggestions.filter((star) => !value.some((picked) => sameStar(picked, star)));
    if (!q) return available.slice(0, 12);
    return available
      .filter(
        (star) =>
          star.name.toLowerCase().includes(q) || star.slug.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [query, suggestions, value]);

  const exactNameExists = suggestions.some(
    (star) => star.name.trim().toLowerCase() === query.trim().toLowerCase()
  );
  const canCreate =
    query.trim().length > 0 &&
    !exactNameExists &&
    !value.some((star) => star.name.trim().toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function addStar(star: PornstarLink) {
    if (value.some((picked) => sameStar(picked, star))) {
      setQuery("");
      setOpen(false);
      return;
    }
    onChange([...value, star]);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function addNew(name: string) {
    const trimmed = name.trim();
    if (!trimmed || exactNameExists) return;
    addStar({ id: "", name: trimmed, slug: "" });
  }

  function removeStar(star: PornstarLink) {
    onChange(value.filter((picked) => !sameStar(picked, star)));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !query && value.length > 0) {
      removeStar(value[value.length - 1]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      const max = filtered.length + (canCreate ? 1 : 0) - 1;
      setHighlight((h) => Math.min(h + 1, Math.max(0, max)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (canCreate && (filtered.length === 0 || highlight === filtered.length)) {
        addNew(query);
        return;
      }
      const pick = filtered[highlight] ?? filtered[0];
      if (pick) addStar(pick);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          value={query}
          placeholder="Search an existing pornstar…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={onKeyDown}
        />

        {open && (filtered.length > 0 || canCreate) && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
          >
            {filtered.map((star, i) => (
              <li key={star.id || star.slug || star.name} role="option" aria-selected={highlight === i}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    highlight === i ? "bg-brand-600/20 text-white" : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addStar(star)}
                  onMouseEnter={() => setHighlight(i)}
                >
                  {optionLabel(star, suggestions)}
                </button>
              </li>
            ))}
            {canCreate && (
              <li role="option" aria-selected={highlight === filtered.length}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    highlight === filtered.length
                      ? "bg-brand-600/20 text-white"
                      : "text-zinc-400 hover:bg-zinc-900"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addNew(query)}
                  onMouseEnter={() => setHighlight(filtered.length)}
                >
                  Create “{query.trim()}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((star) => (
            <li
              key={star.id || `new:${star.name}`}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 pl-2.5 text-sm text-zinc-200"
            >
              <span>
                {star.id ? star.name : `New: ${star.name}`}
                {star.slug ? (
                  <span className="ml-1 text-xs text-zinc-500">/{star.slug}</span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={`Remove ${star.name}`}
                onClick={() => removeStar(star)}
                className="rounded-r-md px-2 py-1 text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-600">No pornstars assigned yet.</p>
      )}
    </div>
  );
}
