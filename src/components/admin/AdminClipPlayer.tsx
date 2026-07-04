"use client";

import { forwardRef, useEffect, useState } from "react";
import VideoPlayer, { type VideoPlayerHandle } from "@/components/player/VideoPlayer";
import type { StoryboardCue } from "@/lib/storyboard";

type PlayerMeta = {
  poster: string;
  storyboard: { sprite: string; cues: StoryboardCue[] } | null;
  heatmap: number[];
  durationSec: number | null;
};

const AdminClipPlayer = forwardRef<
  VideoPlayerHandle,
  {
    videoId: string;
    initialPositionSec?: number;
    clipLoop?: { startSec: number; endSec: number };
    autoStart?: boolean;
    muted?: boolean;
    onTimeUpdate?: (currentTime: number) => void;
    onDuration?: (duration: number) => void;
  }
>(function AdminClipPlayer(
  {
    videoId,
    initialPositionSec = 0,
    clipLoop,
    autoStart = false,
    muted = false,
    onTimeUpdate,
    onDuration,
  },
  ref
) {
  const [meta, setMeta] = useState<PlayerMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setError(null);
    fetch(`/api/admin/videos/${videoId}/player-meta`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.poster) throw new Error(data.error || "Failed to load player");
        setMeta({
          poster: data.poster,
          storyboard: data.storyboard ?? null,
          heatmap: data.heatmap ?? [],
          durationSec: data.durationSec ?? null,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (error) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-black text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-black text-sm text-zinc-500">
        Loading player…
      </div>
    );
  }

  return (
    <VideoPlayer
      ref={ref}
      key={videoId}
      videoId={videoId}
      poster={meta.poster}
      storyboard={meta.storyboard}
      heatmap={meta.heatmap}
      initialPositionSec={initialPositionSec}
      adminPreview
      clipLoop={clipLoop}
      autoStart={autoStart}
      muted={muted}
      onTimeUpdate={onTimeUpdate}
      onDuration={onDuration}
    />
  );
});

export default AdminClipPlayer;
