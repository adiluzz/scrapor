"use client";

import DetectionClipCard, { type DetectionClip } from "@/components/admin/DetectionClipCard";
import { adClipDownloadFilename, adClipDownloadUrl } from "@/lib/ad-clip-download";

export type ApprovedClip = DetectionClip & {
  runId?: string;
  siteId?: string;
  siteName?: string;
};

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
        No clips yet. Use Export → <strong className="font-medium text-zinc-400">Compile &amp; add to Ad clips</strong> in the video editor.
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
            {clip.siteName && (
              <span className="absolute right-3 top-3 z-10 rounded-lg bg-black/70 px-2 py-1 text-[10px] text-zinc-300">
                {clip.siteName}
              </span>
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
                autoStart={false}
                showDownload
                downloadHref={adClipDownloadUrl(clip)}
                downloadFilename={adClipDownloadFilename(clip.videoTitle, clip.label)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
