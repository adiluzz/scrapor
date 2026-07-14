"use client";

import { useEffect, useId } from "react";

/**
 * JuicyAds zone — loads their zone script when a zone ID is configured.
 * Used as secondary fill alongside ExoClick.
 */
export default function JuicyAdZone({
  zoneId,
  enabled = true,
  className = "",
  label = true,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  className?: string;
  label?: boolean;
}) {
  const reactId = useId();
  const containerId = `juicy-${reactId.replace(/:/g, "")}`;

  useEffect(() => {
    if (!enabled || !zoneId) return;
    const existing = document.querySelector(`script[data-juicy-zone="${zoneId}"]`);
    if (existing) return;
    const script = document.createElement("script");
    script.async = true;
    script.dataset.juicyZone = zoneId;
    script.src = `https://js.juicyads.com/${zoneId}.js`;
    document.body.appendChild(script);
  }, [enabled, zoneId]);

  if (!enabled || !zoneId) return null;

  return (
    <div className={`flex w-full flex-col items-center overflow-x-hidden ${className}`}>
      {label && <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>}
      <div id={containerId} className="flex w-full max-w-full justify-center overflow-x-hidden" />
    </div>
  );
}
