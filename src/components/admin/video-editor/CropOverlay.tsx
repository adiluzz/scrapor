"use client";

import { useEffect, useRef, useState } from "react";
import {
  ASPECT_RATIOS,
  type EditorCrop,
  type EditorCropAspect,
  defaultCrop,
} from "@/lib/video-editor-types";

type DragKind = "move" | "nw" | "ne" | "sw" | "se" | null;

function clampCrop(c: EditorCrop): EditorCrop {
  let { x, y, w, h } = c;
  w = Math.max(0.08, Math.min(1, w));
  h = Math.max(0.08, Math.min(1, h));
  x = Math.max(0, Math.min(x, 1 - w));
  y = Math.max(0, Math.min(y, 1 - h));
  return { ...c, x, y, w, h };
}

function fitAspect(aspect: EditorCropAspect, prev: EditorCrop): EditorCrop {
  if (aspect === "free") return { ...prev, aspect: "free" };
  const ratio = ASPECT_RATIOS[aspect];
  const maxW = 1;
  const maxH = 1;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  if (prev.w > 0 && prev.h > 0) {
    const pw = Math.min(prev.w, maxW);
    const ph = pw / ratio;
    if (ph <= maxH) {
      w = pw;
      h = ph;
    }
  }
  const cx = prev.x + prev.w / 2;
  const cy = prev.y + prev.h / 2;
  return clampCrop({
    aspect,
    w,
    h,
    x: cx - w / 2,
    y: cy - h / 2,
  });
}

export default function CropOverlay({
  crop,
  onChange,
  enabled = true,
}: {
  crop: EditorCrop;
  onChange: (crop: EditorCrop) => void;
  enabled?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: DragKind;
    startX: number;
    startY: number;
    orig: EditorCrop;
  } | null>(null);
  const [local, setLocal] = useState(crop);

  useEffect(() => {
    setLocal(crop);
  }, [crop]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      const el = boxRef.current;
      if (!d || !d.kind || !el) return;
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - d.startX) / rect.width;
      const dy = (e.clientY - d.startY) / rect.height;
      const o = d.orig;
      let next = { ...o };

      if (d.kind === "move") {
        next.x = o.x + dx;
        next.y = o.y + dy;
      } else {
        const locked = o.aspect !== "free" ? ASPECT_RATIOS[o.aspect] : null;
        if (d.kind === "se") {
          next.w = o.w + dx;
          next.h = locked ? next.w / locked : o.h + dy;
        } else if (d.kind === "sw") {
          next.w = o.w - dx;
          next.h = locked ? next.w / locked : o.h + dy;
          next.x = o.x + (o.w - next.w);
        } else if (d.kind === "ne") {
          next.w = o.w + dx;
          next.h = locked ? next.w / locked : o.h - dy;
          next.y = locked ? o.y + o.h - next.h : o.y + dy;
        } else if (d.kind === "nw") {
          next.w = o.w - dx;
          next.h = locked ? next.w / locked : o.h - dy;
          next.x = o.x + (o.w - next.w);
          next.y = locked ? o.y + o.h - next.h : o.y + dy;
        }
      }
      next = clampCrop(next);
      setLocal(next);
      onChange(next);
    }
    function onUp() {
      drag.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange]);

  if (!enabled) return null;

  const startDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      orig: local,
    };
  };

  const L = local.x * 100;
  const T = local.y * 100;
  const W = local.w * 100;
  const H = local.h * 100;

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute bg-black/50" style={{ left: 0, top: 0, width: "100%", height: `${T}%` }} />
      <div
        className="absolute bg-black/50"
        style={{ left: 0, top: `${T}%`, width: `${L}%`, height: `${H}%` }}
      />
      <div
        className="absolute bg-black/50"
        style={{ left: `${L + W}%`, top: `${T}%`, width: `${100 - L - W}%`, height: `${H}%` }}
      />
      <div
        className="absolute bg-black/50"
        style={{ left: 0, top: `${T + H}%`, width: "100%", height: `${100 - T - H}%` }}
      />

      <div
        className="pointer-events-auto absolute border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{
          left: `${L}%`,
          top: `${T}%`,
          width: `${W}%`,
          height: `${H}%`,
          cursor: "grab",
        }}
        onPointerDown={startDrag("move")}
      >
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-white/15" />
          ))}
        </div>
        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
          <div
            key={corner}
            className={`absolute h-3.5 w-3.5 bg-yellow-400 ${
              corner.includes("n") ? "-top-1.5" : "-bottom-1.5"
            } ${corner.includes("w") ? "-left-1.5" : "-right-1.5"} ${
              corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"
            }`}
            onPointerDown={startDrag(corner)}
          />
        ))}
      </div>
    </div>
  );
}

export function CropAspectControls({
  crop,
  onChange,
}: {
  crop: EditorCrop;
  onChange: (crop: EditorCrop) => void;
}) {
  const aspects: EditorCropAspect[] = ["16:9", "9:16", "1:1", "4:5", "free"];
  return (
    <div className="flex flex-wrap gap-1">
      {aspects.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(fitAspect(a, crop))}
          className={`rounded border px-2 py-0.5 text-[11px] ${
            crop.aspect === a
              ? "border-brand-500 bg-brand-950/40 text-brand-200"
              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          {a}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(defaultCrop(crop.aspect))}
        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
      >
        Reset
      </button>
    </div>
  );
}
