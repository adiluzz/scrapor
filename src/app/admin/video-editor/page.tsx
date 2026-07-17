"use client";

import { useCallback, useEffect, useState } from "react";
import LibraryMediaProvider from "@/components/admin/video-editor/LibraryMediaProvider";
import ScraporVideoEditor from "@/components/admin/video-editor/ScraporVideoEditor";
import VideoEditorAiPanel from "@/components/admin/VideoEditorAiPanel";
import { type EditorClip, newClipId } from "@/lib/video-editor-types";

type Tab = "editor" | "ai";

function VideoEditorWorkspace({
  siteId,
  videoIds,
  clips,
  setClips,
  searchUi,
}: {
  siteId: string;
  videoIds: string[];
  clips: EditorClip[];
  setClips: (clips: EditorClip[]) => void;
  searchUi: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("editor");
  const [jobId, setJobId] = useState<string | null>(null);
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
      const next: EditorClip[] = segments.map((s) => ({
        id: newClipId(s.videoId),
        videoId: s.videoId,
        title: s.title,
        startSec: s.startSec,
        endSec: s.endSec,
      }));
      setClips(next);
      setTab("editor");
      setControlsOpen(false);
    },
    [setClips]
  );

  return (
    <div className="flex min-h-screen flex-col">
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white sm:text-xl">Video editor</h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              Multi-clip timeline · server FFmpeg export · CDN-ready library publish
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-zinc-800 p-0.5">
              {(
                [
                  ["editor", "Timeline"],
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
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
                  <h2 className="text-sm font-medium text-zinc-200">Quick start</h2>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-zinc-500">
                    <li>Search the library and add videos to the timeline</li>
                    <li>Select each clip to set in/out points with the player</li>
                    <li>Reorder clips on the timeline strip</li>
                    <li>Render on server — FFmpeg composes with site logo and crossfades</li>
                    <li>Or use AI highlight to auto-find best moments</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-4 pt-3 sm:px-6">
        <ScraporVideoEditor
          siteId={siteId}
          clips={clips}
          onClipsChange={setClips}
          jobId={jobId}
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
      {(ctx) => (
        <VideoEditorWorkspace
          siteId={ctx.siteId}
          videoIds={ctx.videoIds}
          clips={ctx.clips}
          setClips={ctx.setClips}
          searchUi={ctx.searchUi}
        />
      )}
    </LibraryMediaProvider>
  );
}
