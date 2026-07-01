"use client";

import { useState } from "react";
import { useQueryState } from "@/lib/useQueryState";

/** Search box that filters the current listing via the URL `q` param. */
export default function InPageSearch({ placeholder }: { placeholder: string }) {
  const { get, setParams } = useQueryState();
  const [value, setValue] = useState(get("q"));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setParams({ q: value || null }); }}
      className="flex max-w-sm"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-l-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-pink-500 focus:outline-none"
      />
      <button type="submit" className="rounded-r-lg bg-pink-600 px-4 text-sm text-white hover:bg-pink-500">
        Go
      </button>
    </form>
  );
}
