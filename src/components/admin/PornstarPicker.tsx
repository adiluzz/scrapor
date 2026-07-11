"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Autocomplete multi-select for pornstar names.
 * Selected names appear as chips with an × to remove.
 */
export default function PornstarPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (names: string[]) => void;
  suggestions: string[];
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selectedLower = useMemo(
    () => new Set(value.map((n) => n.toLowerCase())),
    [value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = suggestions.filter((s) => !selectedLower.has(s.toLowerCase()));
    if (!q) return available.slice(0, 12);
    return available.filter((s) => s.toLowerCase().includes(q)).slice(0, 12);
  }, [query, suggestions, selectedLower]);

  const canCreate =
    query.trim().length > 0 &&
    !selectedLower.has(query.trim().toLowerCase()) &&
    !suggestions.some((s) => s.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function addName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selectedLower.has(trimmed.toLowerCase())) {
      setQuery("");
      setOpen(false);
      return;
    }
    onChange([...value, trimmed]);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeName(name: string) {
    onChange(value.filter((n) => n.toLowerCase() !== name.toLowerCase()));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !query && value.length > 0) {
      removeName(value[value.length - 1]);
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
      if (!open && query.trim()) {
        addName(query);
        return;
      }
      if (canCreate && highlight === 0 && filtered.length === 0) {
        addName(query);
        return;
      }
      if (canCreate && highlight === filtered.length) {
        addName(query);
        return;
      }
      const pick = filtered[highlight] ?? filtered[0];
      if (pick) addName(pick);
      else if (query.trim()) addName(query);
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
          placeholder="Search or add a pornstar…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so option click registers.
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
            {filtered.map((name, i) => (
              <li key={name} role="option" aria-selected={highlight === i}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    highlight === i ? "bg-brand-600/20 text-white" : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addName(name)}
                  onMouseEnter={() => setHighlight(i)}
                >
                  {name}
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
                  onClick={() => addName(query)}
                  onMouseEnter={() => setHighlight(filtered.length)}
                >
                  Add “{query.trim()}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((name) => (
            <li
              key={name}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 pl-2.5 text-sm text-zinc-200"
            >
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => removeName(name)}
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
