"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpenReelImportItem } from "./OpenReelFrame";

export type LibraryVideo = {
  id: string;
  title: string;
  slug: string;
  durationSec: number | null;
  status: string;
};

type SiteRow = {
  id: string;
  name: string;
  kind: string;
  logoPath: string | null;
};

/**
 * Site picker + library search multi-select that produces OpenReel import items
 * (same-origin stream URLs) and optional site logo.
 */
export default function LibraryMediaProvider({
  children,
}: {
  children: (ctx: {
    siteId: string;
    setSiteId: (id: string) => void;
    sites: SiteRow[];
    logoUrl: string | null;
    selected: LibraryVideo[];
    videoIds: string[];
    importItems: OpenReelImportItem[];
    setSegmentItems: (items: OpenReelImportItem[]) => void;
    searchUi: React.ReactNode;
  }) => React.ReactNode;
}) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LibraryVideo[]>([]);
  const [selected, setSelected] = useState<LibraryVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [segmentItems, setSegmentItems] = useState<OpenReelImportItem[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/sites");
      const data = await res.json();
      if (!res.ok) return;
      const list = (data.sites as SiteRow[]).filter((s) => s.kind === "TUBE" || s.kind === "STUDIO");
      setSites(list);
      if (list[0] && !siteId) setSiteId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const logoUrl = useMemo(() => {
    const site = sites.find((s) => s.id === siteId);
    return site?.logoPath || null;
  }, [sites, siteId]);

  const runSearch = useCallback(async () => {
    if (!siteId || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/videos/search?q=${encodeURIComponent(q.trim())}&siteId=${encodeURIComponent(siteId)}&limit=24`
      );
      const data = await res.json();
      if (res.ok) setResults((data.videos || []) as LibraryVideo[]);
    } finally {
      setSearching(false);
    }
  }, [q, siteId]);

  function toggle(v: LibraryVideo) {
    setSelected((prev) => {
      const exists = prev.some((x) => x.id === v.id);
      if (exists) return prev.filter((x) => x.id !== v.id);
      return [...prev, v];
    });
    setSegmentItems(null);
  }

  const videoIds = selected.map((v) => v.id);

  const importItems: OpenReelImportItem[] = useMemo(() => {
    if (segmentItems?.length) return segmentItems;
    return selected.map((v) => ({
      id: v.id,
      title: v.title,
      url: `/api/admin/videos/${v.id}/stream`,
      kind: "video" as const,
      sourceVideoId: v.id,
    }));
  }, [selected, segmentItems]);

  const searchUi = (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div>
        <h2 className="text-sm font-medium text-zinc-200">Library</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Pick a site and videos to import into OpenReel (streamed same-origin).
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Site</span>
        <select
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value);
            setSelected([]);
            setResults([]);
            setSegmentItems(null);
          }}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Search videos…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={searching || q.trim().length < 2}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {results.map((v) => {
            const on = selected.some((x) => x.id === v.id);
            return (
              <li key={v.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-800/80">
                  <input type="checkbox" checked={on} onChange={() => toggle(v)} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block truncate text-zinc-200">{v.title}</span>
                    <span className="text-xs text-zinc-500">
                      {v.durationSec != null ? `${Math.round(v.durationSec / 60)} min` : "—"} ·{" "}
                      {v.status}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-zinc-500">
          {selected.length} selected
          {segmentItems?.length ? ` · AI packed ${segmentItems.length} segment(s)` : ""}
        </p>
      )}
    </div>
  );

  return (
    <>
      {children({
        siteId,
        setSiteId,
        sites,
        logoUrl,
        selected,
        videoIds,
        importItems,
        setSegmentItems,
        searchUi,
      })}
    </>
  );
}
