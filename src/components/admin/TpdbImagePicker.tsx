"use client";

import { useCallback, useEffect, useState } from "react";

export type TpdbPickerImage = {
  id: string;
  url: string;
  width?: number | null;
  height?: number | null;
};

export type TpdbPickerMatch = {
  id: string;
  name: string;
  disambiguation?: string | null;
  images: TpdbPickerImage[];
};

type Props = {
  initialQuery: string;
  disabled?: boolean;
  onSelect: (match: TpdbPickerMatch, image: TpdbPickerImage) => void;
};

export default function TpdbImagePicker({ initialQuery, disabled, onSelect }: Props) {
  const [q, setQ] = useState(initialQuery);
  const [matches, setMatches] = useState<TpdbPickerMatch[]>([]);
  const [selected, setSelected] = useState<TpdbPickerMatch | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      const res = await fetch(
        `/api/admin/pornstars/search-external?q=${encodeURIComponent(q.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setMatches(data.performers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setMatches([]);
    } finally {
      setSearching(false);
    }
  }, [q]);

  useEffect(() => {
    if (initialQuery.trim().length >= 2) {
      search();
    }
    // Run once on mount with the initial query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="Search ThePornDB…"
          disabled={disabled}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-50"
        />
        <button
          type="button"
          onClick={search}
          disabled={disabled || searching || q.trim().length < 2}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {selected ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setSelected(null)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              ← Back to performers
            </button>
            <span className="text-sm text-white">{selected.name}</span>
            {selected.disambiguation && (
              <span className="text-xs text-zinc-500">{selected.disambiguation}</span>
            )}
          </div>

          {selected.images.length === 0 ? (
            <p className="text-xs text-zinc-500">No images on file for this performer.</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500">
                Pick an image ({selected.images.length} available)
              </p>
              <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                {selected.images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(selected, img)}
                    className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 hover:border-brand-500/60 disabled:opacity-50"
                    title={
                      img.width && img.height ? `${img.width}×${img.height}` : "Use this image"
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    {img.width && img.height && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[10px] text-zinc-300">
                        {img.width}×{img.height}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {matches.length === 0 && !searching && q.trim().length >= 2 && (
            <p className="text-xs text-zinc-500">No performers found.</p>
          )}
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {matches.map((m) => {
              const preview = m.images[0]?.url;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelected(m)}
                    className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-left hover:border-brand-500/40 disabled:opacity-50"
                  >
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">
                        ?
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{m.name}</span>
                      {m.disambiguation && (
                        <span className="block truncate text-xs text-zinc-500">
                          {m.disambiguation}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {m.images.length} img{m.images.length === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
