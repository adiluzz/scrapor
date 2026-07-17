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
  clipId,
  videoId,
  initialRange,
  onRangeChange,
  compact = false,
  crop,
  onCropChange,
  onClearCrop,
  showCrop = false,
  onCurrentTimeChange,
  onSourceDuration,
  onAddAnotherClip,
}: {
  /** Timeline clip id — used to sync trim state without overwriting other clips. */
  clipId: string;
  videoId: string;
  initialRange?: ClipRange;
  onRangeChange?: (range: ClipRange) => void;
  compact?: boolean;
  crop?: EditorCrop;
  onCropChange?: (crop: EditorCrop) => void;
  onClearCrop?: () => void;
  showCrop?: boolean;
  onCurrentTimeChange?: (sec: number) => void;
  onSourceDuration?: (sec: number) => void;
  /** Append another timeline clip (same or other source). Passes current In/Out. */
  onAddAnotherClip?: (savedRange: ClipRange) => void;
}) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  const syncingFromParent = useRef(false);
  const skipNextCommit = useRef(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [startSec, setStartSec] = useState(initialRange?.startSec ?? 0);
  const [endSec, setEndSec] = useState(initialRange?.endSec ?? 0);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [localCrop, setLocalCrop] = useState<EditorCrop>(crop ?? fullFrameCrop());

  const commitRange = useCallback((start: number, end: number) => {
    onRangeChangeRef.current?.({ startSec: start, endSec: end });
  }, []);

  const applyRange = useCallback(
    (start: number, end: number) => {
      setStartSec(start);
      setEndSec(end);
      setStartText(formatTime(start));
      setEndText(formatTime(end));
      commitRange(start, end);
    },
    [commitRange]
  );

  useEffect(() => {
    syncingFromParent.current = true;
    skipNextCommit.current = true;
    const start = initialRange?.startSec ?? 0;
    const end = initialRange?.endSec ?? 0;
    setStartSec(start);
    setEndSec(end);
    setStartText(formatTime(start));
    setEndText(formatTime(end));
    syncingFromParent.current = false;
  }, [clipId, initialRange?.startSec, initialRange?.endSec]);

  useEffect(() => {
    setLocalCrop(crop ?? fullFrameCrop());
  }, [crop]);

  useEffect(() => {
    if (skipNextCommit.current) {
      skipNextCommit.current = false;
      return;
    }
    setStartText(formatTime(startSec));
    setEndText(formatTime(endSec));
    commitRange(startSec, endSec);
  }, [startSec, endSec, commitRange]);

  const handleDuration = useCallback(
    (d: number) => {
      setDuration(d);
      onSourceDuration?.(d);
      setEndSec((prev) => (prev <= 0 ? Math.min(d, 10) : prev));
    },
    [onSourceDuration]
  );

  useEffect(() => {
    if (duration <= 0) return;
    const t = initialRange?.startSec ?? 0;
    playerRef.current?.seek(t);
    setCurrent(t);
    onCurrentTimeChange?.(t);
    // Seek once when the player reports duration for this clip mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialRange.startSec is fixed at mount (key=clip id)
  }, [duration]);

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
    const nextStart = Math.max(0, t);
    let nextEnd = endSec;
    if (endSec <= t) nextEnd = Math.min(duration || t + 5, t + MIN_CLIP_DURATION_SEC + 5);
    applyRange(nextStart, nextEnd);
    setCurrent(t);
  }, [duration, endSec, applyRange]);

  const markEnd = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    const t = player.getCurrentTime();
    let nextStart = startSec;
    const nextEnd = Math.max(t, startSec + MIN_CLIP_DURATION_SEC);
    if (startSec >= t) nextStart = Math.max(0, t - 5);
    applyRange(nextStart, nextEnd);
    setCurrent(t);
  }, [startSec, applyRange]);

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

  const previewFullVideo = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.ensurePlaying();
    player.seek(0);
    setCurrent(0);
    onCurrentTimeChange?.(0);
    await player.play();
    setPlaying(true);
  }, [onCurrentTimeChange]);

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
          key={clipId}
          ref={playerRef}
          videoId={videoId}
          initialPositionSec={initialRange?.startSec ?? 0}
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
          onRangeChange={(r) => applyRange(r.startSec, r.endSec)}
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
          title="Play only the trimmed In–Out range"
        >
          Preview clip
        </button>
        <button
          type="button"
          onClick={() => void previewFullVideo()}
          disabled={duration <= 0}
          className={`rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 ${
            compact ? "px-2.5 py-1 text-[11px] font-medium" : "px-3 py-1.5 text-xs"
          }`}
          title="Play the full source video from the beginning"
        >
          Preview full video
        </button>
        {onAddAnotherClip && (
          <button
            type="button"
            onClick={() => {
              const saved = { startSec, endSec };
              commitRange(saved.startSec, saved.endSec);
              onAddAnotherClip(saved);
            }}
            className={`rounded-md border border-brand-500/40 bg-brand-950/30 text-brand-200 hover:bg-brand-950/50 ${
              compact ? "px-2.5 py-1 text-[11px] font-medium" : "px-3 py-1.5 text-xs"
            }`}
            title="Save this trim and append another clip to the timeline"
          >
            + Add to timeline
          </button>
        )}
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
                if (v != null) applyRange(Math.max(0, Math.min(v, duration || v)), endSec);
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
                if (v != null) applyRange(startSec, Math.max(0, Math.min(v, duration || v)));
              }}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
      </details>
    </div>
  );
}
