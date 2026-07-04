"use client";

import DetectionClipCard, { type DetectionClip } from "@/components/admin/DetectionClipCard";

export type ApprovedClip = DetectionClip & { runId?: string };

export default function ApprovedClipGrid({
  clips,
  selectedIds,
  onToggle,
  selectable = true,
}: {
  clips: ApprovedClip[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  selectable?: boolean;
}) {
  if (clips.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
        No approved clips yet. Approve detections on a Video Agent run first.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {clips.map((clip) => {
        const selected = selectedIds.has(clip.id);
        return (
          <div key={clip.id} className="relative">
            {selectable && (
              <label className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-lg bg-black/70 px-2 py-1 text-xs text-white">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(clip.id)}
                  className="rounded border-zinc-600"
                />
                Select
              </label>
            )}
            <div
              className={
                selected ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-zinc-950 rounded-xl" : ""
              }
            >
              <DetectionClipCard
                detection={clip}
                onFeedback={async () => {}}
                busy
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
