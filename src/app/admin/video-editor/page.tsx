"use client";

import { useCallback, useEffect, useState } from "react";
import LibraryMediaProvider from "@/components/admin/openreel/LibraryMediaProvider";
import OpenReelFrame, {
  editorClipUrl,
  type OpenReelImportItem,
} from "@/components/admin/openreel/OpenReelFrame";
import VideoEditorAiPanel from "@/components/admin/VideoEditorAiPanel";
import VideoEditorSavePanel from "@/components/admin/VideoEditorSavePanel";

type Tab = "editor" | "ai";

function VideoEditorWorkspace({
  siteId,
  logoUrl,
  videoIds,
  importItems,
  setSegmentItems,
  searchUi,
}: {
  siteId: string;
  logoUrl: string | null;
  videoIds: string[];
  importItems: OpenReelImportItem[];
  setSegmentItems: (items: OpenReelImportItem[]) => void;
  searchUi: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("editor");
  const [jobId, setJobId] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(true);

  const onSegmentsReady = useCallback(
    (
      segments: {
        videoId: string;
        title: string;
        startSec: number;
        endSec: number;
      }[],
      id: string
    ) => {
      setJobId(id);
      const items: OpenReelImportItem[] = segments.map((s, i) => ({
        id: `${s.videoId}-${i}-${s.startSec}`,
        title: `${s.title} (${s.startSec.toFixed(1)}–${s.endSec.toFixed(1)}s)`,
        url: editorClipUrl(s.videoId, s.startSec, s.endSec),
        kind: "video",
        sourceVideoId: s.videoId,
        startSec: s.startSec,
        endSec: s.endSec,
        pretrimmed: true,
      }));
      setSegmentItems(items);
      setEditorKey((k) => k + 1);
      setTab("editor");
      setControlsOpen(false);
    },
    [setSegmentItems]
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top toolbar + collapsible controls */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white sm:text-xl">Video editor</h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              Library & AI controls on top · OpenReel full width below
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-zinc-800 p-0.5">
              {(
                [
                  ["editor", "OpenReel"],
                  ["ai", "AI highlight"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id);
                    setControlsOpen(true);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    tab === id
                      ? "bg-zinc-100 font-medium text-zinc-900"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setControlsOpen((o) => !o)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
              aria-expanded={controlsOpen}
            >
              {controlsOpen ? "Hide controls" : "Show controls"}
            </button>
          </div>
        </div>

        {controlsOpen && (
          <div className="border-t border-zinc-800 bg-zinc-900/40 px-4 py-4 sm:px-6">
            <div className="grid gap-4 xl:grid-cols-2">
              {searchUi}
              {tab === "ai" ? (
                <VideoEditorAiPanel
                  siteId={siteId}
                  videoIds={videoIds}
                  onSegmentsReady={onSegmentsReady}
                />
              ) : (
                <VideoEditorSavePanel siteId={siteId} jobId={jobId} segments={importItems} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Full-width editor */}
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2 sm:px-4 sm:pb-4">
        <OpenReelFrame
          key={editorKey}
          items={importItems}
          logoUrl={logoUrl}
          tall
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

export default function AdminVideoEditorPage() {
  useEffect(() => {
    document.title = "Video editor · Admin";
  }, []);

  return (
    <LibraryMediaProvider>
      {(ctx) => <VideoEditorWorkspace {...ctx} />}
    </LibraryMediaProvider>
  );
}
