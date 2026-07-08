"use client";

import Link from "next/link";

export default function AdminVideoViewToggle({
  q,
  page,
  view,
}: {
  q: string;
  page: number;
  view: "table" | "grid";
}) {
  const base = `/admin/videos?q=${encodeURIComponent(q)}&page=${page}`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500">View:</span>
      <Link
        href={`${base}&view=table`}
        className={`rounded-lg px-3 py-1.5 text-xs ${
          view === "table"
            ? "bg-zinc-700 text-white"
            : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
        }`}
      >
        Table
      </Link>
      <Link
        href={`${base}&view=grid`}
        className={`rounded-lg px-3 py-1.5 text-xs ${
          view === "grid"
            ? "bg-zinc-700 text-white"
            : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
        }`}
      >
        Grid
      </Link>
    </div>
  );
}
