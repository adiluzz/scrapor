"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminClipPlayer from "@/components/admin/AdminClipPlayer";
import type { VideoPlayerHandle } from "@/components/player/VideoPlayer";

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
}: {
  videoId: string;
  initialRange?: ClipRange;
  onRangeChange?: (range: ClipRange) => void;
}) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [startSec, setStartSec] = useState(initialRange?.startSec ?? 0);
  const [endSec, setEndSec] = useState(initialRange?.endSec ?? 0);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");

  useEffect(() => {
    setStartSec(initialRange?.startSec ?? 0);
    setEndSec(initialRange?.endSec ?? 0);
  }, [videoId, initialRange?.startSec, initialRange?.endSec]);

  useEffect(() => {
    setStartText(formatTime(startSec));
    setEndText(formatTime(endSec));
    onRangeChange?.({ startSec, endSec });
  }, [startSec, endSec, onRangeChange]);

  const handleDuration = useCallback((d: number) => {
    setDuration(d);
    setEndSec((prev) => (prev <= 0 ? Math.min(d, 10) : prev));
  }, []);

  const markStart = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    const t = player.getCurrentTime();
    setStartSec(Math.max(0, t));
    setCurrent(t);
    if (endSec <= t) setEndSec(Math.min(duration || t + 5, t + 10));
  }, [duration, endSec]);

  const markEnd = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    const t = player.getCurrentTime();
    setEndSec(t);
    setCurrent(t);
    if (startSec >= t) setStartSec(Math.max(0, t - 5));
  }, [startSec]);

  const previewClip = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    player.seek(startSec);
    await player.play();
  }, [startSec]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <AdminClipPlayer
          ref={playerRef}
          videoId={videoId}
          onTimeUpdate={setCurrent}
          onDuration={handleDuration}
        />
        {duration > 0 && (
          <div
            className="pointer-events-none absolute bottom-12 left-0 right-0 z-30 mx-3 h-1 bg-zinc-800/80"
            aria-hidden
          >
            <div
              className="absolute top-0 h-full bg-brand-500/80"
              style={{
                left: `${(startSec / duration) * 100}%`,
                width: `${((endSec - startSec) / duration) * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Use the player controls (including ←/→ to skip 7s), pause at the action, then mark start
        and end.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={markStart}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          Mark start ({formatTime(current)})
        </button>
        <button
          type="button"
          onClick={markEnd}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          Mark end ({formatTime(current)})
        </button>
        <button
          type="button"
          onClick={previewClip}
          disabled={endSec <= startSec}
          className="rounded-lg bg-brand-600/80 px-3 py-1.5 text-xs text-white hover:bg-brand-500 disabled:opacity-50"
        >
          Preview clip
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Start (m:ss or seconds)
          <input
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={() => {
              const v = parseTimeInput(startText);
              if (v != null) setStartSec(Math.max(0, Math.min(v, duration || v)));
            }}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          End (m:ss or seconds)
          <input
            value={endText}
            onChange={(e) => setEndText(e.target.value)}
            onBlur={() => {
              const v = parseTimeInput(endText);
              if (v != null) setEndSec(Math.max(0, Math.min(v, duration || v)));
            }}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>

      {duration > 0 && (
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={startSec}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setStartSec(v);
              if (endSec <= v) setEndSec(Math.min(duration, v + 1));
            }}
            className="w-full accent-brand-500"
          />
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={endSec}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setEndSec(v);
              if (startSec >= v) setStartSec(Math.max(0, v - 1));
            }}
            className="w-full accent-brand-500"
          />
        </div>
      )}

      <p className="text-xs text-brand-300">
        Selected: {formatTime(startSec)} → {formatTime(endSec)}
        {endSec > startSec && (
          <span className="text-zinc-500"> ({(endSec - startSec).toFixed(1)}s)</span>
        )}
      </p>
    </div>
  );
}
