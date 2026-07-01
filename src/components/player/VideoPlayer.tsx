"use client";

import { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import type Player from "video.js/dist/types/player";
import Heatmap from "@/components/player/Heatmap";
import { fetchVastAd, fireImpressions } from "@/lib/vast";
import type { StoryboardCue } from "@/lib/storyboard";

type Storyboard = { sprite: string; cues: StoryboardCue[] } | null;

const BUCKET_SEC = 5;
const SKIP_FORWARD_SEC = 7;
const SKIP_BACK_SEC = 78;

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function findCue(cues: StoryboardCue[], time: number): StoryboardCue | null {
  if (!cues.length) return null;
  return cues.find((c) => time >= c.start && time < c.end) ?? cues[cues.length - 1];
}

export default function VideoPlayer({
  videoId,
  poster,
  storyboard,
  heatmap,
  initialPositionSec = 0,
  adminPreview = false,
}: {
  videoId: string;
  poster: string;
  storyboard: Storyboard;
  heatmap: number[];
  initialPositionSec?: number;
  /** Admin panel: skip ads and allow playback of soft-deleted videos. */
  adminPreview?: boolean;
}) {
  const videoRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const cuesRef = useRef<StoryboardCue[]>(storyboard?.cues ?? []);
  const scrubCleanupRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"idle" | "ad" | "loading" | "playing" | "error">("idle");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [adSkipIn, setAdSkipIn] = useState<number | null>(null);
  const [adCanSkip, setAdCanSkip] = useState(false);
  const adVideoRef = useRef<HTMLVideoElement>(null);
  const watchedBuckets = useRef<Set<number>>(new Set());
  const lastFlush = useRef(0);
  const viewCounted = useRef(false);
  const [preview, setPreview] = useState<{
    left: number;
    bottom: number;
    cue: StoryboardCue;
    time: number;
  } | null>(null);

  useEffect(() => {
    cuesRef.current = storyboard?.cues ?? [];
  }, [storyboard]);

  // Warm the sprite sheet so the first hover shows the frame immediately.
  useEffect(() => {
    if (!storyboard?.sprite) return;
    const img = new Image();
    img.src = storyboard.sprite;
  }, [storyboard?.sprite]);

  useEffect(() => {
    if (playerRef.current || !videoRef.current) return;
    const el = document.createElement("video-js");
    el.classList.add("vjs-big-play-centered", "vjs-scrubber-preview");
    videoRef.current.appendChild(el);
    const player = videojs(el, {
      controls: true,
      preload: "none",
      fluid: true,
      poster,
      playsinline: true,
    });
    playerRef.current = player;

    player.on("useractive", () => setControlsVisible(true));
    player.on("userinactive", () => setControlsVisible(false));
    player.on("pause", () => setControlsVisible(true));

    return () => {
      scrubCleanupRef.current?.();
      flushWatch(true);
      player.dispose();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function attachScrubberPreview() {
    scrubCleanupRef.current?.();
    scrubCleanupRef.current = null;

    const player = playerRef.current;
    const root = rootRef.current;
    if (!player || !root || !storyboard?.cues.length) return;

    const bind = () => {
      const seekBar = player.el().querySelector(".vjs-progress-holder") as HTMLElement | null;
      if (!seekBar) return;

      const onMove = (e: MouseEvent) => {
        const seekRect = seekBar.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        if (seekRect.width <= 0) return;

        const pct = Math.min(1, Math.max(0, (e.clientX - seekRect.left) / seekRect.width));
        const dur = player.duration();
        if (!dur || !Number.isFinite(dur)) return;

        const time = pct * dur;
        const cue = findCue(cuesRef.current, time);
        if (!cue) return;

        const half = cue.w / 2;
        const left = Math.min(rootRect.width - half, Math.max(half, e.clientX - rootRect.left));
        const bottom = rootRect.bottom - seekRect.top + 12;
        setPreview({ left, bottom, cue, time });
      };
      const onLeave = () => setPreview(null);

      seekBar.addEventListener("mousemove", onMove);
      seekBar.addEventListener("mouseleave", onLeave);
      scrubCleanupRef.current = () => {
        seekBar.removeEventListener("mousemove", onMove);
        seekBar.removeEventListener("mouseleave", onLeave);
      };
    };

    if (player.readyState() >= 1) bind();
    else player.one("loadedmetadata", bind);
  }

  function flushWatch(useBeacon = false) {
    const buckets = Array.from(watchedBuckets.current);
    if (buckets.length === 0) return;
    const player = playerRef.current;
    const positionSec = player ? Math.floor(player.currentTime() || 0) : 0;
    const body = JSON.stringify({ buckets, positionSec });
    const url = `/api/videos/${videoId}/watch`;
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
    }
  }

  function attachContentTracking() {
    const player = playerRef.current;
    if (!player) return;

    player.on("timeupdate", () => {
      const t = player.currentTime() || 0;
      watchedBuckets.current.add(Math.floor(t / BUCKET_SEC));
      const now = Date.now();
      if (now - lastFlush.current > 10_000) {
        lastFlush.current = now;
        flushWatch();
      }
    });
    player.on("play", () => {
      if (!viewCounted.current) {
        viewCounted.current = true;
        fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => {});
      }
    });
    player.on("pause", () => flushWatch());
    player.on("ended", () => flushWatch());

    if (initialPositionSec > 0) {
      player.one("loadedmetadata", () => player.currentTime(initialPositionSec));
    }

    attachScrubberPreview();
  }

  useEffect(() => {
    const onUnload = () => flushWatch(true);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", () => document.hidden && flushWatch(true));
    return () => window.removeEventListener("beforeunload", onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player || status !== "playing") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const cur = player.currentTime() || 0;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        player.currentTime(Math.min(player.duration() || cur, cur + SKIP_FORWARD_SEC));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        player.currentTime(Math.max(0, cur - SKIP_BACK_SEC));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  async function grantAndPlay(adSessionId: string, outcome: string) {
    setStatus("loading");
    try {
      const res = await fetch(`/api/videos/${videoId}/stream-grant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adSessionId, outcome }),
      });
      if (!res.ok) throw new Error("grant failed");
      const { url } = await res.json();
      const player = playerRef.current!;
      player.src({ src: url, type: "video/mp4" });
      attachContentTracking();
      await player.play()?.catch(() => {});
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }

  async function runAd(adSessionId: string, vastTagUrl: string, cfg: { skipSeconds: number; timeoutMs: number }) {
    const ad = await fetchVastAd(vastTagUrl, cfg.timeoutMs);
    if (!ad) return grantAndPlay(adSessionId, "noad");

    setStatus("ad");
    fireImpressions(ad.impressionUrls);
    const adVideo = adVideoRef.current!;
    adVideo.src = ad.mediaUrl;
    const skipAfter = ad.skipOffsetSec ?? cfg.skipSeconds;
    setAdSkipIn(skipAfter);
    setAdCanSkip(false);

    const tick = setInterval(() => {
      setAdSkipIn((s) => {
        if (s === null) return null;
        if (s <= 1) { setAdCanSkip(true); clearInterval(tick); return 0; }
        return s - 1;
      });
    }, 1000);

    const finish = (outcome: string) => {
      clearInterval(tick);
      adVideo.pause();
      grantAndPlay(adSessionId, outcome);
    };
    adVideo.onended = () => finish("complete");
    adVideo.onerror = () => finish("error");
    (adVideo as HTMLVideoElement & { _skip?: () => void })._skip = () => finish("skip");
    await adVideo.play().catch(() => finish("error"));
  }

  async function start() {
    setStatus("loading");
    try {
      if (adminPreview) {
        const res = await fetch(`/api/admin/videos/${videoId}/playback`, { method: "POST" });
        if (!res.ok) throw new Error("admin playback failed");
        const { url } = await res.json();
        const player = playerRef.current!;
        player.src({ src: url, type: "video/mp4" });
        attachContentTracking();
        await player.play()?.catch(() => {});
        setStatus("playing");
        return;
      }
      const res = await fetch(`/api/videos/${videoId}/ad-session`, { method: "POST" });
      const data = await res.json();
      if (data.adRequired && data.vastTagUrl) {
        await runAd(data.adSessionId, data.vastTagUrl, data);
      } else {
        await grantAndPlay(data.adSessionId, "noad");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <style jsx global>{`
        .vjs-scrubber-preview .vjs-mouse-display,
        .vjs-scrubber-preview .vjs-time-tooltip {
          display: none !important;
        }
      `}</style>

      {heatmap.length > 0 && status === "playing" && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-10 z-10 px-1 transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <Heatmap buckets={heatmap} />
        </div>
      )}

      <div data-vjs-player className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
        <div ref={videoRef} />
      </div>

      <div className={`absolute inset-0 z-20 flex flex-col bg-black ${status === "ad" ? "" : "hidden"}`}>
        <video ref={adVideoRef} className="h-full w-full" playsInline />
        <div className="absolute bottom-4 right-4">
          {adCanSkip ? (
            <button
              onClick={() => (adVideoRef.current as HTMLVideoElement & { _skip?: () => void })?._skip?.()}
              className="rounded bg-black/80 px-4 py-2 text-sm text-white hover:bg-black"
            >
              Skip Ad ▶
            </button>
          ) : (
            <span className="rounded bg-black/70 px-3 py-2 text-sm text-zinc-300">
              Skip in {adSkipIn}s
            </span>
          )}
        </div>
        <span className="absolute left-4 top-4 rounded bg-yellow-500/90 px-2 py-0.5 text-xs font-semibold text-black">
          Ad
        </span>
      </div>

      {(status === "idle" || status === "loading" || status === "error") && (
        <button
          onClick={start}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 transition hover:bg-black/30"
        >
          {status === "loading" ? (
            <span className="text-sm text-white">Loading…</span>
          ) : status === "error" ? (
            <span className="rounded bg-red-600/90 px-4 py-2 text-sm text-white">Playback error — tap to retry</span>
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-pink-600/90 shadow-2xl">
              <svg className="ml-1 h-9 w-9 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.8A1.5 1.5 0 004 4.1v11.8a1.5 1.5 0 002.3 1.3l9.3-5.9a1.5 1.5 0 000-2.6L6.3 2.8z" />
              </svg>
            </span>
          )}
        </button>
      )}

      {preview && storyboard && (
        <div
          className="pointer-events-none absolute z-40 -translate-x-1/2"
          style={{ left: preview.left, bottom: preview.bottom }}
        >
          <div
            className="overflow-hidden rounded border border-zinc-500 bg-black shadow-2xl"
            style={{
              width: preview.cue.w,
              height: preview.cue.h,
              backgroundImage: `url(${storyboard.sprite})`,
              backgroundSize: "auto",
              backgroundRepeat: "no-repeat",
              backgroundPosition: `-${preview.cue.x}px -${preview.cue.y}px`,
            }}
          />
          <div className="mx-auto mt-1 w-fit rounded bg-black/85 px-2 py-0.5 text-center text-[11px] font-medium text-white">
            {formatTime(preview.time)}
          </div>
        </div>
      )}
    </div>
  );
}
