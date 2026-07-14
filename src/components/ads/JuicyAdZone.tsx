"use client";

import { useEffect } from "react";

const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

declare global {
  interface Window {
    adsbyjuicy?: Array<{ adzone: number | string }>;
  }
}

/**
 * JuicyAds v3 zone — loads jads.js once, renders `<ins id={zoneId}>`, and
 * queues `adsbyjuicy.push({ adzone })` (matches Juicy "Get Code" snippet).
 */
export default function JuicyAdZone({
  zoneId,
  enabled = true,
  className = "",
  label = true,
  width = 300,
  height = 250,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  className?: string;
  label?: boolean;
  /** Zone creative size from Juicy Get Code (default 300×250). */
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
    <div className={`ad-slot ${className}`}>
      {label && (
        <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>
      )}
      <ins
        id={zoneId}
        data-width={width}
        data-height={height}
        className="ad-slot-fill inline-block max-w-full"
        style={{ display: "block", width, height, maxWidth: "100%" }}
      />
    </div>
  );
}
