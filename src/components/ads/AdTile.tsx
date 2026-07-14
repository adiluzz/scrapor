"use client";

import { useEffect, useRef, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

/**
 * Ad with the exact footprint of a video card, meant to sit inside the video
 * grid (aspect-video creative area + a title-line strip). Served from an Exo
 * native zone; if nothing fills within the grace period the tile removes
 * itself so the grid never shows an empty card.
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
    <div className="ad-slot block overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="relative aspect-video overflow-hidden bg-zinc-800">
        <ins
          ref={insRef}
          className={resolvedClass}
          data-zoneid={zoneId}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
      <div className="p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</p>
      </div>
    </div>
  );
}
