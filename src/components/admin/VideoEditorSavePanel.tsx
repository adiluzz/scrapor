"use client";

import { useState } from "react";
import type { OpenReelImportItem } from "@/components/admin/openreel/OpenReelFrame";

/**
 * Upload an OpenReel-exported MP4 into the library via the video-editor upload API.
 * Optional server FFmpeg fallback when browser export is too heavy.
 */
export default function VideoEditorSavePanel({
  siteId,
  jobId,
  defaultTitle,
  segments,
}: {
  siteId: string;
  jobId?: string | null;
  defaultTitle?: string;
  /** When AI/import items include in/out points, offer server render. */
  segments?: OpenReelImportItem[];
}) {
  const [title, setTitle] = useState(defaultTitle || "Edited video");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rendering, setRendering] = useState(false);

  const serverSegments = (segments || []).filter(
    (s) =>
      s.kind !== "image" &&
      s.sourceVideoId &&
      s.startSec != null &&
      s.endSec != null &&
      s.endSec > s.startSec
  );

  async function upload() {
    if (!file || !siteId) return;
    setUploading(true);
    setError(null);
    setStatus("Uploading…");
    try {
      const qs = new URLSearchParams({
        siteId,
        title: title.trim() || "Edited video",
      });
      if (jobId) qs.set("jobId", jobId);
      const res = await fetch(`/api/admin/video-editor/upload?${qs}`, {
        method: "POST",
        headers: { "content-type": file.type || "video/mp4" },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        setStatus(null);
        return;
      }
      setStatus(`Saved as “${data.video?.title}” (${data.video?.slug})`);
      setFile(null);
    } catch {
      setError("Upload failed");
      setStatus(null);
    } finally {
      setUploading(false);
    }
  }

  async function serverRender() {
    setRendering(true);
    setError(null);
    setStatus("Queueing FFmpeg compose…");
    try {
      const res = await fetch("/api/admin/video-editor/auto-render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          title: title.trim() || "Edited video",
          jobId: jobId || undefined,
          segments: serverSegments.map((s) => ({
            videoId: s.sourceVideoId,
            title: s.title,
            startSec: s.startSec,
            endSec: s.endSec,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Auto-render failed");
        setStatus(null);
        return;
      }
      setStatus(`Server render started (promo ad ${data.promoAdId || data.ad?.id || "queued"})`);
    } catch {
      setError("Auto-render request failed");
      setStatus(null);
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div>
        <h2 className="text-sm font-medium text-zinc-200">Save to library</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Export MP4 from OpenReel, then upload it here. For long sources, prefer AI Auto-render
          (server FFmpeg) if browser export fails.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Exported MP4</span>
        <input
          type="file"
          accept="video/mp4,video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-white"
        />
      </label>

      {(error || status) && (
        <p className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>{error || status}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!file || !siteId || uploading}
          onClick={() => void upload()}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload to library"}
        </button>
        {serverSegments.length > 0 && (
          <button
            type="button"
            disabled={!siteId || rendering}
            onClick={() => void serverRender()}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {rendering ? "Queuing…" : "Render on server"}
          </button>
        )}
      </div>
    </div>
  );
}
