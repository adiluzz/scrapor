"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  feedback?: { approved: boolean } | null;
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DetectionClipCard({
  detection,
  onFeedback,
  busy,
}: {
  detection: DetectionClip;
  onFeedback: (detectionId: string, approved: boolean) => Promise<void>;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStream = useCallback(async () => {
    setLoadingUrl(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/videos/${detection.videoId}/playback`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load video");
      setStreamUrl(data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingUrl(false);
    }
  }, [detection.videoId]);

  useEffect(() => {
    loadStream();
  }, [loadStream]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !streamUrl) return;

    const onLoaded = () => {
      el.currentTime = detection.startSec;
      el.play().catch(() => {});
    };

    const onTimeUpdate = () => {
      if (el.currentTime >= detection.endSec) {
        el.pause();
        el.currentTime = detection.startSec;
      }
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [streamUrl, detection.startSec, detection.endSec]);

  const voted = detection.feedback != null;
  const approved = detection.feedback?.approved;

  const hasBox =
    detection.screenX != null &&
    detection.screenY != null &&
    detection.screenW != null &&
    detection.screenH != null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="relative aspect-video bg-black">
        {loadingUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            Loading…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-red-400">
            {error}
          </div>
        )}
        {streamUrl && (
          <>
            <video
              ref={videoRef}
              src={streamUrl}
              className="h-full w-full object-contain"
              muted
              playsInline
              loop
              preload="metadata"
            />
            {hasBox && (
              <div
                className="pointer-events-none absolute border-2 border-amber-400/90 bg-amber-400/10"
                style={{
                  left: `${(detection.screenX ?? 0) * 100}%`,
                  top: `${(detection.screenY ?? 0) * 100}%`,
                  width: `${(detection.screenW ?? 0) * 100}%`,
                  height: `${(detection.screenH ?? 0) * 100}%`,
                }}
                title="Detected region"
              />
            )}
          </>
        )}
      </div>

      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-sm font-medium text-white">{detection.videoTitle}</p>
        <p className="text-xs text-brand-300">{detection.label}</p>
        <p className="text-xs text-zinc-400">
          {formatTime(detection.startSec)} – {formatTime(detection.endSec)}
          {detection.confidence != null && (
            <span className="ml-2 text-zinc-500">
              {(detection.confidence * 100).toFixed(0)}% conf.
            </span>
          )}
        </p>

        <div className="flex gap-2 pt-1">
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
        </div>
        {voted && (
          <p className="text-center text-xs text-zinc-500">
            {approved ? "Approved — saved for training" : "Rejected — saved for training"}
          </p>
        )}
      </div>
    </div>
  );
}
