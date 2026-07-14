"use client";

import { useEffect } from "react";

const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

declare global {
  interface Window {
    adsbyjuicy?: Array<{ adzone: number | string }>;
  }
}

/**
 * JuicyAds zone with the same footprint as a video card, for use inside the
 * video grid (aspect-video creative + title strip).
 */
export default function JuicyAdTile({
  zoneId,
  enabled = true,
  width = 300,
  height = 250,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  width?: number;
  height?: number;
}) {
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

  if (!enabled || !zoneId) return null;

  return (
    <div className="ad-slot block min-w-[220px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-zinc-800">
        <ins
          id={zoneId}
          data-width={width}
          data-height={height}
          className="ad-slot-fill inline-block max-h-full max-w-full"
          style={{ display: "block", width, height, maxWidth: "100%", maxHeight: "100%" }}
        />
      </div>
      <div className="p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</p>
      </div>
    </div>
  );
}
