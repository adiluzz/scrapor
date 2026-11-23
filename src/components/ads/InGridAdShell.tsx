import type { ReactNode } from "react";

/**
 * Same outer size as a video card. The creative covers the whole card;
 * the spacer only reserves that height so the grid row stays even.
 */
export default function InGridAdShell({ children }: { children: ReactNode }) {
  return (
    <div className="ad-slot-tile relative flex h-full min-w-[250px] w-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="aspect-video w-full shrink-0" aria-hidden="true" />
      <div className="video-card-meta" aria-hidden="true" />
      <div className="ad-slot-tile-media">{children}</div>
    </div>
  );
}
