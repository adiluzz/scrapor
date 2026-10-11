"use client";

import { useMemo, useState } from "react";
import type { StudioRegion, StudioStar } from "@/lib/studio-talent";
import StudioTalentCard from "@/components/studio/StudioTalentCard";

const FILTERS: { id: "all" | StudioRegion; label: string }[] = [
  { id: "all", label: "All" },
  { id: "israel", label: "Israel" },
  { id: "international", label: "International" },
];

export default function StudioTalentFilter({ team }: { team: StudioStar[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const visible = useMemo(
    () => (filter === "all" ? team : team.filter((star) => star.region === filter)),
    [filter, team]
  );

  return (
    <>
      <div className="mb-10 flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`studio-kicker border px-4 py-2 text-[11px] transition ${
                active
                  ? "border-brand-400/70 bg-brand-400/10 text-brand-200"
                  : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((star, index) => (
          <li key={star.slug}>
            <StudioTalentCard star={star} priority={index < 4} />
          </li>
        ))}
      </ul>
    </>
  );
}
