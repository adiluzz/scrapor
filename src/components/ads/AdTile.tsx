"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import InGridAdShell from "@/components/ads/InGridAdShell";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

/**
 * In-grid Exo ad matching a video card (16:9 media + fixed meta strip).
 * Cover-scales a 300×250 slot into the thumb. Keeps the card shell on
 * no-fill so the grid row does not collapse short.
 */
export default function AdTile({
  zoneId,
  insClass = EXO_INS_CLASS,
  width = 300,
  height = 250,
}: {
  zoneId?: string | null;
  insClass?: string | null;
  width?: number;
  height?: number;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;
  const mediaRef = useRef<HTMLDivElement>(null);
  const insRef = useRef<HTMLModElement>(null);
  const [empty, setEmpty] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!zoneId) return;
    serveExoAds();
    const check = () => {
      const el = insRef.current;
      if (!el) return;
      if (el.childElementCount === 0 || el.offsetHeight === 0) setEmpty(true);
    };
    const timer = setTimeout(check, 8000);
    return () => clearTimeout(timer);
  }, [zoneId]);

  useLayoutEffect(() => {
    const el = mediaRef.current;
    if (!el || !zoneId) return;

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
    const t3 = window.setTimeout(update, 4000);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [zoneId, width, height]);

  if (!zoneId) return null;

  return (
    <InGridAdShell>
      <div
        ref={mediaRef}
        className={`absolute inset-0 overflow-hidden ${empty ? "opacity-40" : ""}`}
      >
        <div
          className="ad-slot-tile-scale"
          style={{
            width,
            height,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <ins
            ref={insRef}
            className={resolvedClass}
            data-zoneid={zoneId}
            style={{ display: "block", width, height }}
          />
        </div>
      </div>
    </InGridAdShell>
  );
}
