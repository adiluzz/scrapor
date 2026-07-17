"use client";

import { useCallback, useEffect, useState } from "react";
import ClipRangeSelector from "@/components/admin/ClipRangeSelector";
import VideoEditorSavePanel from "@/components/admin/VideoEditorSavePanel";
import EditorTimeline from "@/components/admin/video-editor/EditorTimeline";
import {
  type EditorClip,
  clipDurationSec,
  newClipId,
  totalTimelineDuration,
} from "@/lib/video-editor-types";

export default function ScraporVideoEditor({
  siteId,
  clips,
  onClipsChange,
  jobId,
}: {
  siteId: string;
  clips: EditorClip[];
  onClipsChange: (clips: EditorClip[]) => void;
  jobId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const updateClip = useCallback(
    (id: string, patch: Partial<Pick<EditorClip, "startSec" | "endSec" | "title">>) => {
      onClipsChange(clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [clips, onClipsChange]
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
      const dup: EditorClip = { ...src, id: newClipId(src.videoId) };
      const idx = clips.findIndex((c) => c.id === id);
      const copy = [...clips];
      copy.splice(idx + 1, 0, dup);
      onClipsChange(copy);
      setSelectedId(dup.id);
    },
    [clips, onClipsChange]
  );

  const totalSec = totalTimelineDuration(clips);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-zinc-400">
          {clips.length === 0
            ? "Build a multi-clip edit from your library"
            : `${clips.length} clip${clips.length === 1 ? "" : "s"} · ${totalSec.toFixed(1)}s total`}
        </p>
        {clips.length > 0 && (
          <button
            type="button"
            onClick={() => onClipsChange([])}
            className="text-xs text-zinc-500 hover:text-red-400"
          >
            Clear timeline
          </button>
        )}
      </div>

      <EditorTimeline
        clips={clips}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMove={moveClip}
        onRemove={removeClip}
        onDuplicate={duplicateClip}
      />

      {selected ? (
        <div className="min-h-0 flex-1 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-zinc-200">Trim: {selected.title}</h3>
            <span className="text-xs text-zinc-500">
              Clip length: {clipDurationSec(selected).toFixed(1)}s
            </span>
          </div>
          <ClipRangeSelector
            key={selected.id}
            videoId={selected.videoId}
            initialRange={{ startSec: selected.startSec, endSec: selected.endSec }}
            onRangeChange={(range) => updateClip(selected.id, range)}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-sm text-zinc-500">
          Select a clip on the timeline to preview and trim it.
        </div>
      )}

      <VideoEditorSavePanel siteId={siteId} jobId={jobId} clips={clips} />
    </div>
  );
}
