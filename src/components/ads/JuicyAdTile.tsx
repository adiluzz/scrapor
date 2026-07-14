"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

declare global {
  interface Window {
    adsbyjuicy?: Array<{ adzone: number | string }>;
  }
}

/**
 * In-grid Juicy ad matching a video thumbnail (16:9 only — no title footer).
 * Cover-scales the fixed creative into the media box.
 */
export default function JuicyAdTile({
  zoneId,
  enabled = true,
  width = 300,
  height = 250,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  /** Declared Juicy creative size (must match the zone in Juicy Get Code). */
  width?: number;
  height?: number;
}) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!enabled || !zoneId) return;

    let script = document.querySelector<HTMLScriptElement>(`script[src="${JADS_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.async = true;
      script.setAttribute("data-cfasync", "false");
      script.src = JADS_SRC;
      document.body.appendChild(script);
    }

    window.adsbyjuicy = window.adsbyjuicy || [];
    window.adsbyjuicy.push({ adzone: Number(zoneId) || zoneId });
  }, [enabled, zoneId]);

  useLayoutEffect(() => {
    const el = mediaRef.current;
    if (!el || !enabled || !zoneId) return;

    const update = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      if (w <= 0 || h <= 0) return;
      setScale(Math.max(w / width, h / height));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const t1 = window.setTimeout(update, 400);
    const t2 = window.setTimeout(update, 1500);
    const t3 = window.setTimeout(update, 4000);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [enabled, zoneId, width, height]);

  if (!enabled || !zoneId) return null;

  return (
    <div className="ad-slot-tile group block w-full min-w-[220px] self-start overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
      <div ref={mediaRef} className="ad-slot-tile-media relative aspect-video overflow-hidden bg-zinc-800">
        <div
          className="ad-slot-tile-scale"
          style={{
            width,
            height,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <ins
            id={zoneId}
            data-width={width}
            data-height={height}
            style={{ display: "block", width, height }}
          />
        </div>
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-zinc-300">
          Ad
        </span>
      </div>
    </div>
  );
}
