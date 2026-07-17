"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_PROXY_DURATION_SEC } from "@/lib/video-editor-limits";
import {
  type EditorClip,
  type LibraryVideo,
  newClipId,
} from "@/lib/video-editor-types";

type SiteRow = {
  id: string;
  name: string;
  kind: string;
  logoPath: string | null;
};

function defaultClipFromVideo(v: LibraryVideo): EditorClip {
  const dur = v.durationSec && v.durationSec > 0 ? v.durationSec : DEFAULT_PROXY_DURATION_SEC;
  const end = Math.min(DEFAULT_PROXY_DURATION_SEC, dur);
  return {
    id: newClipId(v.id),
    videoId: v.id,
    title: v.title,
    startSec: 0,
    endSec: end,
  };
}

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
    clips: EditorClip[];
    setClips: (clips: EditorClip[]) => void;
    appendClips: (clips: EditorClip[]) => void;
    searchUi: React.ReactNode;
  }) => React.ReactNode;
}) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LibraryVideo[]>([]);
  const [selected, setSelected] = useState<LibraryVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [clips, setClips] = useState<EditorClip[]>([]);
  const [note, setNote] = useState<string | null>(null);

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
  }

  const videoIds = selected.map((v) => v.id);

  const appendClips = useCallback((next: EditorClip[]) => {
    setClips((prev) => [...prev, ...next]);
    setNote(
      next.length
        ? `Added ${next.length} clip${next.length === 1 ? "" : "s"} to the timeline.`
        : null
    );
  }, []);

  function addSelectedToTimeline() {
    if (selected.length === 0) {
      setNote("Select at least one video.");
      return;
    }
    appendClips(selected.map(defaultClipFromVideo));
  }

  const searchUi = (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div>
        <h2 className="text-sm font-medium text-zinc-200">Library</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Search and add videos to the timeline. Trim each clip in the editor below. Long sources
          use admin stream + server render — no full download in the browser.
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
            setClips([]);
            setNote(null);
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
        <div className="space-y-2 border-t border-zinc-800 pt-3">
          <p className="text-xs text-zinc-500">
            {selected.length} selected · {clips.length} on timeline
          </p>
          <button
            type="button"
            onClick={addSelectedToTimeline}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
          >
            Add selected to timeline
          </button>
        </div>
      )}

      {note && <p className="text-xs text-emerald-400/90">{note}</p>}
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
        clips,
        setClips,
        appendClips,
        searchUi,
      })}
    </>
  );
}
