"use client";

import type { LibraryVideo } from "@/lib/video-editor-types";

type SiteRow = { id: string; name: string; kind: string; logoPath: string | null };

export default function EditorLibraryPanel({
  sites,
  siteId,
  onSiteChange,
  q,
  onQueryChange,
  onSearch,
  searching,
  results,
  selected,
  onToggle,
  onAddToTimeline,
  onAddVideoClip,
  clipCount,
  note,
}: {
  sites: SiteRow[];
  siteId: string;
  onSiteChange: (id: string) => void;
  q: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  searching: boolean;
  results: LibraryVideo[];
  selected: LibraryVideo[];
  onToggle: (v: LibraryVideo) => void;
  onAddToTimeline: () => void;
  onAddVideoClip: (v: LibraryVideo) => void;
  clipCount: number;
  note: string | null;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-zinc-800 bg-zinc-950/80">
      <div className="border-b border-zinc-800 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Media</h2>
        <p className="mt-0.5 text-[11px] text-zinc-600">Search · add clips · cut many segments per video</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-zinc-500">Site</span>
          <select
            value={siteId}
            onChange={(e) => onSiteChange(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-white"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-1.5">
          <input
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearch();
              }
            }}
            placeholder="Search…"
            className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={onSearch}
            disabled={searching || q.trim().length < 2}
            className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
          >
            {searching ? "…" : "Go"}
          </button>
        </div>

        {results.length > 0 ? (
          <ul className="space-y-0.5">
            {results.map((v) => {
              const on = selected.some((x) => x.id === v.id);
              return (
                <li key={v.id}>
                  <div
                    className={`flex items-start gap-1 rounded-md transition-colors ${
                      on ? "bg-brand-950/40 ring-1 ring-brand-500/30" : "hover:bg-zinc-800/60"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(v)}
                        className="mt-0.5 accent-brand-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-200">{v.title}</span>
                        <span className="text-[11px] text-zinc-500">
                          {v.durationSec != null ? `${Math.round(v.durationSec / 60)} min` : "—"}
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => onAddVideoClip(v)}
                      className="mr-1.5 mt-2 shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      title="Add one clip from this video (click again for another segment)"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 text-xs text-zinc-600">Search for videos to add clips.</p>
        )}
      </div>

      <div className="shrink-0 border-t border-zinc-800 p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span>{selected.length} selected</span>
          <span>{clipCount} on timeline</span>
        </div>
        <button
          type="button"
          onClick={onAddToTimeline}
          disabled={selected.length === 0}
          className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          + Add to timeline
        </button>
        <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
          Use <span className="text-zinc-500">+</span> on a row to add the same video again as another clip.
        </p>
        {note && <p className="mt-2 text-[11px] text-emerald-400/90">{note}</p>}
      </div>
    </aside>
  );
}
