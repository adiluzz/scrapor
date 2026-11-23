"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import InGridAdShell from "@/components/ads/InGridAdShell";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";
import { watchAdFill } from "@/lib/ad-fill";
import { trackAdEvent } from "@/lib/ad-events";
import { adZoneKey, claimZone, releaseZone } from "@/lib/ad-zone-claim";
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
  placement = "grid_tile",
}: {
  zoneId?: string | null;
  insClass?: string | null;
  width?: number;
  height?: number;
  juicyFallbackZoneId?: string | null;
  juicyEnabled?: boolean;
  placement?: string;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;
  const mediaRef = useRef<HTMLDivElement>(null);
  const exoRef = useRef<HTMLModElement>(null);
  const juicyRef = useRef<HTMLModElement>(null);
  const [mode, setMode] = useState<"exo" | "juicy" | "hidden">("exo");
  const [scale, setScale] = useState(1);

  const hasJuicyFallback = Boolean(juicyEnabled && juicyFallbackZoneId);

  useEffect(() => {
    if (!zoneId || mode !== "exo") return;
    const key = adZoneKey("exo", zoneId);
    if (!claimZone(key)) {
      setMode(hasJuicyFallback ? "juicy" : "hidden");
      if (!hasJuicyFallback) trackAdEvent("slot_empty", { placement });
      return;
    }
    serveExoAds();
    let cancelled = false;
    void watchAdFill(exoRef.current, { timeoutMs: 8000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) {
        setMode(hasJuicyFallback ? "juicy" : "hidden");
        if (!hasJuicyFallback) trackAdEvent("slot_empty", { placement });
      } else {
        trackAdEvent("slot_filled", { placement, network: "exo", zone_id: zoneId });
      }
    });
    return () => {
      cancelled = true;
      releaseZone(key);
    };
  }, [zoneId, hasJuicyFallback, mode, placement]);

  useEffect(() => {
    if (mode !== "juicy" || !juicyFallbackZoneId) return;
    const key = adZoneKey("juicy", juicyFallbackZoneId);
    if (!claimZone(key)) {
      setMode("hidden");
      trackAdEvent("slot_empty", { placement });
      return;
    }
    pushJuicyZone(juicyFallbackZoneId);
    let cancelled = false;
    void watchAdFill(juicyRef.current, { timeoutMs: 8000, minHeight: 40 }).then((empty) => {
      if (cancelled) return;
      if (empty) {
        setMode("hidden");
        trackAdEvent("slot_empty", { placement });
      } else {
        trackAdEvent("slot_filled", { placement, network: "juicy", zone_id: juicyFallbackZoneId });
      }
    });
    return () => {
      cancelled = true;
      releaseZone(key);
    };
  }, [mode, juicyFallbackZoneId, placement]);

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
              id={String(juicyFallbackZoneId)}
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
