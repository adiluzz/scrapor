"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";
import { watchAdFill } from "@/lib/ad-fill";
import { pushJuicyZone } from "@/lib/juicy-ads";

type Phase = "primary" | "fallback" | "hidden";

/**
 * Banner slot with Exo ↔ Juicy waterfall. Hides the container when both networks
 * have no fill so empty "new ad slot" placeholders do not linger on the page.
 */
export default function BannerAdSlot({
  exoZoneId,
  juicyZoneId,
  juicyEnabled = true,
  insClass = EXO_INS_CLASS,
  preferJuicy = false,
  minHeight = 90,
  width = 300,
  height = 250,
  label = true,
  className = "",
  fillTimeoutMs = 6000,
}: {
  exoZoneId?: string | null;
  juicyZoneId?: string | null;
  juicyEnabled?: boolean;
  insClass?: string | null;
  /** When true, try Juicy first (sidebar under-player). Default: Exo first. */
  preferJuicy?: boolean;
  minHeight?: number;
  width?: number;
  height?: number;
  label?: boolean;
  className?: string;
  fillTimeoutMs?: number;
}) {
  const instanceId = useId().replace(/:/g, "");
  const exoRef = useRef<HTMLModElement>(null);
  const juicyRef = useRef<HTMLModElement>(null);
  const resolvedClass = insClass || EXO_INS_CLASS;

  const hasExo = Boolean(exoZoneId);
  const hasJuicy = Boolean(juicyEnabled && juicyZoneId);

  const [phase, setPhase] = useState<Phase>(() => {
    if (preferJuicy && hasJuicy) return "primary";
    if (hasExo) return "primary";
    if (hasJuicy) return "primary";
    return "hidden";
  });

  const primaryIsJuicy = preferJuicy && hasJuicy;
  const fallbackIsJuicy = !preferJuicy && hasJuicy;
  const hasCrossFallback =
    (preferJuicy && hasExo) || (!preferJuicy && hasJuicy && hasExo);

  useEffect(() => {
    if (phase !== "primary") return;

    let cancelled = false;
    const run = async () => {
      if (primaryIsJuicy && juicyZoneId) {
        pushJuicyZone(juicyZoneId);
      } else if (exoZoneId) {
        serveExoAds();
      }

      const el = primaryIsJuicy ? juicyRef.current : exoRef.current;
      const empty = await watchAdFill(el, { timeoutMs: fillTimeoutMs, minHeight });
      if (cancelled) return;
      if (empty) {
        setPhase(hasCrossFallback ? "fallback" : "hidden");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [phase, primaryIsJuicy, exoZoneId, juicyZoneId, hasCrossFallback, fillTimeoutMs, minHeight]);

  useEffect(() => {
    if (phase !== "fallback") return;

    let cancelled = false;
    const run = async () => {
      if (fallbackIsJuicy && juicyZoneId) {
        pushJuicyZone(juicyZoneId);
      } else if (exoZoneId) {
        serveExoAds();
      }

      const el = fallbackIsJuicy ? juicyRef.current : exoRef.current;
      const empty = await watchAdFill(el, { timeoutMs: fillTimeoutMs, minHeight });
      if (cancelled) return;
      if (empty) setPhase("hidden");
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [phase, fallbackIsJuicy, exoZoneId, juicyZoneId, fillTimeoutMs, minHeight]);

  if (!hasExo && !hasJuicy) return null;
  if (phase === "hidden") return null;

  const showExo = (phase === "primary" && !primaryIsJuicy) || (phase === "fallback" && !fallbackIsJuicy);
  const showJuicy = (phase === "primary" && primaryIsJuicy) || (phase === "fallback" && fallbackIsJuicy);
  const juicyInsId = juicyZoneId ? `juicy-${juicyZoneId}-${instanceId}` : undefined;

  return (
    <div className={`ad-slot ${className}`}>
      {label && (
        <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>
      )}
      {showExo && exoZoneId && (
        <ins
          ref={exoRef}
          className={resolvedClass}
          data-zoneid={exoZoneId}
          style={{ display: "block", minHeight }}
        />
      )}
      {showJuicy && juicyInsId && (
        <ins
          ref={juicyRef}
          id={juicyInsId}
          data-adzone={juicyZoneId!}
          data-width={width}
          data-height={height}
          className="ad-slot-fill inline-block max-w-full"
          style={{ display: "block", width, height, maxWidth: "100%", minHeight }}
        />
      )}
    </div>
  );
}
