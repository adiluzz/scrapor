"use client";

import { useEffect, useId } from "react";
import { pushJuicyZone } from "@/lib/juicy-ads";

/**
 * JuicyAds v3 zone — loads jads.js once, renders `<ins>`, queues adzone push.
 */
export default function JuicyAdZone({
  zoneId,
  enabled = true,
  className = "",
  label = true,
  width = 300,
  height = 250,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  className?: string;
  label?: boolean;
  width?: number;
  height?: number;
}) {
  const instanceId = useId().replace(/:/g, "");

  useEffect(() => {
    if (!enabled || !zoneId) return;
    pushJuicyZone(zoneId);
  }, [enabled, zoneId]);

  if (!enabled || !zoneId) return null;

  return (
    <div className={`ad-slot ${className}`}>
      {label && (
        <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>
      )}
      <ins
        id={`juicy-${zoneId}-${instanceId}`}
        data-adzone={zoneId}
        data-width={width}
        data-height={height}
        className="ad-slot-fill inline-block max-w-full"
        style={{ display: "block", width, height, maxWidth: "100%" }}
      />
    </div>
  );
}
