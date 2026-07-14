"use client";

import { useEffect, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

/**
 * Dismissible ExoClick mobile sticky banner (bottom).
 */
export default function MobileStickyAd({
  zoneId,
  insClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  insClass?: string | null;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!zoneId || dismissed) return;
    serveExoAds();
  }, [zoneId, dismissed]);

  if (!zoneId || dismissed) return null;

  return (
    <div className="ad-slot-sticky fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 px-2 pb-2 pt-4 backdrop-blur sm:hidden">
      <button
        type="button"
        aria-label="Dismiss ad"
        onClick={() => setDismissed(true)}
        className="absolute right-1 top-0 z-10 px-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        ✕
      </button>
      <div className="ad-slot mx-auto w-full max-w-full overflow-hidden">
        <ins
          className={resolvedClass}
          data-zoneid={zoneId}
          style={{ display: "block", maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}
