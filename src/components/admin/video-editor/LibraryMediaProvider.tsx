"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_PROXY_DURATION_SEC } from "@/lib/video-editor-limits";
import {
  type EditorClip,
  type LibraryVideo,
  newClipId,
  numberedClipTitle,
  suggestNextClipRange,
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
    library: {
      q: string;
      onQueryChange: (q: string) => void;
      onSearch: () => void;
      searching: boolean;
      results: LibraryVideo[];
      selected: LibraryVideo[];
      onToggle: (v: LibraryVideo) => void;
      onAddToTimeline: () => void;
      onAddVideoClip: (v: LibraryVideo) => void;
      note: string | null;
    };
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

  function handleSiteChange(id: string) {
    setSiteId(id);
    setSelected([]);
    setResults([]);
    setClips([]);
    setNote(null);
  }

  function toggle(v: LibraryVideo) {
    setSelected((prev) => {
      const exists = prev.some((x) => x.id === v.id);
      if (exists) return prev.filter((x) => x.id !== v.id);
      return [...prev, v];
    });
  }

  const videoIds = selected.map((v) => v.id);

  function addSelectedToTimeline() {
    if (selected.length === 0) {
      setNote("Select at least one video.");
      return;
    }
    const next = selected.map(defaultClipFromVideo);
    setClips((prev) => [...prev, ...next]);
    setNote(`Added ${next.length} clip${next.length === 1 ? "" : "s"}. Use + Another clip to cut more segments.`);
  }

  function addVideoClip(v: LibraryVideo) {
    const clip = defaultClipFromVideo(v);
    setClips((prev) => [...prev, clip]);
    setNote(`Added "${v.title.slice(0, 36)}${v.title.length > 36 ? "…" : ""}". Set In/Out, then + Another clip for more.`);
  }

  const library = {
    q,
    onQueryChange: setQ,
    onSearch: () => void runSearch(),
    searching,
    results,
    selected,
    onToggle: toggle,
    onAddToTimeline: addSelectedToTimeline,
    onAddVideoClip: addVideoClip,
    note,
  };

  return (
    <>
      {children({
        siteId,
        setSiteId: handleSiteChange,
        sites,
        logoUrl,
        selected,
        videoIds,
        clips,
        setClips,
        library,
      })}
    </>
  );
}
