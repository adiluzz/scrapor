"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EditorClip } from "@/lib/video-editor-types";
import { segmentsFromClips } from "@/lib/video-editor-types";

/**
 * Export timeline: compile all clips into one video and add it to Ad clips.
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
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [savingClips, setSavingClips] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [compiledDetectionId, setCompiledDetectionId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const validClips = clips.filter((c) => c.endSec > c.startSec);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startCompilePoll(promoAdId: string) {
    stopPolling();
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/video-editor/compile/${promoAdId}`);
          const data = await res.json();
          if (!res.ok) {
            stopPolling();
            setCompiling(false);
            setError(data.error || "Compile status failed");
            setStatus(null);
            return;
          }
          if (data.status === "DONE") {
            stopPolling();
            setCompiling(false);
            setCompiledDetectionId(data.detectionId ?? null);
            setStatus(`Compiled video added to Ad clips: “${data.title}”. Publish from Ad clips when ready.`);
            return;
          }
          if (data.status === "ERROR") {
            stopPolling();
            setCompiling(false);
            setError(data.error || "Compile failed");
            setStatus(null);
            return;
          }
          setStatus(
            data.status === "GENERATING"
              ? "Compiling on server (FFmpeg)…"
              : "Queued for compile…"
          );
        } catch {
          stopPolling();
          setCompiling(false);
          setError("Lost connection while waiting for compile");
          setStatus(null);
        }
      })();
    }, 3000);
  }

  async function compileToAdClips() {
    if (validClips.length === 0 || !siteId) return;
    setCompiling(true);
    setError(null);
    setCompiledDetectionId(null);
    setStatus("Queueing compile…");
    try {
      const res = await fetch("/api/admin/video-editor/auto-render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          title: title.trim() || "Edited video",
          jobId: jobId || undefined,
          segments: segmentsFromClips(validClips),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Compile failed");
        setStatus(null);
        setCompiling(false);
        return;
      }
      if (!data.promoAdId) {
        setError("No compile job id returned");
        setStatus(null);
        setCompiling(false);
        return;
      }
      setStatus("Compiling on server (FFmpeg)…");
      startCompilePoll(data.promoAdId);
      void fetch(`/api/admin/video-editor/compile/${data.promoAdId}`);
    } catch {
      setError("Compile request failed");
      setStatus(null);
      setCompiling(false);
    }
  }

  async function saveSegmentsToAdClips() {
    if (validClips.length === 0 || !siteId) return;
    setSavingClips(true);
    setError(null);
    setStatus("Saving timeline segments to Ad clips…");
    try {
      const res = await fetch("/api/admin/video-editor/save-clips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          title: title.trim() || "Edited clips",
          segments: segmentsFromClips(validClips),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        setStatus(null);
        return;
      }
      setStatus(`Saved ${data.count} segment(s) to Ad clips (not compiled).`);
    } catch {
      setError("Save failed");
      setStatus(null);
    } finally {
      setSavingClips(false);
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
            Compile every timeline clip into one video (site logo in intro/outro, crossfades) and
            add it to Ad clips. Publish to a site from Ad clips when ready.
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

      {(error || status) && (
        <p className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>{error || status}</p>
      )}

      {compiledDetectionId && (
        <Link
          href="/admin/ad-clips"
          className="inline-block text-sm text-brand-300 underline hover:text-brand-200"
        >
          View on Ad clips →
        </Link>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={validClips.length === 0 || !siteId || compiling}
          onClick={() => void compileToAdClips()}
          className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {compiling
            ? "Compiling…"
            : compact
              ? "Compile & add to Ad clips"
              : `Compile ${validClips.length} clip(s) & add to Ad clips`}
        </button>
      </div>

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">
          More export options
        </summary>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            disabled={validClips.length === 0 || !siteId || savingClips || compiling}
            onClick={() => void saveSegmentsToAdClips()}
            className="w-full rounded-md border border-zinc-600 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
          >
            {savingClips ? "Saving…" : "Save segments only (no compile)"}
          </button>
          <p className="text-[11px] leading-snug text-zinc-600">
            Saves each timeline In/Out as separate clips on Ad clips — useful for re-editing later.
          </p>
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
            {uploading ? "Uploading…" : "Upload external MP4 to library"}
          </button>
        </div>
      </details>
    </div>
  );
}
