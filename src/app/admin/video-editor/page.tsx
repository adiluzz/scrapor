"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import LibraryMediaProvider from "@/components/admin/video-editor/LibraryMediaProvider";
import ScraporVideoEditor from "@/components/admin/video-editor/ScraporVideoEditor";
import { type EditorClip, newClipId } from "@/lib/video-editor-types";

export default function AdminVideoEditorPage() {
  useEffect(() => {
    document.title = "Video editor · Admin";
  }, []);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
          Loading editor…
        </div>
      }
    >
      <VideoEditorWithParams />
    </Suspense>
  );
}

function VideoEditorWithParams() {
  const searchParams = useSearchParams();
  const [jobId, setJobId] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  return (
    <LibraryMediaProvider>
      {(ctx) => (
        <DetectionBootstrap
          detectionParam={searchParams.get("detections")}
          imported={imported}
          onImported={() => setImported(true)}
          setClips={ctx.setClips}
          siteId={ctx.siteId}
        >
          <ScraporVideoEditor
            siteId={ctx.siteId}
            sites={ctx.sites}
            onSiteChange={ctx.setSiteId}
            library={ctx.library}
            clips={ctx.clips}
            onClipsChange={ctx.setClips}
            jobId={jobId}
            onJobId={setJobId}
            videoIds={ctx.videoIds}
          />
        </DetectionBootstrap>
      )}
    </LibraryMediaProvider>
  );
}

function DetectionBootstrap({
  detectionParam,
  imported,
  onImported,
  setClips,
  siteId,
  children,
}: {
  detectionParam: string | null;
  imported: boolean;
  onImported: () => void;
  setClips: (clips: EditorClip[]) => void;
  siteId: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (imported || !detectionParam || !siteId) return;
    const ids = detectionParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      onImported();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/video-editor/detections?ids=${encodeURIComponent(ids.join(","))}`
        );
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const next: EditorClip[] = (data.clips || []).map(
          (d: {
            videoId: string;
            videoTitle: string;
            startSec: number;
            endSec: number;
            screenX?: number | null;
            screenY?: number | null;
            screenW?: number | null;
            screenH?: number | null;
          }) => ({
            id: newClipId(d.videoId),
            videoId: d.videoId,
            title: d.videoTitle,
            startSec: d.startSec,
            endSec: d.endSec,
            crop:
              d.screenW != null && d.screenH != null
                ? {
                    x: d.screenX ?? 0,
                    y: d.screenY ?? 0,
                    w: d.screenW,
                    h: d.screenH,
                    aspect: "16:9" as const,
                  }
                : undefined,
          })
        );
        if (next.length) setClips(next);
      } finally {
        if (!cancelled) onImported();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detectionParam, imported, onImported, setClips, siteId]);

  return <>{children}</>;
}
