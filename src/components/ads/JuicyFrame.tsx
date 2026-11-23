"use client";

import type { CSSProperties, Ref } from "react";
import { JUICY_SANDBOX, juicySlotSrcDoc } from "@/lib/juicy-ads";

/** One Juicy zone, isolated from the page React tree. */
export default function JuicyFrame({
  zoneId,
  width,
  height,
  className,
  style,
  frameRef,
}: {
  zoneId: string;
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
  frameRef?: Ref<HTMLIFrameElement>;
}) {
  return (
    <iframe
      ref={frameRef}
      title=""
      data-juicy-slot="1"
      sandbox={JUICY_SANDBOX}
      srcDoc={juicySlotSrcDoc(zoneId, width, height)}
      width={width}
      height={height}
      className={className}
      style={{
        border: 0,
        display: "block",
        width,
        height,
        maxWidth: "100%",
        background: "transparent",
        ...style,
      }}
    />
  );
}
