"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { VideoCardData } from "@/lib/queries";

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
}: {
  v: VideoCardData;
  playing: boolean;
  onEnter: () => void;
  onLeave: () => void;
  register: (el: HTMLElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.play().catch(() => {});
    } else {
      el.pause();
      try { el.currentTime = 0; } catch {}
    }
  }, [playing]);

  return (
    <Link
      ref={register as never}
      href={`/videos/${v.slug}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="group block overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
    >
      <div className="relative aspect-video overflow-hidden bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={v.thumb}
          alt={v.title}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            playing ? "opacity-0" : "opacity-100"
          }`}
        />
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            playing ? "opacity-100" : "opacity-0"
          }`}
        >
          {playing && <source src={v.preview} type="video/mp4" />}
        </video>
        {v.durationLabel && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-white">
            {v.durationLabel}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="line-clamp-2 text-sm text-zinc-200 group-hover:text-white">{v.title}</h3>
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
 * Responsive grid. Desktop: hover swaps in the muted looping preview clip.
 * Mobile (no hover): an IntersectionObserver plays the single most in-view
 * card's preview at a time.
 */
export default function VideoGrid({ videos }: { videos: VideoCardData[] }) {
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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {videos.map((v) => (
        <Card
          key={v.id}
          v={v}
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
      ))}
    </div>
  );
}
