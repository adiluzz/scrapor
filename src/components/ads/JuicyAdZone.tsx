"use client";

import JuicyFrame from "@/components/ads/JuicyFrame";

/**
 * JuicyAds zone. The network script runs inside JuicyFrame so it cannot
 * replace nodes in the page React tree.
 */
export default function JuicyAdZone({
  zoneId,
  enabled = true,
  className = "",
  label = false,
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
  if (!enabled || !zoneId) return null;

  return (
    <div className={`ad-slot ${className}`}>
      {label && (
        <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>
      )}
      <JuicyFrame zoneId={zoneId} width={width} height={height} className="ad-slot-fill" />
    </div>
  );
}
