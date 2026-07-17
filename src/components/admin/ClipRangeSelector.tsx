"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminClipPlayer from "@/components/admin/AdminClipPlayer";
import CropOverlay, { CropAspectControls } from "@/components/admin/video-editor/CropOverlay";
import SourceTrimBar from "@/components/admin/video-editor/SourceTrimBar";
import type { VideoPlayerHandle } from "@/components/player/VideoPlayer";
import {
  type EditorCrop,
  fullFrameCrop,
  MIN_CLIP_DURATION_SEC,
} from "@/lib/video-editor-types";

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${ms}`;
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

export type ClipRange = {
  startSec: number;
  endSec: number;
};

export default function ClipRangeSelector({
  videoId,
  initialRange,
  onRangeChange,
  compact = false,
  crop,
  onCropChange,
  onClearCrop,
  showCrop = false,
  onCurrentTimeChange,
}: {
  videoId: string;
  initialRange?: ClipRange;
  onRangeChange?: (range: ClipRange) => void;
  compact?: boolean;
  crop?: EditorCrop;
  onCropChange?: (crop: EditorCrop) => void;
  onClearCrop?: () => void;
  showCrop?: boolean;
  onCurrentTimeChange?: (sec: number) => void;
}) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [startSec, setStartSec] = useState(initialRange?.startSec ?? 0);
  const [endSec, setEndSec] = useState(initialRange?.endSec ?? 0);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [localCrop, setLocalCrop] = useState<EditorCrop>(crop ?? fullFrameCrop());

  useEffect(() => {
    setStartSec(initialRange?.startSec ?? 0);
    setEndSec(initialRange?.endSec ?? 0);
  }, [videoId, initialRange?.startSec, initialRange?.endSec]);

  useEffect(() => {
    setLocalCrop(crop ?? fullFrameCrop());
  }, [crop]);

  useEffect(() => {
    setStartText(formatTime(startSec));
    setEndText(formatTime(endSec));
    onRangeChange?.({ startSec, endSec });
  }, [startSec, endSec, onRangeChange]);

  const handleDuration = useCallback((d: number) => {
    setDuration(d);
    setEndSec((prev) => (prev <= 0 ? Math.min(d, 10) : prev));
  }, []);

  const handleTime = useCallback(
    (t: number) => {
      setCurrent(t);
      onCurrentTimeChange?.(t);
    },
    [onCurrentTimeChange]
  );

  const seek = useCallback((t: number) => {
    playerRef.current?.seek(t);
    setCurrent(t);
  }, []);

  const markStart = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    const t = player.getCurrentTime();
    setStartSec(Math.max(0, t));
    setCurrent(t);
    if (endSec <= t) setEndSec(Math.min(duration || t + 5, t + MIN_CLIP_DURATION_SEC + 5));
  }, [duration, endSec]);

  const markEnd = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    const t = player.getCurrentTime();
    setEndSec(Math.max(t, startSec + MIN_CLIP_DURATION_SEC));
    setCurrent(t);
    if (startSec >= t) setStartSec(Math.max(0, t - 5));
  }, [startSec]);

  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      player.pause();
      setPlaying(false);
      return;
    }
    await player.ensurePlaying();
    await player.play();
    setPlaying(true);
  }, [playing]);

  const previewClip = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    player.seek(startSec);
    await player.play();
    setPlaying(true);
  }, [startSec]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        void markStart();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        void markEnd();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markStart, markEnd, togglePlay]);

  const applyCrop = useCallback(
    (c: EditorCrop) => {
      setLocalCrop(c);
      onCropChange?.(c);
    },
    [onCropChange]
  );

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <AdminClipPlayer
          ref={playerRef}
          videoId={videoId}
          onTimeUpdate={handleTime}
          onDuration={handleDuration}
        />
        {showCrop && <CropOverlay crop={localCrop} onChange={applyCrop} />}
      </div>

      {showCrop && (
        <CropAspectControls
          crop={localCrop}
          onChange={applyCrop}
          onClear={() => {
            setLocalCrop(fullFrameCrop());
            onClearCrop?.();
          }}
        />
      )}

      {duration > 0 && (
        <SourceTrimBar
          videoId={videoId}
          duration={duration}
          startSec={startSec}
          endSec={endSec}
          currentSec={current}
          onRangeChange={(r) => {
            setStartSec(r.startSec);
            setEndSec(r.endSec);
          }}
          onSeek={seek}
        />
      )}

      <div className={`flex flex-wrap gap-2 ${compact ? "items-center" : ""}`}>
        <button
          type="button"
          onClick={() => void togglePlay()}
          className={`rounded-md bg-brand-600 text-white hover:bg-brand-500 ${
            compact ? "px-3 py-1 text-[11px] font-medium" : "px-3 py-1.5 text-xs"
          }`}
          title="Play / pause (Space)"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={markStart}
          className={`rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 ${
            compact ? "px-2.5 py-1 text-[11px] font-medium" : "px-3 py-1.5 text-xs"
          }`}
        >
          In ({formatTime(current)})
        </button>
        <button
          type="button"
          onClick={markEnd}
          className={`rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 ${
            compact ? "px-2.5 py-1 text-[11px] font-medium" : "px-3 py-1.5 text-xs"
          }`}
        >
          Out ({formatTime(current)})
        </button>
        <button
          type="button"
          onClick={previewClip}
          disabled={endSec <= startSec}
          className={`rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 ${
            compact ? "px-2.5 py-1 text-[11px] font-medium" : "px-3 py-1.5 text-xs"
          }`}
        >
          Preview in/out
        </button>
        {compact && endSec > startSec && (
          <span className="ml-auto text-[11px] tabular-nums text-brand-300">
            {(endSec - startSec).toFixed(1)}s
          </span>
        )}
      </div>

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">
          Exact times
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block text-xs text-zinc-400">
            Start
            <input
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              onBlur={() => {
                const v = parseTimeInput(startText);
                if (v != null) setStartSec(Math.max(0, Math.min(v, duration || v)));
              }}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            End
            <input
              value={endText}
              onChange={(e) => setEndText(e.target.value)}
              onBlur={() => {
                const v = parseTimeInput(endText);
                if (v != null) setEndSec(Math.max(0, Math.min(v, duration || v)));
              }}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
      </details>
    </div>
  );
}
