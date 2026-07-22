"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import InGridAdShell from "@/components/ads/InGridAdShell";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";
import { watchAdFill } from "@/lib/ad-fill";
import { pushJuicyZone } from "@/lib/juicy-ads";

/**
 * In-grid Juicy ad with optional Exo native tile fallback on no-fill.
 */
export default function JuicyAdTile({
  zoneId,
  enabled = true,
  width = 300,
  height = 250,
  exoFallbackZoneId,
  exoInsClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  width?: number;
  height?: number;
  exoFallbackZoneId?: string | null;
  exoInsClass?: string | null;
}) {
  const instanceId = useId().replace(/:/g, "");
  const mediaRef = useRef<HTMLDivElement>(null);
  const juicyRef = useRef<HTMLModElement>(null);
  const exoRef = useRef<HTMLModElement>(null);
  const [mode, setMode] = useState<"juicy" | "exo" | "hidden">("juicy");
  const [scale, setScale] = useState(1);

  const hasExoFallback = Boolean(exoFallbackZoneId);

  useEffect(() => {
    if (!enabled || !zoneId) return;
    pushJuicyZone(zoneId);
    let cancelled = false;
    void watchAdFill(juicyRef.current, { timeoutMs: 8000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode(hasExoFallback ? "exo" : "hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, zoneId, hasExoFallback]);

  useEffect(() => {
    if (mode !== "exo" || !exoFallbackZoneId) return;
    serveExoAds();
    let cancelled = false;
    void watchAdFill(exoRef.current, { timeoutMs: 8000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode("hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, exoFallbackZoneId]);

  useLayoutEffect(() => {
    const el = mediaRef.current;
    if (!el || mode === "hidden") return;

    const update = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      if (w <= 0 || h <= 0) return;
      setScale(Math.max(w / width, h / height));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const t1 = window.setTimeout(update, 400);
    const t2 = window.setTimeout(update, 1500);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mode, width, height]);

  if (!enabled || (!zoneId && !hasExoFallback)) return null;
  if (mode === "hidden") return null;

  const resolvedClass = exoInsClass || EXO_INS_CLASS;

  return (
    <InGridAdShell>
      <div ref={mediaRef} className="absolute inset-0 overflow-hidden">
        <div
          className="ad-slot-tile-scale"
          style={{
            width,
            height,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          {mode === "juicy" && zoneId && (
            <ins
              ref={juicyRef}
              id={`juicy-tile-${zoneId}-${instanceId}`}
              data-adzone={zoneId}
              data-width={width}
              data-height={height}
              style={{ display: "block", width, height }}
            />
          )}
          {mode === "exo" && exoFallbackZoneId && (
            <ins
              ref={exoRef}
              className={resolvedClass}
              data-zoneid={exoFallbackZoneId}
              style={{ display: "block", width, height }}
            />
          )}
        </div>
      </div>
    </InGridAdShell>
  );
}
