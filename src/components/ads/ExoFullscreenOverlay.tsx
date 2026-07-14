"use client";

import { useEffect, useState } from "react";
import {
  EXO_ZONE_TYPE,
  exoInsClassFor,
  serveExoAds,
} from "@/lib/exo-click";

const SESSION_KEY = "exo_fullscreen_shown";

/**
 * ExoClick Desktop Fullpage Interstitial.
 *
 * Exo triggers this format on click (per zone Frequency / Trigger settings),
 * not on bare page load. We only mark the session after Exo fires
 * `creativeDisplayed-{zoneId}` so empty fills can retry.
 *
 * The `<ins>` class must end with zone type 35 (not the banner `…2`), and
 * `a.orbsrv.com/ad-provider.js` must be loaded — magsrv does not serve FPI.
 */
export default function ExoFullscreenOverlay({
  zoneId,
  insClass,
}: {
  zoneId?: string | null;
  insClass?: string | null;
}) {
  const resolvedClass = exoInsClassFor(
    EXO_ZONE_TYPE.DESKTOP_FULLPAGE,
    insClass
  );
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!zoneId) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setEnabled(false);
        return;
      }
    } catch {
      /* ignore */
    }
    setEnabled(true);

    const eventName = `creativeDisplayed-${zoneId}`;
    const onShown = () => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setEnabled(false);
    };
    document.addEventListener(eventName, onShown);
    serveExoAds();
    return () => document.removeEventListener(eventName, onShown);
  }, [zoneId]);

  if (!zoneId || !enabled) return null;

  // No extra data-* attrs: AdProvider forwards every data-* into custom_targeting.
  return (
    <ins
      className={`${resolvedClass} exo-click-trigger`}
      data-zoneid={zoneId}
      aria-hidden="true"
    />
  );
}
