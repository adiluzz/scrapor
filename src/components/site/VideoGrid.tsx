"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { VideoCardData } from "@/lib/queries";
import VideoCardPreview from "@/components/site/VideoCardPreview";
import AdTile from "@/components/ads/AdTile";
import JuicyAdTile from "@/components/ads/JuicyAdTile";

const CARD_MIN = 250;
const GRID_GAP = 12; // gap-3

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
      className="group flex h-full min-w-[250px] w-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
    >
      <div className="relative aspect-video shrink-0 overflow-hidden bg-zinc-800">
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
      <div className="video-card-meta">
        <h3 className="line-clamp-2 min-h-[2.5rem] break-words text-sm leading-5 text-zinc-200 group-hover:text-white">
          {v.title}
        </h3>
        <p className="mt-1 h-4 truncate text-xs leading-4 text-brand-400/80">
          {v.pornstars.length > 0
            ? v.pornstars.map((p) => p.name).join(", ")
            : "\u00a0"}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-zinc-500">
          {views(v.viewCount)} views · {timeAgo(v.createdAt)}
        </p>
      </div>
    </Link>
  );
}

type Item =
  | { kind: "video"; v: VideoCardData }
  | { kind: "exo" }
  | { kind: "juicy" }
  | { kind: "mid" };

/**
 * Pack videos into complete rows. In-grid ads take the last slot of a row so
 * the mid banner never lands under a short row. Mid break is based on video
 * rows only (never on ad tiles that may later no-fill).
 */
function buildItems({
  videos,
  cols,
  midBanner,
  midAfterRows,
  wantExo,
  wantJuicy,
}: {
  videos: VideoCardData[];
  cols: number | null;
  midBanner: ReactNode;
  midAfterRows: number;
  wantExo: boolean;
  wantJuicy: boolean;
}): Item[] {
  // Until column count is measured, render videos only (no mid/ads).
  if (!cols || cols < 1) {
    return videos.map((v) => ({ kind: "video" as const, v }));
  }

  const items: Item[] = [];
  let vi = 0;
  const pushVideos = (n: number) => {
    for (let k = 0; k < n && vi < videos.length; k++) {
      items.push({ kind: "video", v: videos[vi++]! });
    }
  };

  const rowsBeforeMid = Math.max(1, midAfterRows);
  // Prefer Juicy for the pre-mid in-grid slot (usually fills); Exo after mid.
  const preMidAd: "juicy" | "exo" | null = wantJuicy
    ? "juicy"
    : wantExo
      ? "exo"
      : null;
  const postMidAd: "juicy" | "exo" | null =
    preMidAd === "juicy" && wantExo
      ? "exo"
      : preMidAd === "exo" && wantJuicy
        ? "juicy"
        : preMidAd === null && wantExo
          ? "exo"
          : preMidAd === null && wantJuicy
            ? "juicy"
            : null;

  for (let row = 0; row < rowsBeforeMid && vi < videos.length; row++) {
    const putAd = row === 0 && preMidAd && videos.length >= cols;
    if (putAd) {
      pushVideos(cols - 1);
      items.push({ kind: preMidAd });
    } else {
      pushVideos(cols);
    }
  }

  if (midBanner && vi > 0 && vi < videos.length) {
    items.push({ kind: "mid" });
  }

  if (postMidAd && vi + (cols - 1) <= videos.length) {
    pushVideos(cols - 1);
    items.push({ kind: postMidAd });
  }

  while (vi < videos.length) {
    pushVideos(videos.length - vi);
  }

  return items;
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
  juicyTileZoneId,
  juicyTileEnabled = true,
  midBanner = null,
  midAfterRows = 2,
}: {
  videos: VideoCardData[];
  hrefPrefix?: string;
  adTileZoneId?: string | null;
  adTileInsClass?: string | null;
  /** @deprecated ignored — placement is column-aligned */
  adTilePositions?: number[];
  juicyTileZoneId?: string | null;
  juicyTileEnabled?: boolean;
  /** @deprecated ignored — placement is column-aligned */
  juicyTilePositions?: number[];
  midBanner?: ReactNode;
  midAfterRows?: number;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [cols, setCols] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const els = useRef<Map<string, HTMLElement>>(new Map());
  const ratios = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const next = Math.max(1, Math.floor((w + GRID_GAP) / (CARD_MIN + GRID_GAP)));
      setCols(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
        let bestRatio = 0.5;
        Array.from(ratios.current.entries()).forEach(([id, r]) => {
          if (r > bestRatio) {
            bestRatio = r;
            best = id;
          }
        });
        setPlayingId(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    Array.from(els.current.values()).forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isTouch, videos, cols]);

  if (videos.length === 0) {
    return <p className="py-20 text-center text-zinc-500">No videos found.</p>;
  }

  const wantExo = Boolean(adTileZoneId);
  const wantJuicy = Boolean(juicyTileEnabled && juicyTileZoneId);
  const items = buildItems({
    videos,
    cols,
    midBanner,
    midAfterRows,
    wantExo,
    wantJuicy,
  });

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] items-stretch gap-3"
    >
      {items.map((item, i) => {
        if (item.kind === "mid") {
          return (
            <div key={`mid-${i}`} className="col-span-full">
              {midBanner}
            </div>
          );
        }
        if (item.kind === "exo") {
          return (
            <AdTile
              key={`exo-${i}`}
              zoneId={adTileZoneId}
              insClass={adTileInsClass}
            />
          );
        }
        if (item.kind === "juicy") {
          return (
            <JuicyAdTile
              key={`juicy-${i}`}
              zoneId={juicyTileZoneId}
              enabled={juicyTileEnabled}
            />
          );
        }
        const v = item.v;
        return (
          <Card
            key={v.id}
            v={v}
            href={`${hrefPrefix}/${v.slug}`}
            playing={playingId === v.id}
            onEnter={() => !isTouch && setPlayingId(v.id)}
            onLeave={() =>
              !isTouch && setPlayingId((p) => (p === v.id ? null : p))
            }
            register={(el) => {
              if (el) {
                el.dataset.vid = v.id;
                els.current.set(v.id, el);
              } else els.current.delete(v.id);
            }}
          />
        );
      })}
    </div>
  );
}
