"use client";

import { useEffect, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

const SESSION_KEY = "exo_fullscreen_shown";

/**
 * ExoClick Desktop Fullpage Interstitial.
 *
 * Exo triggers this format on click (per zone Frequency / Trigger settings),
 * not on bare page load. We only mark the session after Exo fires
 * `creativeDisplayed-{zoneId}` so empty fills can retry.
 */
export default function ExoFullscreenOverlay({
  zoneId,
  insClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  insClass?: string | null;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;
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

  return (
    <ins
      className={resolvedClass}
      data-zoneid={zoneId}
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: 0,
        padding: 0,
        margin: 0,
      }}
    />
  );
}
