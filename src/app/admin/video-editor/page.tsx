"use client";

import { useCallback, useEffect, useState } from "react";
import LibraryMediaProvider from "@/components/admin/openreel/LibraryMediaProvider";
import OpenReelFrame, { type OpenReelImportItem } from "@/components/admin/openreel/OpenReelFrame";
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
        url: `/api/admin/videos/${s.videoId}/stream`,
        kind: "video",
        sourceVideoId: s.videoId,
        startSec: s.startSec,
        endSec: s.endSec,
      }));
      setSegmentItems(items);
      setEditorKey((k) => k + 1);
      setTab("editor");
    },
    [setSegmentItems]
  );

  return (
    <>
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        {(
          [
            ["editor", "OpenReel"],
            ["ai", "AI highlight"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === id
                ? "bg-zinc-100 font-medium text-zinc-900"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
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

        <div className={tab === "ai" ? "opacity-60" : ""}>
          <OpenReelFrame key={editorKey} items={importItems} logoUrl={logoUrl} />
        </div>
      </div>
    </>
  );
}

export default function AdminVideoEditorPage() {
  useEffect(() => {
    document.title = "Video editor · Admin";
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Video editor</h1>
        <p className="mt-1 text-sm text-zinc-400">
          OpenReel NLE with library import, site logo overlay, and Bedrock AI highlights.
        </p>
      </div>

      <LibraryMediaProvider>
        {(ctx) => <VideoEditorWorkspace {...ctx} />}
      </LibraryMediaProvider>
    </div>
  );
}
