"use client";

import { useEffect, useState } from "react";

const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

/**
 * Dismissible in-video overlay banner (Juicy "invideo" zone, 300x100 by
 * default). Rendered by the player anchored bottom-center over the content;
 * the player controls *when* it appears (~10s into playback, once per video).
 */
export default function InVideoAd({
  zoneId,
  width = 300,
  height = 100,
  onDismiss,
}: {
  zoneId: string;
  width?: number;
  height?: number;
  onDismiss: () => void;
}) {
  const [pushed, setPushed] = useState(false);

  useEffect(() => {
    if (pushed) return;
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
    setPushed(true);
  }, [pushed, zoneId]);

  return (
    <div className="relative rounded-md bg-black/60 p-1 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Dismiss ad"
        onClick={onDismiss}
        className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/95 text-[10px] text-zinc-300 ring-1 ring-zinc-700 hover:text-white"
      >
        ✕
      </button>
      <div className="ad-slot">
        <ins
          id={zoneId}
          data-width={width}
          data-height={height}
          className="ad-slot-fill inline-block max-w-full"
          style={{ display: "block", width, height, maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}
