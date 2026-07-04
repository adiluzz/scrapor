"use client";

import { useEffect, useRef, useState } from "react";
import {
  STORYBOARD_COLS,
} from "@/lib/preview";

export type VideoCardPreviewData = {
  /** Same-origin MP4 URL (legacy + v2). */
  previewMp4: string | null;
  /** Same-origin storyboard sprite for tile cycling. */
  previewSprite: string | null;
  /** Tile indices into the storyboard sprite. */
  previewSpriteFrames: number[];
  /** Rows in the storyboard sprite sheet. */
  previewSpriteRows: number;
};

export default function VideoCardPreview({
  data,
  playing,
  className = "",
}: {
  data: VideoCardPreviewData;
  playing: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const useMp4 = Boolean(data.previewMp4);
  const useSprite = !useMp4 && Boolean(data.previewSprite && data.previewSpriteFrames.length);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !data.previewMp4) return;
    if (playing) {
      if (el.src !== data.previewMp4) {
        el.src = data.previewMp4;
        el.load();
      }
      void el.play().catch(() => {});
    } else {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [playing, data.previewMp4]);

  useEffect(() => {
    if (!playing || !useSprite) {
      setFrameIdx(0);
      return;
    }
    const id = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % data.previewSpriteFrames.length);
    }, 400);
    return () => window.clearInterval(id);
  }, [playing, useSprite, data.previewSpriteFrames.length]);

  if (!useMp4 && !useSprite) return null;

  if (useMp4) {
    return (
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
          playing ? "opacity-100" : "opacity-0"
        } ${className}`}
      />
    );
  }

  const tile = data.previewSpriteFrames[frameIdx] ?? 0;
  const col = tile % STORYBOARD_COLS;
  const row = Math.floor(tile / STORYBOARD_COLS);
  const rows = Math.max(1, data.previewSpriteRows);
  const posX = STORYBOARD_COLS > 1 ? (col / (STORYBOARD_COLS - 1)) * 100 : 0;
  const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-200 ${
        playing ? "opacity-100" : "opacity-0"
      } ${className}`}
      style={{
        backgroundImage: `url(${data.previewSprite})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${STORYBOARD_COLS * 100}% ${rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
}
