"use client";

import { useEffect } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

const SESSION_KEY = "exo_popunder_fired";

/**
 * ExoClick popunder — fires once per session when mounted (video page / first play context).
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

  useEffect(() => {
    if (!enabled || !zoneId) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* continue */
    }
    serveExoAds();
  }, [enabled, zoneId]);

  if (!enabled || !zoneId) return null;

  return (
    <ins
      className={resolvedClass}
      data-zoneid={zoneId}
      data-keywords="popunder"
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        border: 0,
        padding: 0,
        margin: 0,
      }}
    />
  );
}
