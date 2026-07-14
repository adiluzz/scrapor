"use client";

import { useEffect, useRef, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

/**
 * In-grid Exo ad matching a video thumbnail (16:9 only — no title footer).
 * Removes itself on no-fill so the grid never shows an empty card.
 */
export default function AdTile({
  zoneId,
  insClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  insClass?: string | null;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;
  const insRef = useRef<HTMLModElement>(null);
  const [noFill, setNoFill] = useState(false);

  useEffect(() => {
    if (!zoneId) return;
    serveExoAds();
    const check = () => {
      const el = insRef.current;
      if (!el) return;
      if (el.childElementCount === 0 || el.offsetHeight === 0) setNoFill(true);
    };
    const timer = setTimeout(check, 8000);
    return () => clearTimeout(timer);
  }, [zoneId]);

  if (!zoneId || noFill) return null;

  return (
    <div className="ad-slot-tile group block w-full min-w-[220px] self-start overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
      <div className="ad-slot-tile-media relative aspect-video overflow-hidden bg-zinc-800">
        <ins
          ref={insRef}
          className={resolvedClass}
          data-zoneid={zoneId}
          style={{ display: "block", width: "100%", height: "100%", position: "absolute", inset: 0 }}
        />
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-zinc-300">
          Ad
        </span>
      </div>
    </div>
  );
}
