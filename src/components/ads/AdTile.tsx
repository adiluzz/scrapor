"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import InGridAdShell from "@/components/ads/InGridAdShell";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";
import { watchAdFill } from "@/lib/ad-fill";
import { pushJuicyZone } from "@/lib/juicy-ads";

/**
 * In-grid Exo ad with optional Juicy tile fallback on no-fill.
 */
export default function AdTile({
  zoneId,
  insClass = EXO_INS_CLASS,
  width = 300,
  height = 250,
  juicyFallbackZoneId,
  juicyEnabled = true,
}: {
  zoneId?: string | null;
  insClass?: string | null;
  width?: number;
  height?: number;
  juicyFallbackZoneId?: string | null;
  juicyEnabled?: boolean;
}) {
  const instanceId = useId().replace(/:/g, "");
  const resolvedClass = insClass || EXO_INS_CLASS;
  const mediaRef = useRef<HTMLDivElement>(null);
  const exoRef = useRef<HTMLModElement>(null);
  const juicyRef = useRef<HTMLModElement>(null);
  const [mode, setMode] = useState<"exo" | "juicy" | "hidden">("exo");
  const [scale, setScale] = useState(1);

  const hasJuicyFallback = Boolean(juicyEnabled && juicyFallbackZoneId);

  useEffect(() => {
    if (!zoneId) return;
    serveExoAds();
    let cancelled = false;
    void watchAdFill(exoRef.current, { timeoutMs: 8000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode(hasJuicyFallback ? "juicy" : "hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [zoneId, hasJuicyFallback]);

  useEffect(() => {
    if (mode !== "juicy" || !juicyFallbackZoneId) return;
    pushJuicyZone(juicyFallbackZoneId);
    let cancelled = false;
    void watchAdFill(juicyRef.current, { timeoutMs: 8000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) setMode("hidden");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, juicyFallbackZoneId]);

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

  if (!zoneId && !hasJuicyFallback) return null;
  if (mode === "hidden") return null;

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
          {mode === "exo" && zoneId && (
            <ins
              ref={exoRef}
              className={resolvedClass}
              data-zoneid={zoneId}
              style={{ display: "block", width, height }}
            />
          )}
          {mode === "juicy" && juicyFallbackZoneId && (
            <ins
              ref={juicyRef}
              id={`juicy-tile-${juicyFallbackZoneId}-${instanceId}`}
              data-adzone={juicyFallbackZoneId}
              data-width={width}
              data-height={height}
              style={{ display: "block", width, height }}
            />
          )}
        </div>
      </div>
    </InGridAdShell>
  );
}
