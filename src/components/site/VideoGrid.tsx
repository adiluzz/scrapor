"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { VideoCardData } from "@/lib/queries";
import VideoCardPreview from "@/components/site/VideoCardPreview";
import AdTile from "@/components/ads/AdTile";
import JuicyAdTile from "@/components/ads/JuicyAdTile";

function timeAgo(date: Date | string) {
  const d = new Date(date);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function views(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function Card({
  v,
  playing,
  onEnter,
  onLeave,
  register,
  href,
}: {
  v: VideoCardData;
  playing: boolean;
  onEnter: () => void;
  onLeave: () => void;
  register: (el: HTMLElement | null) => void;
  href: string;
}) {
  const hasPreview = Boolean(v.preview.previewMp4 || v.preview.previewSprite);

  return (
    <Link
      ref={register as never}
      href={href}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="group block min-w-[220px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
    >
      <div className="relative aspect-video overflow-hidden bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={v.thumb}
          alt={v.title}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            playing && hasPreview ? "opacity-0" : "opacity-100"
          }`}
        />
        <VideoCardPreview data={v.preview} playing={playing && hasPreview} />
        {v.durationLabel && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-white">
            {v.durationLabel}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="line-clamp-2 break-words text-sm text-zinc-200 group-hover:text-white">{v.title}</h3>
        {v.pornstars.length > 0 && (
          <p className="mt-1 truncate text-xs text-brand-400/80">
            {v.pornstars.map((p) => p.name).join(", ")}
          </p>
        )}
        <p className="mt-1 text-[11px] text-zinc-500">
          {views(v.viewCount)} views · {timeAgo(v.createdAt)}
        </p>
      </div>
    </Link>
  );
}

/**
 * Responsive grid. Desktop: hover swaps in muted looping preview clip.
 * Mobile (no hover): an IntersectionObserver plays the single most in-view
 * card's preview at a time.
 */
export default function VideoGrid({
  videos,
  hrefPrefix = "/videos",
  adTileZoneId,
  adTileInsClass,
  adTilePositions = [],
  juicyTileZoneId,
  juicyTileEnabled = true,
  juicyTilePositions = [],
}: {
  videos: VideoCardData[];
  /** Link prefix before `/${slug}` (default: public `/videos`). Must be a string — not a function — so Server Components can pass it. */
  hrefPrefix?: string;
  /** Exo native zone for card-sized in-grid ad tiles (hidden on no-fill). */
  adTileZoneId?: string | null;
  adTileInsClass?: string | null;
  /** 1-based card positions where an ad tile is inserted (e.g. [4, 12]). */
  adTilePositions?: number[];
  /** JuicyAds zone rendered as a card-sized in-grid tile. */
  juicyTileZoneId?: string | null;
  juicyTileEnabled?: boolean;
  /** 1-based card positions for Juicy tiles (e.g. [6]). */
  juicyTilePositions?: number[];
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const els = useRef<Map<string, HTMLElement>>(new Map());
  const ratios = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  useEffect(() => {
    if (!isTouch) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.vid;
          if (id) ratios.current.set(id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let best: string | null = null;
        let bestRatio = 0.5; // require majority visible
        Array.from(ratios.current.entries()).forEach(([id, r]) => {
          if (r > bestRatio) { bestRatio = r; best = id; }
        });
        setPlayingId(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    Array.from(els.current.values()).forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isTouch, videos]);

  if (videos.length === 0) {
    return <p className="py-20 text-center text-zinc-500">No videos found.</p>;
  }

  const tilePositions = adTileZoneId ? adTilePositions : [];
  const juicyPositions =
    juicyTileEnabled && juicyTileZoneId ? juicyTilePositions : [];

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {videos.map((v, i) => (
        <Fragment key={v.id}>
          {tilePositions.includes(i + 1) && (
            <AdTile zoneId={adTileZoneId} insClass={adTileInsClass} />
          )}
          {juicyPositions.includes(i + 1) && (
            <JuicyAdTile zoneId={juicyTileZoneId} enabled={juicyTileEnabled} />
          )}
          <Card
            v={v}
            href={`${hrefPrefix}/${v.slug}`}
            playing={playingId === v.id}
            onEnter={() => !isTouch && setPlayingId(v.id)}
            onLeave={() => !isTouch && setPlayingId((p) => (p === v.id ? null : p))}
            register={(el) => {
              if (el) {
                el.dataset.vid = v.id;
                els.current.set(v.id, el);
              } else els.current.delete(v.id);
            }}
          />
        </Fragment>
      ))}
    </div>
  );
}
