"use client";

import { useEffect, useState } from "react";

const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

/**
 * Dismissible floating corner ad (Juicy 300x250 "vidfloat" zone).
 * Fixed bottom-right, desktop only, shown once per page view. Sits below the
 * age gate / cookie banner z-indexes so it can never cover them.
 */
export default function FloatingCornerAd({
  zoneId,
  enabled = true,
}: {
  zoneId?: string | null;
  enabled?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled || !zoneId || dismissed) return;

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
  }, [enabled, zoneId, dismissed]);

  if (!enabled || !zoneId || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 hidden lg:block">
      <div className="relative rounded-lg border border-zinc-800 bg-zinc-950/95 p-1 shadow-xl">
        <button
          type="button"
          aria-label="Dismiss ad"
          onClick={() => setDismissed(true)}
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs text-zinc-400 hover:text-white"
        >
          ✕
        </button>
        <div className="ad-slot">
          <ins
            id={zoneId}
            data-width={300}
            data-height={250}
            className="ad-slot-fill inline-block"
            style={{ display: "block", width: 300, height: 250 }}
          />
        </div>
      </div>
    </div>
  );
}
