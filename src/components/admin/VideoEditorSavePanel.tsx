"use client";

import { useState } from "react";
import type { EditorClip } from "@/lib/video-editor-types";
import { segmentsFromClips } from "@/lib/video-editor-types";

/**
 * Export timeline to library via server FFmpeg compose (S3 sources → CDN-ready publish).
 */
export default function VideoEditorSavePanel({
  siteId,
  jobId,
  defaultTitle,
  clips = [],
  compact = false,
}: {
  siteId: string;
  jobId?: string | null;
  defaultTitle?: string;
  clips?: EditorClip[];
  compact?: boolean;
}) {
  const [title, setTitle] = useState(defaultTitle || "Edited video");
  const [logoPosition, setLogoPosition] = useState<
    "top-left" | "top-right" | "bottom-left" | "bottom-right"
  >("bottom-right");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const validClips = clips.filter((c) => c.endSec > c.startSec);

  async function serverRender() {
    if (validClips.length === 0) return;
    setRendering(true);
    setError(null);
    setStatus("Queueing FFmpeg compose on server…");
    try {
      const res = await fetch("/api/admin/video-editor/auto-render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          title: title.trim() || "Edited video",
          jobId: jobId || undefined,
          logoPosition,
          segments: segmentsFromClips(validClips),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Render failed");
        setStatus(null);
        return;
      }
      setStatus(
        `Render queued (promo ad ${data.promoAdId || "…"}). Check Admin → Ads when complete, or link to library in a future update.`
      );
    } catch {
      setError("Render request failed");
      setStatus(null);
    } finally {
      setRendering(false);
    }
  }

  async function uploadFile() {
    if (!file || !siteId) return;
    setUploading(true);
    setError(null);
    setStatus("Uploading to library (S3 + CDN)…");
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
      setStatus(`Saved to library: “${data.video?.title}” (${data.video?.slug})`);
      setFile(null);
    } catch {
      setError("Upload failed");
      setStatus(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"}>
      {!compact && (
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Export</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Server FFmpeg from timeline clips (S3 sources, logo + crossfades).
          </p>
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-white"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Logo position</span>
        <select
          value={logoPosition}
          onChange={(e) => setLogoPosition(e.target.value as typeof logoPosition)}
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-white"
        >
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="top-right">Top right</option>
          <option value="top-left">Top left</option>
        </select>
      </label>

      {(error || status) && (
        <p className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>{error || status}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={validClips.length === 0 || !siteId || rendering}
          onClick={() => void serverRender()}
          className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {rendering ? "Queuing…" : compact ? "Render on server" : `Render ${validClips.length} clip(s) on server`}
        </button>
      </div>

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">
          Upload external MP4 instead
        </summary>
        <div className="mt-3 space-y-2">
          <input
            type="file"
            accept="video/mp4,video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-white"
          />
          <button
            type="button"
            disabled={!file || !siteId || uploading}
            onClick={() => void uploadFile()}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload to library"}
          </button>
        </div>
      </details>
    </div>
  );
}
