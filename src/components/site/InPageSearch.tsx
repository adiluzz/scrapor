"use client";

import { useEffect, useState } from "react";
import { useQueryState } from "@/lib/useQueryState";

/** Search box that filters the current listing via the URL `q` param. */
export default function InPageSearch({ placeholder }: { placeholder: string }) {
  const { get, setParams } = useQueryState();
  const urlQ = get("q");
  const [value, setValue] = useState(urlQ);

  useEffect(() => {
    setValue(urlQ);
  }, [urlQ]);

  function clearSearch() {
    setValue("");
    setParams({ q: null });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setParams({ q: value || null });
      }}
      className="flex max-w-sm"
    >
      <div className="relative min-w-0 flex-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-l-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-3 pr-8 text-sm text-zinc-100 placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
        />
        {value ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
      <button type="submit" className="rounded-r-lg bg-brand-600 px-4 text-sm text-white hover:bg-brand-500">
        Go
      </button>
    </form>
  );
}
