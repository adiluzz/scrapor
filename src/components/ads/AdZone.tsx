"use client";

import { useEffect } from "react";

/**
 * ExoClick display ad slot (banner / native).
 *
 * ExoClick serves ads into an <ins> element identified by a per-account CSS
 * class plus the zone id. The account class below is derived from this
 * publisher's hash (6a97888e — same as the site-verification meta tag).
 * If ExoClick's zone snippet shows a different `<ins class="...">`, update this.
 *
 * The provider script (a.magsrv.com/ad-provider.js) is loaded once in the site
 * layout. `AdProvider.push({ serve: {} })` renders every not-yet-served <ins>
 * on the page; we call it on mount so it also works after client-side (SPA)
 * navigation. It is safe to call repeatedly.
 */
const EXO_INS_CLASS = "eas6a97888e2";

declare global {
  interface Window {
    AdProvider?: Array<Record<string, unknown>>;
  }
}

export default function AdZone({
  zoneId,
  className = "",
  minHeight,
  label = true,
}: {
  zoneId?: string;
  className?: string;
  minHeight?: number;
  label?: boolean;
}) {
  useEffect(() => {
    if (!zoneId) return;
    try {
      window.AdProvider = window.AdProvider || [];
      window.AdProvider.push({ serve: {} });
    } catch {
      /* ignore */
    }
  }, [zoneId]);

  // Nothing configured → render nothing (no empty gaps in the layout).
  if (!zoneId) return null;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {label && <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>}
      <ins
        className={EXO_INS_CLASS}
        data-zoneid={zoneId}
        style={minHeight ? { display: "block", minHeight } : { display: "block" }}
      />
    </div>
  );
}
