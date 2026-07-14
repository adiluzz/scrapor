"use client";

import { useEffect, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

const SESSION_KEY = "exo_popunder_fired";

/**
 * ExoClick popunder — once per session on video pages.
 * Keeps the zone tag until session is marked after first serve attempt.
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
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* continue */
    }
    setActive(true);
    serveExoAds();
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
