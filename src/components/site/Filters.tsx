"use client";

import { useQueryState } from "@/lib/useQueryState";
import type { SortKey } from "@/lib/queries";

const DURATIONS = [
  { label: "Any length", min: "", max: "" },
  { label: "0–5 min", min: "0", max: "300" },
  { label: "5–20 min", min: "300", max: "1200" },
  { label: "20–40 min", min: "1200", max: "2400" },
  { label: "40+ min", min: "2400", max: "" },
];

const SORTS: { label: string; value: SortKey }[] = [
  { label: "Featured", value: "featured" },
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Most viewed", value: "popular" },
];

/** URL-driven duration + sort controls. Every change updates the URL. */
export default function Filters({ defaultSort = "newest" }: { defaultSort?: SortKey }) {
  const { get, setParams } = useQueryState();
  const currentSort = (get("sort") as SortKey) || defaultSort;
  const currentMin = get("min");
  const currentMax = get("max");
  const currentDur =
    DURATIONS.find((d) => d.min === currentMin && d.max === currentMax) || DURATIONS[0];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-zinc-400">
        Duration
        <select
          value={DURATIONS.indexOf(currentDur)}
          onChange={(e) => {
            const d = DURATIONS[parseInt(e.target.value, 10)];
            setParams({ min: d.min || null, max: d.max || null });
          }}
          className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
        >
          {DURATIONS.map((d, i) => (
            <option key={d.label} value={i}>{d.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-zinc-400">
        Sort
        <select
          value={currentSort}
          onChange={(e) => setParams({ sort: e.target.value })}
          className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
