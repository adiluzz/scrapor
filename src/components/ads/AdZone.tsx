"use client";

import { useEffect } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

/**
 * ExoClick display ad slot (banner / native).
 *
 * ExoClick serves ads into an <ins> element identified by a per-account CSS
 * class plus the zone id. Pass `insClass` from `site.exoInsClass` when available;
 * it defaults to the legacy publisher class.
 *
 * The provider script (a.magsrv.com/ad-provider.js) is loaded once in the site
 * layout. `AdProvider.push({ serve: {} })` renders every not-yet-served <ins>
 * on the page; we call it on mount so it also works after client-side (SPA)
 * navigation. It is safe to call repeatedly.
 */
export default function AdZone({
  zoneId,
  className = "",
  minHeight,
  label = true,
  insClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  className?: string;
  minHeight?: number;
  label?: boolean;
  /** ExoClick `<ins>` class; defaults to `eas6a97888e2`. */
  insClass?: string | null;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;

  useEffect(() => {
    if (!zoneId) return;
    serveExoAds();
  }, [zoneId]);

  // Nothing configured → render nothing (no empty gaps in the layout).
  if (!zoneId) return null;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {label && <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>}
      <ins
        className={resolvedClass}
        data-zoneid={zoneId}
        style={minHeight ? { display: "block", minHeight } : { display: "block" }}
      />
    </div>
  );
}
