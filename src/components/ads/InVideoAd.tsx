"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";
import { watchAdFill } from "@/lib/ad-fill";
import { pushJuicyZone } from "@/lib/juicy-ads";

type Mode = "juicy" | "exo" | "hidden";

/**
 * Dismissible in-video overlay: Juicy invideo zone first, Exo banner fallback.
 */
export default function InVideoAd({
  zoneId,
  exoFallbackZoneId,
  exoInsClass = EXO_INS_CLASS,
  width = 300,
  height = 100,
  onDismiss,
}: {
  zoneId?: string | null;
  exoFallbackZoneId?: string | null;
  exoInsClass?: string | null;
  width?: number;
  height?: number;
  onDismiss: () => void;
}) {
  const instanceId = useId().replace(/:/g, "");
  const juicyRef = useRef<HTMLModElement>(null);
  const exoRef = useRef<HTMLModElement>(null);
  const [mode, setMode] = useState<Mode>(() => (zoneId ? "juicy" : exoFallbackZoneId ? "exo" : "hidden"));

  useEffect(() => {
    if (mode !== "juicy" || !zoneId) return;
    pushJuicyZone(zoneId);
    let cancelled = false;
    void watchAdFill(juicyRef.current, { timeoutMs: 5000, minHeight: 30 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode(exoFallbackZoneId ? "exo" : "hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, zoneId, exoFallbackZoneId]);

  useEffect(() => {
    if (mode !== "exo" || !exoFallbackZoneId) return;
    serveExoAds();
    let cancelled = false;
    void watchAdFill(exoRef.current, { timeoutMs: 5000, minHeight: 30 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode("hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, exoFallbackZoneId]);

  useEffect(() => {
    if (mode === "hidden") onDismiss();
  }, [mode, onDismiss]);

  if (mode === "hidden") return null;

  const resolvedClass = exoInsClass || EXO_INS_CLASS;

  return (
    <div className="relative rounded-md bg-black/60 p-1 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Dismiss ad"
        onClick={onDismiss}
        className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/95 text-[10px] text-zinc-300 ring-1 ring-zinc-700 hover:text-white"
      >
        ✕
      </button>
      <div className="ad-slot">
        {mode === "juicy" && zoneId && (
          <ins
            ref={juicyRef}
            id={`juicy-invideo-${zoneId}-${instanceId}`}
            data-adzone={zoneId}
            data-width={width}
            data-height={height}
            className="ad-slot-fill inline-block max-w-full"
            style={{ display: "block", width, height, maxWidth: "100%" }}
          />
        )}
        {mode === "exo" && exoFallbackZoneId && (
          <ins
            ref={exoRef}
            className={resolvedClass}
            data-zoneid={exoFallbackZoneId}
            style={{ display: "block", width, height, maxWidth: "100%" }}
          />
        )}
      </div>
    </div>
  );
}
