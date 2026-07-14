import type { ReactNode } from "react";

/**
 * Shared chrome for in-grid ads so they match video cards:
 * 16:9 media + fixed meta strip height.
 */
export default function InGridAdShell({ children }: { children: ReactNode }) {
  return (
    <div className="ad-slot-tile group flex h-full min-w-[250px] w-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
      <div className="ad-slot-tile-media relative aspect-video shrink-0 overflow-hidden bg-zinc-800">
        {children}
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-zinc-300">
          Ad
        </span>
      </div>
      <div className="video-card-meta" aria-hidden="true">
        <p className="min-h-[2.5rem] text-sm leading-5 text-zinc-500">Sponsored</p>
        <p className="mt-1 h-4 text-xs leading-4">{"\u00a0"}</p>
        <p className="mt-1 text-[11px] leading-4 text-zinc-600">Advertisement</p>
      </div>
    </div>
  );
}
