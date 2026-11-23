"use client";

import Link from "next/link";

type AdminVideoSort = "newest" | "views" | "views-asc";

const SORTS: { label: string; value: AdminVideoSort }[] = [
  { label: "Newest", value: "newest" },
  { label: "Most views", value: "views" },
  { label: "Fewest views", value: "views-asc" },
];

export default function AdminVideoViewToggle({
  q,
  page,
  view,
  siteId = "",
  orphans = false,
  sort = "newest",
  suspension = "",
}: {
  q: string;
  page: number;
  view: "table" | "grid";
  siteId?: string;
  orphans?: boolean;
  sort?: AdminVideoSort;
  suspension?: "" | "visible" | "suspended";
}) {
  function href(next: { view?: "table" | "grid"; sort?: AdminVideoSort; page?: number }) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (siteId) qs.set("siteId", siteId);
    if (orphans) qs.set("orphans", "1");
    if (suspension) qs.set("suspension", suspension);
    const nextSort = next.sort ?? sort;
    if (nextSort !== "newest") qs.set("sort", nextSort);
    if (next.page != null) qs.set("page", String(next.page));
    qs.set("view", next.view ?? view);
    return `/admin/videos?${qs.toString()}`;
  }

  const chip = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs ${
      active ? "bg-zinc-700 text-white" : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
    }`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Sort:</span>
        {SORTS.map((s) => (
          <Link key={s.value} href={href({ sort: s.value })} className={chip(sort === s.value)}>
            {s.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">View:</span>
        <Link href={href({ view: "table", page })} className={chip(view === "table")}>
          Table
        </Link>
        <Link href={href({ view: "grid", page })} className={chip(view === "grid")}>
          Grid
        </Link>
      </div>
    </div>
  );
}
