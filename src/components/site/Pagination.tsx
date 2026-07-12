"use client";

import { useQueryState } from "@/lib/useQueryState";

/** URL-driven pagination controls. */
export default function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const { setParams } = useQueryState();
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
      <button
        disabled={page <= 1}
        onClick={() => setParams({ page: page - 1 })}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 sm:px-3"
      >
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => setParams({ page: p })}
          className={`rounded-lg border px-2.5 py-2 text-sm sm:px-3.5 ${
            p === page
              ? "border-brand-500 bg-brand-600 text-white"
              : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        disabled={page >= totalPages}
        onClick={() => setParams({ page: page + 1 })}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 sm:px-3"
      >
        Next
      </button>
    </nav>
  );
}
