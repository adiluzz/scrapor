"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

declare global {
  interface Window {
    adsbyjuicy?: Array<{ adzone: number | string }>;
  }
}

/**
 * JuicyAds unit styled exactly like a video card: 16:9 media + footer strip.
 * Fixed-size Juicy creatives are cover-scaled into the media box so the tile
 * never looks like a tiny centered widget in the grid.
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
      // Cover-fit the fixed creative into the 16:9 card media.
      setScale(Math.max(w / width, h / height));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Juicy often injects late; remeasure a few times after push.
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
    <div className="ad-slot-tile group block min-w-[220px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
      <div ref={mediaRef} className="ad-slot-tile-media">
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
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-sm text-zinc-200">Advertisement</p>
        <p className="mt-1 text-[11px] text-zinc-500">Sponsored</p>
      </div>
    </div>
  );
}
