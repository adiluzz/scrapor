"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EditorClip } from "@/lib/video-editor-types";
import {
  MIN_CLIP_DURATION_SEC,
  clipDurationSec,
  totalTimelineDuration,
} from "@/lib/video-editor-types";
import { formatEditorDuration, formatEditorTime } from "@/lib/video-editor-format";

const CLIP_COLORS = [
  "from-brand-600/80 to-brand-800/80",
  "from-violet-600/80 to-violet-800/80",
  "from-cyan-600/80 to-cyan-800/80",
  "from-amber-600/80 to-amber-800/80",
  "from-rose-600/80 to-rose-800/80",
  "from-emerald-600/80 to-emerald-800/80",
];

type DragKind = "ripple-in" | "ripple-out" | "roll" | null;

export default function EditorTimeline({
  clips,
  selectedId,
  onSelect,
  onMove,
  onRemove,
  onDuplicate,
  onRippleTrim,
  onRoll,
  playheadSec = 0,
  pixelsPerSecond,
  onPixelsPerSecondChange,
}: {
  clips: EditorClip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRippleTrim: (id: string, side: "in" | "out", newSec: number) => void;
  /** Absolute new out for clip[editIndex] and in for clip[editIndex+1]. */
  onRoll: (editIndex: number, aEndSec: number, bStartSec: number) => void;
  /** Source time within the selected clip (absolute startSec…endSec). */
  playheadSec?: number;
  pixelsPerSecond: number;
  onPixelsPerSecondChange: (pps: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: DragKind;
    clipId: string;
    editIndex: number;
    originX: number;
    start0: number;
    end0: number;
    nextStart0: number;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; pps: number } | null>(null);

  const totalSec = totalTimelineDuration(clips);
  const trackWidth = Math.max(totalSec * pixelsPerSecond, 200);

  const selectedIndex = useMemo(
    () => clips.findIndex((c) => c.id === selectedId),
    [clips, selectedId]
  );

  const playheadOffsetPx = useMemo(() => {
    if (selectedIndex < 0 || !selectedId) return 0;
    let offset = 0;
    for (let i = 0; i < selectedIndex; i++) {
      offset += clipDurationSec(clips[i]) * pixelsPerSecond;
    }
    const clip = clips[selectedIndex];
    const local = Math.max(0, Math.min(playheadSec - clip.startSec, clipDurationSec(clip)));
    return offset + local * pixelsPerSecond;
  }, [clips, selectedId, selectedIndex, playheadSec, pixelsPerSecond]);

  const ticks = useMemo(() => {
    const step =
      pixelsPerSecond >= 80 ? 1 : pixelsPerSecond >= 40 ? 5 : pixelsPerSecond >= 20 ? 15 : 30;
    const out: number[] = [];
    for (let t = 0; t <= totalSec + 0.001; t += step) out.push(t);
    if (out[out.length - 1] !== totalSec && totalSec > 0) out.push(totalSec);
    return out;
  }, [totalSec, pixelsPerSecond]);

  useEffect(() => {
    function onMovePtr(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || !d.kind) return;
      const dt = (e.clientX - d.originX) / pixelsPerSecond;
      if (d.kind === "ripple-in") {
        onRippleTrim(d.clipId, "in", d.start0 + dt);
      } else if (d.kind === "ripple-out") {
        onRippleTrim(d.clipId, "out", d.end0 + dt);
      } else if (d.kind === "roll") {
        onRoll(d.editIndex, d.end0 + dt, d.nextStart0 + dt);
      }
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onRippleTrim, onRoll, pixelsPerSecond]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      onPixelsPerSecondChange(
        Math.max(10, Math.min(200, Math.round(pixelsPerSecond * factor)))
      );
    },
    [onPixelsPerSecondChange, pixelsPerSecond]
  );

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), pps: pixelsPerSecond };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const ratio = dist / Math.max(1, pinchRef.current.dist);
    onPixelsPerSecondChange(
      Math.max(10, Math.min(200, Math.round(pinchRef.current.pps * ratio)))
    );
  };

  if (clips.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/40 text-sm text-zinc-500">
        Timeline empty — add clips from the library or AI highlight
      </div>
    );
  }

  return (
    <div className="select-none space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Timeline</span>
        <span className="text-[11px] tabular-nums text-zinc-600">
          {formatEditorDuration(totalSec)} · {Math.round(pixelsPerSecond)} px/s
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              onPixelsPerSecondChange(Math.max(10, Math.round(pixelsPerSecond * 0.8)))
            }
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              onPixelsPerSecondChange(Math.min(200, Math.round(pixelsPerSecond * 1.25)))
            }
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overscroll-x-contain"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {
          pinchRef.current = null;
        }}
      >
        <div style={{ width: trackWidth }} className="relative min-w-full">
          {/* Ruler */}
          <div className="relative mb-1 h-4">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-600"
                style={{ left: t * pixelsPerSecond }}
              >
                {formatEditorTime(t, 0)}
              </span>
            ))}
          </div>

          {/* Track */}
          <div className="relative h-[72px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <div className="flex h-full">
              {clips.map((clip, index) => {
                const dur = clipDurationSec(clip);
                const width = Math.max(dur * pixelsPerSecond, 8);
                const active = clip.id === selectedId;
                const color = CLIP_COLORS[index % CLIP_COLORS.length];
                return (
                  <div
                    key={clip.id}
                    className={`group relative h-full shrink-0 border-r border-zinc-900/80 bg-gradient-to-b ${color} ${
                      active ? "z-10 ring-2 ring-inset ring-white/90 brightness-110" : "opacity-90"
                    }`}
                    style={{ width }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(clip.id)}
                      className="absolute inset-0 text-left"
                      title={clip.title}
                    >
                      <span className="absolute left-2 top-1 rounded bg-black/40 px-1 text-[10px] font-medium text-white/90">
                        {index + 1}
                      </span>
                      <span className="absolute bottom-1.5 left-2 right-2 truncate text-xs font-medium text-white drop-shadow">
                        {clip.title}
                      </span>
                      <span className="absolute right-2 top-1 text-[10px] tabular-nums text-white/80">
                        {formatEditorDuration(dur)}
                      </span>
                    </button>

                    {/* Ripple In handle (yellow) */}
                    <div
                      className="absolute inset-y-0 left-0 z-20 w-3 cursor-ew-resize"
                      title="Ripple trim In"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = {
                          kind: "ripple-in",
                          clipId: clip.id,
                          editIndex: index,
                          originX: e.clientX,
                          start0: clip.startSec,
                          end0: clip.endSec,
                          nextStart0: 0,
                        };
                      }}
                    >
                      <div className="h-full w-1.5 bg-yellow-400/90" />
                    </div>

                    {/* Ripple Out handle (yellow) */}
                    <div
                      className="absolute inset-y-0 right-0 z-20 w-3 cursor-ew-resize"
                      title="Ripple trim Out"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = {
                          kind: "ripple-out",
                          clipId: clip.id,
                          editIndex: index,
                          originX: e.clientX,
                          start0: clip.startSec,
                          end0: clip.endSec,
                          nextStart0: 0,
                        };
                      }}
                    >
                      <div className="ml-auto h-full w-1.5 bg-yellow-400/90" />
                    </div>

                    {/* Roll bar at junction with next clip (red) */}
                    {index < clips.length - 1 && (
                      <div
                        className="absolute inset-y-0 right-0 z-30 w-2 translate-x-1/2 cursor-col-resize"
                        title="Roll edit"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const next = clips[index + 1];
                          dragRef.current = {
                            kind: "roll",
                            clipId: clip.id,
                            editIndex: index,
                            originX: e.clientX,
                            start0: clip.startSec,
                            end0: clip.endSec,
                            nextStart0: next.startSec,
                          };
                        }}
                      >
                        <div className="mx-auto h-full w-1 bg-red-500 shadow" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Playhead */}
            {selectedId && (
              <div
                className="pointer-events-none absolute top-0 z-40 h-full w-0.5 bg-white shadow"
                style={{ left: playheadOffsetPx }}
              >
                <div className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="flex flex-wrap items-center gap-2 px-0.5">
          <span className="text-xs text-zinc-500">
            Clip {selectedIndex + 1} of {clips.length}
          </span>
          <div className="flex gap-1">
            <IconBtn
              label="Move earlier"
              disabled={selectedIndex === 0}
              onClick={() => onMove(selectedId, -1)}
            >
              ←
            </IconBtn>
            <IconBtn
              label="Move later"
              disabled={selectedIndex === clips.length - 1}
              onClick={() => onMove(selectedId, 1)}
            >
              →
            </IconBtn>
            <IconBtn label="Duplicate" onClick={() => onDuplicate(selectedId)}>
              ⧉
            </IconBtn>
            <IconBtn label="Remove" danger onClick={() => onRemove(selectedId)}>
              ✕
            </IconBtn>
          </div>
          <span className="text-[10px] text-zinc-600">
            Yellow = ripple · Red = roll · Ctrl+wheel zoom
          </span>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs disabled:opacity-30 ${
        danger
          ? "border-red-900/50 text-red-400 hover:bg-red-950/40"
          : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

/** Pure helpers used by ScraporVideoEditor for ripple/roll clamping. */
export function applyRippleTrim(
  clips: EditorClip[],
  id: string,
  side: "in" | "out",
  newSec: number
): EditorClip[] {
  return clips.map((c) => {
    if (c.id !== id) return c;
    if (side === "in") {
      const startSec = Math.max(0, Math.min(newSec, c.endSec - MIN_CLIP_DURATION_SEC));
      return { ...c, startSec };
    }
    const endSec = Math.max(c.startSec + MIN_CLIP_DURATION_SEC, newSec);
    return { ...c, endSec };
  });
}

export function applyRoll(
  clips: EditorClip[],
  editIndex: number,
  aEndSec: number,
  bStartSec: number
): EditorClip[] {
  if (editIndex < 0 || editIndex >= clips.length - 1) return clips;
  const a = clips[editIndex];
  const b = clips[editIndex + 1];
  let aEnd = aEndSec;
  let bStart = bStartSec;
  if (aEnd < a.startSec + MIN_CLIP_DURATION_SEC) {
    const fix = a.startSec + MIN_CLIP_DURATION_SEC - aEnd;
    aEnd += fix;
    bStart += fix;
  }
  if (b.endSec - bStart < MIN_CLIP_DURATION_SEC) {
    const fix = b.endSec - MIN_CLIP_DURATION_SEC - bStart;
    bStart += fix;
    aEnd += fix;
  }
  if (aEnd < a.startSec + MIN_CLIP_DURATION_SEC || b.endSec - bStart < MIN_CLIP_DURATION_SEC) {
    return clips;
  }
  if (bStart < 0) return clips;
  return clips.map((c, i) => {
    if (i === editIndex) return { ...c, endSec: aEnd };
    if (i === editIndex + 1) return { ...c, startSec: bStart };
    return c;
  });
}
