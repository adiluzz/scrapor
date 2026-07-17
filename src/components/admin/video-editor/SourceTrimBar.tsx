"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoryboardCue } from "@/lib/storyboard";
import { formatEditorTime } from "@/lib/video-editor-format";
import { MIN_CLIP_DURATION_SEC } from "@/lib/video-editor-types";

type DragMode = "in" | "out" | "slide" | "playhead" | null;

function cueAt(cues: StoryboardCue[], t: number): StoryboardCue | null {
  if (!cues.length) return null;
  for (const c of cues) {
    if (t >= c.start && t < c.end) return c;
  }
  return cues[cues.length - 1] ?? null;
}

export default function SourceTrimBar({
  videoId,
  duration,
  startSec,
  endSec,
  currentSec,
  onRangeChange,
  onSeek,
}: {
  videoId: string;
  duration: number;
  startSec: number;
  endSec: number;
  currentSec: number;
  onRangeChange: (range: { startSec: number; endSec: number }) => void;
  onSeek: (sec: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: DragMode; originX: number; start0: number; end0: number } | null>(
    null
  );
  const [sprite, setSprite] = useState<string | null>(null);
  const [cues, setCues] = useState<StoryboardCue[]>([]);

  useEffect(() => {
    let cancelled = false;
    setSprite(null);
    setCues([]);
    void fetch(`/api/admin/videos/${videoId}/player-meta`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.storyboard?.sprite) setSprite(data.storyboard.sprite);
        if (Array.isArray(data.storyboard?.cues)) setCues(data.storyboard.cues);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const dur = Math.max(duration, 0.001);

  const xToTime = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * dur;
    },
    [dur]
  );

  const clampRange = useCallback(
    (s: number, e: number) => {
      let start = Math.max(0, Math.min(s, dur - MIN_CLIP_DURATION_SEC));
      let end = Math.max(start + MIN_CLIP_DURATION_SEC, Math.min(e, dur));
      if (end - start < MIN_CLIP_DURATION_SEC) {
        end = Math.min(dur, start + MIN_CLIP_DURATION_SEC);
      }
      return { startSec: start, endSec: end };
    },
    [dur]
  );

  const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      mode,
      originX: e.clientX,
      start0: startSec,
      end0: endSec,
    };
  };

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || !d.mode) return;
      const t = xToTime(e.clientX);
      if (d.mode === "playhead") {
        onSeek(t);
        return;
      }
      if (d.mode === "in") {
        const next = clampRange(Math.min(t, d.end0 - MIN_CLIP_DURATION_SEC), d.end0);
        onRangeChange(next);
        onSeek(next.startSec);
        return;
      }
      if (d.mode === "out") {
        const next = clampRange(d.start0, Math.max(t, d.start0 + MIN_CLIP_DURATION_SEC));
        onRangeChange(next);
        onSeek(next.endSec);
        return;
      }
      if (d.mode === "slide") {
        const el = trackRef.current;
        if (!el) return;
        const dx = e.clientX - d.originX;
        const dt = (dx / el.getBoundingClientRect().width) * dur;
        const span = d.end0 - d.start0;
        let ns = d.start0 + dt;
        ns = Math.max(0, Math.min(ns, dur - span));
        onRangeChange({ startSec: ns, endSec: ns + span });
      }
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [clampRange, dur, onRangeChange, onSeek, xToTime]);

  const filmCells = 24;
  const cells: { t: number; cue: StoryboardCue | null }[] = [];
  for (let i = 0; i < filmCells; i++) {
    const t = (i / filmCells) * dur;
    cells.push({ t, cue: cueAt(cues, t) });
  }

  const leftPct = (startSec / dur) * 100;
  const rightPct = (endSec / dur) * 100;
  const widthPct = Math.max(0.5, rightPct - leftPct);
  const playPct = (Math.max(0, Math.min(currentSec, dur)) / dur) * 100;

  return (
    <div className="space-y-1">
      <div
        ref={trackRef}
        className="relative h-14 cursor-pointer overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 select-none"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.handle) return;
          const t = xToTime(e.clientX);
          onSeek(t);
          dragRef.current = {
            mode: "playhead",
            originX: e.clientX,
            start0: startSec,
            end0: endSec,
          };
        }}
      >
        {/* Filmstrip */}
        <div className="absolute inset-0 flex">
          {cells.map((cell, i) => (
            <div
              key={i}
              className="h-full flex-1 border-r border-zinc-800/80 bg-zinc-800"
              style={
                sprite && cell.cue
                  ? {
                      backgroundImage: `url(${sprite})`,
                      backgroundPosition: `-${cell.cue.x}px -${cell.cue.y}px`,
                      backgroundSize: "auto",
                      backgroundRepeat: "no-repeat",
                    }
                  : undefined
              }
            />
          ))}
        </div>

        {/* Dim outside selection */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/55"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/55"
          style={{ width: `${100 - rightPct}%` }}
        />

        {/* Selected region + slide grip */}
        <div
          data-handle="slide"
          className="absolute inset-y-0 z-10 cursor-grab border-y-2 border-brand-400/80 bg-brand-500/15 active:cursor-grabbing"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          onPointerDown={onPointerDown("slide")}
        />

        {/* In handle */}
        <div
          data-handle="in"
          className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize"
          style={{ left: `${leftPct}%` }}
          onPointerDown={onPointerDown("in")}
        >
          <div className="mx-auto h-full w-1.5 rounded-sm bg-yellow-400 shadow" />
        </div>

        {/* Out handle */}
        <div
          data-handle="out"
          className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize"
          style={{ left: `${rightPct}%` }}
          onPointerDown={onPointerDown("out")}
        >
          <div className="mx-auto h-full w-1.5 rounded-sm bg-yellow-400 shadow" />
        </div>

        {/* Playhead */}
        <div
          data-handle="playhead"
          className="absolute inset-y-0 z-30 w-3 -translate-x-1/2 cursor-col-resize"
          style={{ left: `${playPct}%` }}
          onPointerDown={onPointerDown("playhead")}
        >
          <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
          <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
        </div>
      </div>

      <div className="flex justify-between text-[10px] tabular-nums text-zinc-500">
        <span>In {formatEditorTime(startSec)}</span>
        <span>{formatEditorTime(currentSec)}</span>
        <span>Out {formatEditorTime(endSec)}</span>
      </div>
    </div>
  );
}
