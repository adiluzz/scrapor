"use client";

import { useEffect, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

const SESSION_KEY = "exo_popunder_fired";

/**
 * ExoClick popunder — once per session on video pages.
 * The session is only marked after Exo confirms a serve via
 * `creativeDisplayed-{zoneId}`, so no-fill attempts retry on later pages.
 */
export default function ExoPopunder({
  zoneId,
  enabled = true,
  insClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  insClass?: string | null;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;
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

  // Popunder uses the same async <ins> pattern as banners; do not clip it away.
  return (
    <ins
      className={resolvedClass}
      data-zoneid={zoneId}
      aria-hidden="true"
      data-ad-format="popunder"
    />
  );
}
