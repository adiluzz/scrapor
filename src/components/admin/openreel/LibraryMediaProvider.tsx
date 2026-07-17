"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PROXY_DURATION_SEC,
  MAX_FULL_IMPORT_DURATION_SEC,
} from "@/lib/video-editor-limits";
import { editorClipUrl, type OpenReelImportItem } from "./OpenReelFrame";

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

function isLongVideo(v: LibraryVideo): boolean {
  return (v.durationSec ?? Number.POSITIVE_INFINITY) > MAX_FULL_IMPORT_DURATION_SEC;
}

/**
 * Site picker + library search. Does NOT auto-load full streams into OpenReel —
 * user must explicitly load (short full file, proxy clip, or AI segments).
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
  const [importItems, setImportItems] = useState<OpenReelImportItem[]>([]);
  const [loadNote, setLoadNote] = useState<string | null>(null);

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
    setImportItems([]);
    setLoadNote(null);
  }

  const videoIds = selected.map((v) => v.id);
  const longSelected = selected.filter(isLongVideo);
  const shortSelected = selected.filter((v) => !isLongVideo(v));

  function setSegmentItems(items: OpenReelImportItem[]) {
    setImportItems(items);
    setLoadNote(
      items.length
        ? `Loaded ${items.length} server-extracted segment(s) into OpenReel (safe for long sources).`
        : null
    );
  }

  function loadShortFull() {
    if (shortSelected.length === 0) {
      setLoadNote(
        `No videos ≤ ${MAX_FULL_IMPORT_DURATION_SEC / 60} min selected. For longer files use “Load ${DEFAULT_PROXY_DURATION_SEC}s proxy” or AI highlight.`
      );
      return;
    }
    const items: OpenReelImportItem[] = shortSelected.map((v) => ({
      id: v.id,
      title: v.title,
      url: `/api/admin/videos/${v.id}/stream`,
      kind: "video",
      sourceVideoId: v.id,
    }));
    setImportItems(items);
    setLoadNote(
      longSelected.length
        ? `Loaded ${items.length} short video(s). Skipped ${longSelected.length} long file(s) — use proxy or AI.`
        : `Loading ${items.length} full file(s) into OpenReel…`
    );
  }

  function loadProxy() {
    if (selected.length === 0) {
      setLoadNote("Select at least one video.");
      return;
    }
    const items: OpenReelImportItem[] = selected.map((v) => {
      const end = Math.min(
        DEFAULT_PROXY_DURATION_SEC,
        v.durationSec && v.durationSec > 0 ? v.durationSec : DEFAULT_PROXY_DURATION_SEC
      );
      return {
        id: `${v.id}-proxy-0-${end}`,
        title: `${v.title} (0–${end}s proxy)`,
        url: editorClipUrl(v.id, 0, end),
        kind: "video" as const,
        sourceVideoId: v.id,
        startSec: 0,
        endSec: end,
        pretrimmed: true,
      };
    });
    setImportItems(items);
    setLoadNote(
      `Extracting ${DEFAULT_PROXY_DURATION_SEC}s proxy clip(s) on the server, then loading into OpenReel…`
    );
  }

  const searchUi = (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div>
        <h2 className="text-sm font-medium text-zinc-200">Library</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Selecting a video does not download it. Full tube files crash the browser — load a short
          proxy, or use AI highlight (server-extracted segments).
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
            setImportItems([]);
            setLoadNote(null);
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
            const long = isLongVideo(v);
            return (
              <li key={v.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-800/80">
                  <input type="checkbox" checked={on} onChange={() => toggle(v)} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block truncate text-zinc-200">{v.title}</span>
                    <span className="text-xs text-zinc-500">
                      {v.durationSec != null ? `${Math.round(v.durationSec / 60)} min` : "—"} ·{" "}
                      {v.status}
                      {long ? " · long — proxy/AI only" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="space-y-2 border-t border-zinc-800 pt-3">
          <p className="text-xs text-zinc-500">
            {selected.length} selected
            {longSelected.length ? ` (${longSelected.length} long)` : ""}
            {importItems.length ? ` · ${importItems.length} loaded in editor` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadShortFull}
              disabled={shortSelected.length === 0}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              title={`Only videos ≤ ${MAX_FULL_IMPORT_DURATION_SEC / 60} minutes`}
            >
              Load short full file(s)
            </button>
            <button
              type="button"
              onClick={loadProxy}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
            >
              Load {DEFAULT_PROXY_DURATION_SEC}s proxy
            </button>
          </div>
        </div>
      )}

      {loadNote && <p className="text-xs text-amber-400/90">{loadNote}</p>}
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
