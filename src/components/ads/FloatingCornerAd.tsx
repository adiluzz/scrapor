"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";
import { watchAdFill } from "@/lib/ad-fill";
import { pushJuicyZone } from "@/lib/juicy-ads";

/**
 * Dismissible floating corner ad: Juicy vidfloat first, Exo banner fallback.
 */
export default function FloatingCornerAd({
  zoneId,
  enabled = true,
  exoFallbackZoneId,
  exoInsClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  exoFallbackZoneId?: string | null;
  exoInsClass?: string | null;
}) {
  const instanceId = useId().replace(/:/g, "");
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<"juicy" | "exo" | "hidden">(() =>
    zoneId ? "juicy" : exoFallbackZoneId ? "exo" : "hidden"
  );
  const juicyRef = useRef<HTMLModElement>(null);
  const exoRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!enabled || dismissed) return;
    if (mode !== "juicy" || !zoneId) return;
    pushJuicyZone(zoneId);
    let cancelled = false;
    void watchAdFill(juicyRef.current, { timeoutMs: 6000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode(exoFallbackZoneId ? "exo" : "hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, dismissed, mode, zoneId, exoFallbackZoneId]);

  useEffect(() => {
    if (!enabled || dismissed || mode !== "exo" || !exoFallbackZoneId) return;
    serveExoAds();
    let cancelled = false;
    void watchAdFill(exoRef.current, { timeoutMs: 6000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode("hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, dismissed, mode, exoFallbackZoneId]);

  if (!enabled || dismissed || mode === "hidden") return null;
  if (!zoneId && !exoFallbackZoneId) return null;

  const resolvedClass = exoInsClass || EXO_INS_CLASS;

  return (
    <div className="fixed bottom-4 right-4 z-40 hidden lg:block">
      <div className="relative rounded-lg border border-zinc-800 bg-zinc-950/95 p-1 shadow-xl">
        <button
          type="button"
          aria-label="Dismiss ad"
          onClick={() => setDismissed(true)}
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs text-zinc-400 hover:text-white"
        >
          ✕
        </button>
        <div className="ad-slot">
          {mode === "juicy" && zoneId && (
            <ins
              ref={juicyRef}
              id={`juicy-float-${zoneId}-${instanceId}`}
              data-adzone={zoneId}
              data-width={300}
              data-height={250}
              className="ad-slot-fill inline-block"
              style={{ display: "block", width: 300, height: 250 }}
            />
          )}
          {mode === "exo" && exoFallbackZoneId && (
            <ins
              ref={exoRef}
              className={resolvedClass}
              data-zoneid={exoFallbackZoneId}
              style={{ display: "block", width: 300, height: 250 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
