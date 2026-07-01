"use client";

import { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import type Player from "video.js/dist/types/player";
import Heatmap from "@/components/player/Heatmap";
import { fetchVastAd, fireImpressions } from "@/lib/vast";

type Storyboard = { sprite: string; vtt: string } | null;

type Cue = { start: number; end: number; x: number; y: number; w: number; h: number };

const BUCKET_SEC = 5;

async function parseVtt(url: string): Promise<Cue[]> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const cues: Cue[] = [];
    const blocks = text.split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const timeLine = lines.find((l) => l.includes("-->"));
      const imgLine = lines.find((l) => l.includes("#xywh="));
      if (!timeLine || !imgLine) continue;
      const [a, b] = timeLine.split("-->").map((s) => s.trim());
      const toSec = (t: string) => {
        const p = t.split(":").map(parseFloat);
        return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
      };
      const m = imgLine.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/);
      if (!m) continue;
      cues.push({
        start: toSec(a),
        end: toSec(b),
        x: +m[1], y: +m[2], w: +m[3], h: +m[4],
      });
    }
    return cues;
  } catch {
    return [];
  }
}

export default function VideoPlayer({
  videoId,
  poster,
  storyboard,
  heatmap,
  initialPositionSec = 0,
}: {
  videoId: string;
  poster: string;
  storyboard: Storyboard;
  heatmap: number[];
  initialPositionSec?: number;
}) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [status, setStatus] = useState<"idle" | "ad" | "loading" | "playing" | "error">("idle");
  const [adSkipIn, setAdSkipIn] = useState<number | null>(null);
  const [adCanSkip, setAdCanSkip] = useState(false);
  const adVideoRef = useRef<HTMLVideoElement>(null);
  const watchedBuckets = useRef<Set<number>>(new Set());
  const lastFlush = useRef(0);
  const viewCounted = useRef(false);
  const cuesRef = useRef<Cue[]>([]);
  const [preview, setPreview] = useState<{ left: number; cue: Cue } | null>(null);

  // Initialize the Video.js player once.
  useEffect(() => {
    if (playerRef.current || !videoRef.current) return;
    const el = document.createElement("video-js");
    el.classList.add("vjs-big-play-centered");
    videoRef.current.appendChild(el);
    const player = videojs(el, {
      controls: true,
      preload: "none",
      fluid: true,
      poster,
      playsinline: true,
    });
    playerRef.current = player;

    if (storyboard) parseVtt(storyboard.vtt).then((c) => (cuesRef.current = c));

    return () => {
      flushWatch(true);
      player.dispose();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Storyboard scrubber preview.
    if (storyboard) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seekBar = (player as any).controlBar?.progressControl?.seekBar?.el?.() as HTMLElement | undefined;
      if (seekBar) {
        seekBar.addEventListener("mousemove", (e: MouseEvent) => {
          const rect = seekBar.getBoundingClientRect();
          const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          const dur = player.duration() || 0;
          const time = pct * dur;
          const cue = cuesRef.current.find((c) => time >= c.start && time < c.end);
          if (cue) setPreview({ left: e.clientX - rect.left, cue });
        });
        seekBar.addEventListener("mouseleave", () => setPreview(null));
      }
    }
  }

  useEffect(() => {
    const onUnload = () => flushWatch(true);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", () => document.hidden && flushWatch(true));
    return () => window.removeEventListener("beforeunload", onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="relative">
      {heatmap.length > 0 && status === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 px-1">
          <Heatmap buckets={heatmap} />
        </div>
      )}

      <div data-vjs-player className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
        <div ref={videoRef} />
      </div>

      {/* Ad overlay — always mounted so the ref is stable; shown only in ad mode. */}
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

      {/* Play gate overlay (before ad/stream). */}
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

      {/* Storyboard scrubber preview */}
      {preview && storyboard && (
        <div
          className="pointer-events-none absolute bottom-14 z-30 -translate-x-1/2 rounded border border-zinc-700 shadow-xl"
          style={{
            left: preview.left,
            width: preview.cue.w,
            height: preview.cue.h,
            backgroundImage: `url(${storyboard.sprite})`,
            backgroundPosition: `-${preview.cue.x}px -${preview.cue.y}px`,
          }}
        />
      )}
    </div>
  );
}
