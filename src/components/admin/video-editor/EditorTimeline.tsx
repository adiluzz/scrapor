"use client";

import type { EditorClip } from "@/lib/video-editor-types";
import { clipDurationSec } from "@/lib/video-editor-types";

function formatDur(sec: number) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function EditorTimeline({
  clips,
  selectedId,
  onSelect,
  onMove,
  onRemove,
  onDuplicate,
}: {
  clips: EditorClip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  if (clips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-500">
        No clips on the timeline. Search the library and click “Add to timeline”, or run AI
        highlight.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Timeline</h3>
        <span className="text-xs text-zinc-500">
          {clips.length} clip{clips.length === 1 ? "" : "s"}
        </span>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {clips.map((clip, index) => {
          const active = clip.id === selectedId;
          const dur = clipDurationSec(clip);
          return (
            <li
              key={clip.id}
              className={`min-w-[180px] max-w-[240px] shrink-0 rounded-xl border p-3 transition-colors ${
                active
                  ? "border-brand-500/60 bg-brand-950/30"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(clip.id)}
                className="w-full text-left"
              >
                <span className="block truncate text-sm font-medium text-zinc-100">
                  {index + 1}. {clip.title}
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
                  {formatDur(clip.startSec)} → {formatDur(clip.endSec)} ({formatDur(dur)})
                </span>
              </button>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMove(clip.id, -1)}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                  title="Move left"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={index === clips.length - 1}
                  onClick={() => onMove(clip.id, 1)}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                  title="Move right"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicate(clip.id)}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(clip.id)}
                  className="rounded border border-red-900/60 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-950/40"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
