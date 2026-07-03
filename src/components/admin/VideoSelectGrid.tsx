"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type SelectableVideo = {
  id: string;
  slug: string;
  title: string;
  durationLabel: string;
  viewCount: number;
  createdAt: string;
  thumb: string;
  preview: string;
  watchUrl: string;
  pornstars: { name: string; slug: string }[];
};

function timeAgo(date: string) {
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
  selected,
  playing,
  onToggle,
  onEnter,
  onLeave,
  register,
}: {
  v: SelectableVideo;
  selected: boolean;
  playing: boolean;
  onToggle: () => void;
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
      try {
        el.currentTime = 0;
      } catch {}
    }
  }, [playing]);

  return (
    <div
      ref={register}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`group relative overflow-hidden rounded-xl border bg-zinc-900 transition-colors ${
        selected ? "border-brand-500 ring-1 ring-brand-500/40" : "border-zinc-800 hover:border-zinc-600"
      }`}
    >
      <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand-600 focus:ring-brand-500"
        />
        Select
      </label>

      <Link
        href={v.watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
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
    </div>
  );
}

/** Main-site style grid with checkboxes for agent video selection. */
export default function VideoSelectGrid({
  videos,
  selectedIds,
  onToggle,
}: {
  videos: SelectableVideo[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
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
  }, [isTouch, videos]);

  if (videos.length === 0) {
    return <p className="py-12 text-center text-zinc-500">No videos matched your search.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {videos.map((v) => (
        <Card
          key={v.id}
          v={v}
          selected={selectedIds.has(v.id)}
          playing={playingId === v.id}
          onToggle={() => onToggle(v.id)}
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
