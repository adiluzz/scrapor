"use client";

import type { ScrapeCandidate } from "@/types/scrape-candidate";

function Card({
  v,
  selected,
  onToggle,
}: {
  v: ScrapeCandidate;
  selected: boolean;
  onToggle: () => void;
}) {
  async function copyUrl(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(v.url);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-zinc-900 transition-colors ${
        selected ? "border-brand-500 ring-1 ring-brand-500/40" : "border-zinc-800 hover:border-zinc-600"
      } ${v.inCatalog ? "opacity-70" : ""}`}
    >
      <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand-600 focus:ring-brand-500"
        />
        Select
      </label>

      <a href={v.url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="relative aspect-video overflow-hidden bg-zinc-800">
          {v.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={v.thumbnail}
              alt={v.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">No preview</div>
          )}
          {v.durationLabel && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-white">
              {v.durationLabel}
            </span>
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-zinc-200">
            {v.sourceSite}
          </span>
          {v.inCatalog && (
            <span className="absolute right-1.5 top-10 rounded bg-amber-900/90 px-1.5 py-0.5 text-[10px] text-amber-200">
              In catalog
            </span>
          )}
        </div>
        <div className="p-2.5">
          <h3 className="line-clamp-2 text-sm text-zinc-200 group-hover:text-white">{v.title}</h3>
          <div className="mt-1.5 flex items-start gap-1">
            <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-500" title={v.url}>
              {v.url}
            </p>
            <button
              type="button"
              onClick={copyUrl}
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Copy
            </button>
          </div>
          {v.pornstars && v.pornstars.length > 0 && (
            <p className="mt-1 truncate text-xs text-brand-400/80">{v.pornstars.join(", ")}</p>
          )}
        </div>
      </a>
    </div>
  );
}

/** Thumbnail grid for picking external source-site videos before download. */
export default function ExternalVideoSelectGrid({
  videos,
  selectedUrls,
  onToggle,
}: {
  videos: ScrapeCandidate[];
  selectedUrls: Set<string>;
  onToggle: (url: string) => void;
}) {
  if (videos.length === 0) {
    return <p className="py-12 text-center text-zinc-500">No videos found for this search.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {videos.map((v) => (
        <Card
          key={v.url}
          v={v}
          selected={selectedUrls.has(v.url)}
          onToggle={() => onToggle(v.url)}
        />
      ))}
    </div>
  );
}
