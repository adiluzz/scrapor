"use client";

import { useEffect, useRef, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";
import JuicyAdZone from "@/components/ads/JuicyAdZone";

/**
 * Dismissible mobile sticky banner (bottom). Prefers Exo Mobile Banner 320×50;
 * if Exo leaves an empty slot, falls back to the Juicy banner zone.
 */
export default function MobileStickyAd({
  zoneId,
  insClass = EXO_INS_CLASS,
  juicyZoneId,
  juicyEnabled = true,
}: {
  zoneId?: string | null;
  insClass?: string | null;
  juicyZoneId?: string | null;
  juicyEnabled?: boolean;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;
  const [dismissed, setDismissed] = useState(false);
  const [exoEmpty, setExoEmpty] = useState(false);
  const insRef = useRef<HTMLModElement>(null);

  const hasExo = Boolean(zoneId);
  const hasJuicy = Boolean(juicyEnabled && juicyZoneId);
  const showJuicy = hasJuicy && (!hasExo || exoEmpty);

  useEffect(() => {
    if (!zoneId || dismissed) return;
    serveExoAds();
    const timer = setTimeout(() => {
      const el = insRef.current;
      if (!el || el.childElementCount === 0 || el.offsetHeight < 20) {
        setExoEmpty(true);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [zoneId, dismissed]);

  if (dismissed || (!hasExo && !hasJuicy)) return null;

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
        {hasExo && !exoEmpty && (
          <ins
            ref={insRef}
            className={resolvedClass}
            data-zoneid={zoneId!}
            style={{ display: "block", maxWidth: "100%", minHeight: 50 }}
          />
        )}
        {showJuicy && (
          <JuicyAdZone zoneId={juicyZoneId} enabled label={false} width={300} height={100} />
        )}
      </div>
    </div>
  );
}
