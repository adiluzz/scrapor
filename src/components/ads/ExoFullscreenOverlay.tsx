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

  // Exo expects a normal <ins> tag (see ad-provider docs). Zero-size clip/absolute
  // wrappers can prevent Desktop/Mobile Fullpage Interstitial from binding click
  // triggers. Keep the slot in-DOM but visually inert until Exo opens its overlay.
  return (
    <ins
      className={resolvedClass}
      data-zoneid={zoneId}
      aria-hidden="true"
      data-ad-format="fullscreen"
    />
  );
}
