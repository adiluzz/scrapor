"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorClip, EditorCrop, LibraryVideo } from "@/lib/video-editor-types";
import type { ClipRange } from "@/components/admin/ClipRangeSelector";
import {
  MIN_CLIP_DURATION_SEC,
  clipDurationSec,
  defaultCrop,
  newClipId,
  numberedClipTitle,
  suggestNextClipRange,
  totalTimelineDuration,
} from "@/lib/video-editor-types";
import { DEFAULT_PROXY_DURATION_SEC } from "@/lib/video-editor-limits";
import { formatEditorDuration } from "@/lib/video-editor-format";
import ClipRangeSelector, {
  type ClipRangeSelectorHandle,
} from "@/components/admin/ClipRangeSelector";
import VideoEditorAiPanel from "@/components/admin/VideoEditorAiPanel";
import VideoEditorSavePanel from "@/components/admin/VideoEditorSavePanel";
import EditorLibraryPanel from "@/components/admin/video-editor/EditorLibraryPanel";
import EditorTimeline, {
  applyRippleTrim,
  applyRoll,
} from "@/components/admin/video-editor/EditorTimeline";

type SiteRow = { id: string; name: string; kind: string; logoPath: string | null };
type InspectorTab = "clip" | "export" | "ai";

export default function ScraporVideoEditor({
  siteId,
  sites,
  onSiteChange,
  library,
  clips,
  onClipsChange,
  jobId,
  onJobId,
  videoIds,
}: {
  siteId: string;
  sites: SiteRow[];
  onSiteChange: (id: string) => void;
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
  clips: EditorClip[];
  onClipsChange: React.Dispatch<React.SetStateAction<EditorClip[]>>;
  jobId?: string | null;
  onJobId?: (id: string) => void;
  videoIds: string[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("clip");
  const [playheadSec, setPlayheadSec] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(48);
  const [showCrop, setShowCrop] = useState(false);
  const [sourceDurationSec, setSourceDurationSec] = useState(0);
  const prevClipCount = useRef(clips.length);
  const clipSelectorRef = useRef<ClipRangeSelectorHandle>(null);

  useEffect(() => {
    if (clips.length > prevClipCount.current && clips.length > 0) {
      setSelectedId(clips[clips.length - 1].id);
    }
    prevClipCount.current = clips.length;
  }, [clips]);

  useEffect(() => {
    if (clips.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !clips.some((c) => c.id === selectedId)) {
      setSelectedId(clips[clips.length - 1]?.id ?? null);
    }
  }, [clips, selectedId]);

  const selected = clips.find((c) => c.id === selectedId) ?? null;
  const totalSec = totalTimelineDuration(clips);
  const selectedIndex = selected ? clips.findIndex((c) => c.id === selected.id) : -1;

  const updateClip = useCallback(
    (
      id: string,
      patch: Partial<Pick<EditorClip, "startSec" | "endSec" | "title" | "crop">>
    ) => {
      onClipsChange((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const next = { ...c, ...patch };
          if ("crop" in patch && patch.crop === undefined) {
            delete next.crop;
          }
          return next;
        })
      );
    },
    [onClipsChange]
  );

  const moveClip = useCallback(
    (id: string, direction: -1 | 1) => {
      const idx = clips.findIndex((c) => c.id === id);
      if (idx < 0) return;
      const next = idx + direction;
      if (next < 0 || next >= clips.length) return;
      const copy = [...clips];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      onClipsChange(copy);
    },
    [clips, onClipsChange]
  );

  const removeClip = useCallback(
    (id: string) => {
      onClipsChange(clips.filter((c) => c.id !== id));
    },
    [clips, onClipsChange]
  );

  const duplicateClip = useCallback(
    (id: string) => {
      const src = clips.find((c) => c.id === id);
      if (!src) return;
      const dup: EditorClip = { ...src, id: newClipId(src.videoId), crop: src.crop ? { ...src.crop } : undefined };
      const idx = clips.findIndex((c) => c.id === id);
      const copy = [...clips];
      copy.splice(idx + 1, 0, dup);
      onClipsChange(copy);
      setSelectedId(dup.id);
    },
    [clips, onClipsChange]
  );

  const addAnotherClipFromSource = useCallback(
    (savedRange: ClipRange) => {
      if (!selectedId) return;
      onClipsChange((prev) => {
        const idx = prev.findIndex((c) => c.id === selectedId);
        if (idx < 0) return prev;
        const current = {
          ...prev[idx],
          startSec: savedRange.startSec,
          endSec: savedRange.endSec,
        };
        const afterSec = Math.max(current.endSec, playheadSec);
        const { startSec, endSec } = suggestNextClipRange(
          sourceDurationSec,
          afterSec,
          DEFAULT_PROXY_DURATION_SEC
        );
        const index = prev.filter((c) => c.videoId === current.videoId).length + 1;
        const newClip: EditorClip = {
          id: newClipId(current.videoId),
          videoId: current.videoId,
          title: numberedClipTitle(current.title, index),
          startSec,
          endSec,
        };
        const next = prev.map((c, i) => (i === idx ? current : c));
        return [...next, newClip];
      });
    },
    [selectedId, playheadSec, sourceDurationSec, onClipsChange]
  );

  const addAnotherClipFromCurrent = useCallback(() => {
    if (!selected) return;
    addAnotherClipFromSource({
      startSec: selected.startSec,
      endSec: selected.endSec,
    });
  }, [selected, addAnotherClipFromSource]);

  const onRippleTrim = useCallback(
    (id: string, side: "in" | "out", newSec: number) => {
      onClipsChange(applyRippleTrim(clips, id, side, newSec));
    },
    [clips, onClipsChange]
  );

  const onRoll = useCallback(
    (editIndex: number, aEndSec: number, bStartSec: number) => {
      onClipsChange(applyRoll(clips, editIndex, aEndSec, bStartSec));
    },
    [clips, onClipsChange]
  );

  const splitAtPlayhead = useCallback(() => {
    if (!selected) return;
    const t = playheadSec;
    if (t <= selected.startSec + MIN_CLIP_DURATION_SEC * 0.5) return;
    if (t >= selected.endSec - MIN_CLIP_DURATION_SEC * 0.5) return;
    const idx = clips.findIndex((c) => c.id === selected.id);
    if (idx < 0) return;
    const left: EditorClip = {
      ...selected,
      id: newClipId(selected.videoId),
      endSec: t,
      crop: selected.crop ? { ...selected.crop } : undefined,
    };
    const right: EditorClip = {
      ...selected,
      id: newClipId(selected.videoId),
      startSec: t,
      crop: selected.crop ? { ...selected.crop } : undefined,
    };
    const copy = [...clips];
    copy.splice(idx, 1, left, right);
    onClipsChange(copy);
    setSelectedId(right.id);
  }, [selected, playheadSec, clips, onClipsChange]);

  const skipPlayhead = useCallback((delta: number) => {
    clipSelectorRef.current?.skip(delta);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          removeClip(selectedId);
        }
      } else if (e.key === "s" || e.key === "S" || e.key === "c" || e.key === "C") {
        e.preventDefault();
        splitAtPlayhead();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, removeClip, splitAtPlayhead]);

  const onSegmentsReady = useCallback(
    (
      segments: { videoId: string; title: string; startSec: number; endSec: number }[],
      id: string
    ) => {
      onJobId?.(id);
      const incoming = segments.map((s) => ({
        id: newClipId(s.videoId),
        videoId: s.videoId,
        title: s.title,
        startSec: s.startSec,
        endSec: s.endSec,
      }));
      onClipsChange((prev) => (prev.length === 0 ? incoming : [...prev, ...incoming]));
      setInspectorTab("clip");
    },
    [onClipsChange, onJobId]
  );

  const canSplit =
    !!selected &&
    playheadSec > selected.startSec + MIN_CLIP_DURATION_SEC * 0.5 &&
    playheadSec < selected.endSec - MIN_CLIP_DURATION_SEC * 0.5;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 sm:gap-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-200">
            {clips.length === 0 ? "New edit" : `${clips.length} clips · ${formatEditorDuration(totalSec)}`}
          </p>
          <p className="hidden text-[11px] text-zinc-600 sm:block">
            ←/→ skip · Space play · I/O trim · S split · click timeline to change clip
          </p>
        </div>
        <button
          type="button"
          disabled={!selected}
          onClick={addAnotherClipFromCurrent}
          className="rounded-md border border-brand-500/40 bg-brand-950/20 px-2.5 py-1.5 text-xs text-brand-200 hover:bg-brand-950/40 disabled:opacity-40"
          title="Add another segment from the same source video"
        >
          + Clip
        </button>
        <button
          type="button"
          disabled={!canSplit}
          onClick={splitAtPlayhead}
          className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          title="Split at playhead (S)"
        >
          Split
        </button>
        <button
          type="button"
          onClick={() => {
            if (!showCrop) {
              if (selected && !selected.crop) {
                updateClip(selected.id, { crop: defaultCrop("16:9") });
              }
              setShowCrop(true);
            } else {
              setShowCrop(false);
            }
          }}
          className={`rounded-md border px-2.5 py-1.5 text-xs ${
            showCrop
              ? "border-brand-500/50 bg-brand-950/30 text-brand-200"
              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
          }`}
          title={
            showCrop
              ? "Hide crop overlay"
              : "Enable crop — drag yellow corners; None removes crop"
          }
        >
          Crop
        </button>
        {clips.length > 0 && (
          <button
            type="button"
            onClick={() => onClipsChange([])}
            className="text-xs text-zinc-500 hover:text-red-400"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setInspectorTab("export")}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 sm:text-sm"
        >
          Export
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="hidden min-h-0 lg:block">
          <EditorLibraryPanel
            sites={sites}
            siteId={siteId}
            onSiteChange={onSiteChange}
            q={library.q}
            onQueryChange={library.onQueryChange}
            onSearch={library.onSearch}
            searching={library.searching}
            results={library.results}
            selected={library.selected}
            onToggle={library.onToggle}
            onAddToTimeline={library.onAddToTimeline}
            onAddVideoClip={library.onAddVideoClip}
            clipCount={clips.length}
            note={library.note}
          />
        </div>

        <main className="flex min-h-0 flex-col border-zinc-800 lg:border-x">
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {selected ? (
              <div className="mx-auto max-w-4xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-medium text-zinc-200">{selected.title}</h3>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                    Clip {selectedIndex + 1}/{clips.length} · {clipDurationSec(selected).toFixed(1)}s
                  </span>
                </div>
                <ClipRangeSelector
                  ref={clipSelectorRef}
                  key={selected.id}
                  clipId={selected.id}
                  compact
                  videoId={selected.videoId}
                  initialRange={{ startSec: selected.startSec, endSec: selected.endSec }}
                  onRangeChange={(range) => updateClip(selected.id, range)}
                  showCrop={showCrop && !!selected.crop}
                  crop={selected.crop}
                  onCropChange={(c: EditorCrop) => updateClip(selected.id, { crop: c })}
                  onClearCrop={() => {
                    updateClip(selected.id, { crop: undefined });
                    setShowCrop(false);
                  }}
                  onCurrentTimeChange={setPlayheadSec}
                  onSourceDuration={setSourceDurationSec}
                  onAddAnotherClip={addAnotherClipFromSource}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center">
                <p className="text-sm text-zinc-400">No clip selected</p>
                <p className="mt-1 max-w-sm text-xs text-zinc-600">
                  Add videos from the library or AI highlight. Drag yellow handles to ripple-trim;
                  red bars to roll; S to split.
                </p>
              </div>
            )}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col border-t border-zinc-800 lg:border-t-0">
          <div className="flex shrink-0 border-b border-zinc-800">
            {(
              [
                ["clip", "Clip"],
                ["export", "Export"],
                ["ai", "AI"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setInspectorTab(id)}
                className={`flex-1 px-2 py-2.5 text-xs font-medium sm:text-sm ${
                  inspectorTab === id
                    ? "border-b-2 border-brand-500 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {inspectorTab === "clip" && (
              <div className="space-y-3 text-sm">
                {selected ? (
                  <>
                    <label className="block space-y-1">
                      <span className="text-xs text-zinc-500">Display name</span>
                      <input
                        value={selected.title}
                        onChange={(e) => updateClip(selected.id, { title: e.target.value })}
                        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                      />
                    </label>
                    <dl className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">In</dt>
                        <dd className="tabular-nums text-zinc-300">{selected.startSec.toFixed(2)}s</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Out</dt>
                        <dd className="tabular-nums text-zinc-300">{selected.endSec.toFixed(2)}s</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Playhead</dt>
                        <dd className="tabular-nums text-zinc-300">{playheadSec.toFixed(2)}s</dd>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-zinc-800 pt-2">
                        <dt className="text-zinc-500">Duration</dt>
                        <dd className="tabular-nums font-medium text-brand-300">
                          {clipDurationSec(selected).toFixed(2)}s
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Crop</dt>
                        <dd className="text-zinc-300">{selected.crop ? selected.crop.aspect : "none"}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={addAnotherClipFromCurrent}
                      className="w-full rounded-md border border-brand-500/40 bg-brand-950/20 py-1.5 text-xs text-brand-200 hover:bg-brand-950/40"
                    >
                      + Add to timeline
                    </button>
                    <p className="text-[11px] leading-snug text-zinc-600">
                      Trim In/Out for this segment, then add another clip to cut a different
                      range from the same source. Each clip can have its own crop.
                    </p>
                    <button
                      type="button"
                      disabled={!canSplit}
                      onClick={splitAtPlayhead}
                      className="w-full rounded-md border border-zinc-700 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      Split at playhead
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-zinc-600">Select a timeline clip to edit its properties.</p>
                )}
              </div>
            )}
            {inspectorTab === "export" && (
              <VideoEditorSavePanel compact siteId={siteId} jobId={jobId} clips={clips} />
            )}
            {inspectorTab === "ai" && (
              <VideoEditorAiPanel
                compact
                siteId={siteId}
                videoIds={videoIds}
                onSegmentsReady={onSegmentsReady}
              />
            )}
          </div>
        </aside>
      </div>

      <details className="border-t border-zinc-800 lg:hidden">
        <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-zinc-400">
          Media library
        </summary>
        <div className="max-h-64 overflow-y-auto">
          <EditorLibraryPanel
            sites={sites}
            siteId={siteId}
            onSiteChange={onSiteChange}
            q={library.q}
            onQueryChange={library.onQueryChange}
            onSearch={library.onSearch}
            searching={library.searching}
            results={library.results}
            selected={library.selected}
            onToggle={library.onToggle}
            onAddToTimeline={library.onAddToTimeline}
            onAddVideoClip={library.onAddVideoClip}
            clipCount={clips.length}
            note={library.note}
          />
        </div>
      </details>

      <footer className="shrink-0 border-t border-zinc-800 bg-zinc-900/50 px-3 py-3 sm:px-4">
        <EditorTimeline
          clips={clips}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={moveClip}
          onRemove={removeClip}
          onDuplicate={duplicateClip}
          onRippleTrim={onRippleTrim}
          onRoll={onRoll}
          onSkipSec={skipPlayhead}
          playheadSec={playheadSec}
          pixelsPerSecond={pixelsPerSecond}
          onPixelsPerSecondChange={setPixelsPerSecond}
        />
      </footer>
    </div>
  );
}
