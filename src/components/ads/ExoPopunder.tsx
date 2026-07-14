"use client";

import { useEffect, useState } from "react";
import {
  EXO_ZONE_TYPE,
  exoInsClassFor,
  serveExoAds,
} from "@/lib/exo-click";

const SESSION_KEY = "exo_popunder_fired";

/**
 * ExoClick popunder — once per session on video pages.
 * The session is only marked after Exo confirms a serve via
 * `creativeDisplayed-{zoneId}`, so no-fill attempts retry on later pages.
 *
 * Class must end with zone type 3; needs `a.pemsrv.com/ad-provider.js`
 * (magsrv rejects popunder IDs requested as banners).
 */
export default function ExoPopunder({
  zoneId,
  enabled = true,
  insClass,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  insClass?: string | null;
}) {
  const resolvedClass = exoInsClassFor(EXO_ZONE_TYPE.POPUNDER, insClass);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled || !zoneId) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setActive(false);
        return;
      }
    } catch {
      /* continue */
    }
    setActive(true);

    const eventName = `creativeDisplayed-${zoneId}`;
    const onShown = () => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
    };
    document.addEventListener(eventName, onShown);
    serveExoAds();
    return () => document.removeEventListener(eventName, onShown);
  }, [enabled, zoneId]);

  if (!enabled || !zoneId || !active) return null;

  return (
    <ins
      className={`${resolvedClass} exo-click-trigger`}
      data-zoneid={zoneId}
      aria-hidden="true"
    />
  );
}
