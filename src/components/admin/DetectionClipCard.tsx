"use client";

import { useEffect, useState } from "react";
import AdminClipPlayer from "@/components/admin/AdminClipPlayer";
import { formatEditorDuration } from "@/lib/video-editor-format";

export type DetectionClip = {
  id: string;
  videoId: string;
  videoTitle: string;
  label: string;
  startSec: number;
  endSec: number;
  screenX?: number | null;
  screenY?: number | null;
  screenW?: number | null;
  screenH?: number | null;
  confidence?: number | null;
  manual?: boolean;
  feedback?: { approved: boolean } | null;
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTimeInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const parts = t.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export default function DetectionClipCard({
  detection,
  onFeedback,
  onUpdate,
  onDelete,
  labelOptions = [],
  busy,
  showDownload = false,
  showGifDownload = false,
  downloadHref,
  downloadFilename,
  gifDownloadHref,
  gifDownloadFilename,
  autoStart = true,
  showClipLength = false,
  showFeedbackActions = true,
}: {
  detection: DetectionClip;
  onFeedback: (detectionId: string, approved: boolean) => Promise<void>;
  onUpdate?: (
    detectionId: string,
    patch: { label: string; startSec: number; endSec: number }
  ) => Promise<void>;
  onDelete?: (detectionId: string) => Promise<void>;
  labelOptions?: string[];
  busy?: boolean;
  showDownload?: boolean;
  showGifDownload?: boolean;
  downloadHref?: string;
  downloadFilename?: string;
  gifDownloadHref?: string;
  gifDownloadFilename?: string;
  /** When false, show a poster + play button instead of autoplaying. */
  autoStart?: boolean;
  /** Show clip duration on the preview and in metadata (Ad clips grid). */
  showClipLength?: boolean;
  /** Approve / reject controls (pending review). */
  showFeedbackActions?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(detection.label);
  const [editStart, setEditStart] = useState(formatTime(detection.startSec));
  const [editEnd, setEditEnd] = useState(formatTime(detection.endSec));
  const [editBusy, setEditBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingGif, setDownloadingGif] = useState(false);
  const [playing, setPlaying] = useState(autoStart);
  const [poster, setPoster] = useState<string | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    if (!editing) {
      setEditLabel(detection.label);
      setEditStart(formatTime(detection.startSec));
      setEditEnd(formatTime(detection.endSec));
    }
  }, [detection, editing]);

  useEffect(() => {
    setPlaying(autoStart);
  }, [autoStart, detection.id, detection.startSec, detection.endSec]);

  useEffect(() => {
    if (autoStart) return;
    let cancelled = false;
    setPoster(null);
    setPosterFailed(false);

    if (showClipLength || detection.label === "compiled") {
      setPoster(`/api/admin/videos/${detection.videoId}/poster`);
      return () => {
        cancelled = true;
      };
    }

    void fetch(`/api/admin/videos/${detection.videoId}/player-meta`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.poster) setPoster(data.poster);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [autoStart, detection.videoId, detection.label, showClipLength]);

  const voted = detection.feedback != null;
  const approved = detection.feedback?.approved;

  const hasBox =
    detection.screenX != null &&
    detection.screenY != null &&
    detection.screenW != null &&
    detection.screenH != null;

  const clipDurationSec = Math.max(0, detection.endSec - detection.startSec);

  async function handleDownload() {
    if (!downloadHref) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(downloadHref);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename || "clip.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleGifDownload() {
    if (!gifDownloadHref) return;
    setDownloadingGif(true);
    setError(null);
    try {
      const res = await fetch(gifDownloadHref);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `GIF export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = gifDownloadFilename || "clip.gif";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "GIF export failed");
    } finally {
      setDownloadingGif(false);
    }
  }

  async function saveEdit() {
    if (!onUpdate) return;
    const startSec = parseTimeInput(editStart);
    const endSec = parseTimeInput(editEnd);
    if (startSec == null || endSec == null) {
      setError("Invalid time format");
      return;
    }
    setEditBusy(true);
    setError(null);
    try {
      await onUpdate(detection.id, {
        label: editLabel.trim(),
        startSec,
        endSec,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="relative aspect-video bg-black">
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-3 text-center text-xs text-red-400">
            {error}
          </div>
        )}
        {showClipLength && !editing && (
          <span className="absolute bottom-3 right-3 z-10 rounded bg-black/75 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatEditorDuration(clipDurationSec)}
          </span>
        )}
        {!editing && !playing && !autoStart && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 z-[5] flex items-center justify-center bg-zinc-950"
            aria-label={`Play ${detection.videoTitle}`}
          >
            {poster && !posterFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={poster}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-70"
                onError={() => setPosterFailed(true)}
              />
            ) : null}
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-2 ring-white/20 hover:bg-brand-500">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-7 w-7 fill-current" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
        {!editing && (autoStart || playing) && (
          <>
            <AdminClipPlayer
              key={`${detection.videoId}-${detection.startSec}-${detection.endSec}`}
              videoId={detection.videoId}
              initialPositionSec={detection.startSec}
              clipLoop={{ startSec: detection.startSec, endSec: detection.endSec }}
              autoStart
              muted
            />
            {hasBox && (
              <div
                className="pointer-events-none absolute inset-0 z-20 border-2 border-transparent"
                aria-hidden
              >
                <div
                  className="absolute border-2 border-amber-400/90 bg-amber-400/10"
                  style={{
                    left: `${(detection.screenX ?? 0) * 100}%`,
                    top: `${(detection.screenY ?? 0) * 100}%`,
                    width: `${(detection.screenW ?? 0) * 100}%`,
                    height: `${(detection.screenH ?? 0) * 100}%`,
                  }}
                  title="Detected region"
                />
              </div>
            )}
          </>
        )}
        {editing && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Edit times below, then save to refresh preview
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium text-white">{detection.videoTitle}</p>
          {detection.label === "compiled" && (
            <span className="shrink-0 rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
              Compiled
            </span>
          )}
          {detection.manual && detection.label !== "compiled" && (
            <span className="shrink-0 rounded bg-violet-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-300">
              Manual
            </span>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400">
              Label
              <input
                list={`labels-${detection.id}`}
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
              />
              <datalist id={`labels-${detection.id}`}>
                {labelOptions.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-zinc-400">
                Start
                <input
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                End
                <input
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={editBusy}
                onClick={saveEdit}
                className="flex-1 rounded-lg bg-brand-600 px-2 py-1.5 text-xs text-white hover:bg-brand-500 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-brand-300">{detection.label}</p>
            <p className="text-xs text-zinc-400">
              {showClipLength && (
                <span className="mr-2 font-medium text-zinc-200">
                  {formatEditorDuration(clipDurationSec)}
                </span>
              )}
              {formatTime(detection.startSec)} – {formatTime(detection.endSec)}
              {detection.confidence != null && (
                <span className="ml-2 text-zinc-500">
                  {(detection.confidence * 100).toFixed(0)}% conf.
                </span>
              )}
            </p>
          </>
        )}

        {!editing && (
          <div className="flex flex-wrap gap-2 pt-1">
            {showDownload && downloadHref && (
              <button
                type="button"
                disabled={downloading || downloadingGif}
                onClick={() => void handleDownload()}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {downloading ? "Preparing…" : "Download"}
              </button>
            )}
            {showGifDownload && gifDownloadHref && (
              <button
                type="button"
                disabled={downloading || downloadingGif}
                onClick={() => void handleGifDownload()}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {downloadingGif ? "Creating GIF…" : "Download GIF"}
              </button>
            )}
            {onUpdate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                Edit
              </button>
            )}
            {showFeedbackActions && (
              <>
                <button
                  type="button"
                  disabled={busy || voted}
                  onClick={() => onFeedback(detection.id, true)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${
                    approved === true
                      ? "bg-emerald-800 text-emerald-100"
                      : "bg-zinc-800 text-zinc-200 hover:bg-emerald-900/60 hover:text-emerald-200"
                  } disabled:opacity-50`}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy || voted}
                  onClick={() => onFeedback(detection.id, false)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${
                    approved === false
                      ? "bg-red-900 text-red-100"
                      : "bg-zinc-800 text-zinc-200 hover:bg-red-900/60 hover:text-red-200"
                  } disabled:opacity-50`}
                >
                  Reject
                </button>
              </>
            )}
            {onDelete && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(detection.id)}
                className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300 hover:bg-red-900 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        )}
        {voted && !editing && (
          <p className="text-center text-xs text-zinc-500">
            {approved ? "Approved — saved for training" : "Rejected — saved for training"}
            {detection.manual ? "" : " · Edit times/label if the model was slightly off"}
          </p>
        )}
      </div>
    </div>
  );
}
