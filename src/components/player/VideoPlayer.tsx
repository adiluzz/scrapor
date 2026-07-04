"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, type MutableRefObject } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import type Player from "video.js/dist/types/player";
import Heatmap, { heatmapHasData } from "@/components/player/Heatmap";
import { fireImpressions, type VastAd } from "@/lib/vast";
import type { StoryboardCue } from "@/lib/storyboard";

type Storyboard = { sprite: string; cues: StoryboardCue[] } | null;

const BUCKET_SEC = 5;
const SKIP_SEC = 7;

export type VideoPlayerHandle = {
  getCurrentTime: () => number;
  getDuration: () => number;
  seek: (seconds: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  ensurePlaying: () => Promise<void>;
};

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

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/** Phones/tablets held in the hand — not desktop mice or touch laptops. */
function isMobileCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function enterPlayerFullscreen(
  player: Player,
  autoRef: MutableRefObject<boolean>
): void {
  const videoEl = player.el().querySelector("video") as HTMLVideoElement | null;
  if (videoEl && "webkitEnterFullscreen" in videoEl) {
    (videoEl as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    autoRef.current = true;
    return;
  }
  player.requestFullscreen()?.then(() => {
    autoRef.current = true;
  }).catch(() => {});
}

export default forwardRef(function VideoPlayer(
  {
    videoId,
    poster,
    storyboard,
    heatmap,
    initialPositionSec = 0,
    adminPreview = false,
    clipLoop,
    onTimeUpdate,
    onDuration,
    muted = false,
    autoStart = false,
  }: {
    videoId: string;
    poster: string;
    storyboard: Storyboard;
    heatmap: number[];
    initialPositionSec?: number;
    /** Admin panel: skip ads and allow playback of soft-deleted videos. */
    adminPreview?: boolean;
    /** Loop playback between start and end (admin clip review). */
    clipLoop?: { startSec: number; endSec: number };
    onTimeUpdate?: (currentTime: number) => void;
    onDuration?: (duration: number) => void;
    muted?: boolean;
    /** Admin: start playback automatically on mount. */
    autoStart?: boolean;
  },
  ref
) {
  const videoRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const cuesRef = useRef<StoryboardCue[]>(storyboard?.cues ?? []);
  const scrubCleanupRef = useRef<(() => void) | null>(null);
  const progressSeekCleanupRef = useRef<(() => void) | null>(null);
  const trackingAttachedRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "ad" | "loading" | "playing" | "error">("idle");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [adSkipIn, setAdSkipIn] = useState<number | null>(null);
  const [adCanSkip, setAdCanSkip] = useState(false);
  const adVideoRef = useRef<HTMLVideoElement>(null);
  const watchedBuckets = useRef<Set<number>>(new Set());
  const lastFlush = useRef(0);
  const viewCounted = useRef(false);
  const autoLandscapeFullscreen = useRef(false);
  const [preview, setPreview] = useState<{
    left: number;
    bottom: number;
    cue: StoryboardCue;
    time: number;
    scale: number;
  } | null>(null);
  const [touchUi, setTouchUi] = useState(false);
  const clipLoopRef = useRef(clipLoop);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onDurationRef = useRef(onDuration);
  const statusRef = useRef(status);

  useEffect(() => {
    clipLoopRef.current = clipLoop;
  }, [clipLoop]);
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);
  useEffect(() => {
    onDurationRef.current = onDuration;
  }, [onDuration]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    setTouchUi(isTouchDevice());
  }, []);

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
      controls: false,
      preload: "none",
      fluid: true,
      poster,
      playsinline: true,
      bigPlayButton: false,
      textTrackSettings: false,
      inactivityTimeout: isTouchDevice() ? 0 : 2000,
      controlBar: {
        children: [
          "progressControl",
          "playToggle",
          "volumePanel",
          "currentTimeDisplay",
          "timeDivider",
          "durationDisplay",
          "pictureInPictureToggle",
          "fullscreenToggle",
        ],
      },
    });
    playerRef.current = player;

    player.on("useractive", () => setControlsVisible(true));
    player.on("userinactive", () => {
      if (!isTouchDevice()) setControlsVisible(false);
    });
    player.on("pause", () => setControlsVisible(true));
    player.on("fullscreenchange", () => {
      if (!player.isFullscreen()) autoLandscapeFullscreen.current = false;
    });

    return () => {
      scrubCleanupRef.current?.();
      progressSeekCleanupRef.current?.();
      trackingAttachedRef.current = false;
      flushWatch(true);
      player.dispose();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.controls(status === "playing");
    if (status === "playing" && isTouchDevice()) {
      player.userActive(true);
      setControlsVisible(true);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "playing") return;

    const player = playerRef.current;
    if (!player) return;

    // Desktop: never auto-fullscreen; undo if a prior build entered it on landscape.
    if (!isMobileCoarsePointer()) {
      if (autoLandscapeFullscreen.current && player.isFullscreen()) {
        player.exitFullscreen();
        autoLandscapeFullscreen.current = false;
      }
      return;
    }

    const syncLandscapeFullscreen = () => {
      const p = playerRef.current;
      if (!p) return;

      const landscape = window.matchMedia("(orientation: landscape)").matches;
      if (landscape) {
        if (!p.isFullscreen()) {
          enterPlayerFullscreen(p, autoLandscapeFullscreen);
        }
        return;
      }

      if (autoLandscapeFullscreen.current && p.isFullscreen()) {
        p.exitFullscreen();
        autoLandscapeFullscreen.current = false;
      }
    };

    const mq = window.matchMedia("(orientation: landscape)");
    mq.addEventListener("change", syncLandscapeFullscreen);
    window.addEventListener("orientationchange", syncLandscapeFullscreen);
    syncLandscapeFullscreen();

    return () => {
      mq.removeEventListener("change", syncLandscapeFullscreen);
      window.removeEventListener("orientationchange", syncLandscapeFullscreen);
    };
  }, [status]);

  function seekTo(timeSec: number) {
    const player = playerRef.current;
    if (!player) return;
    const dur = player.duration();
    if (!dur || !Number.isFinite(dur)) return;
    player.userActive(true);
    player.currentTime(Math.min(dur, Math.max(0, timeSec)));
  }

  function skipBy(deltaSec: number) {
    const player = playerRef.current;
    if (!player) return;
    const dur = player.duration();
    const cur = player.currentTime() || 0;
    if (!dur || !Number.isFinite(dur)) return;
    seekTo(cur + deltaSec);
  }

  function attachProgressSeek() {
    progressSeekCleanupRef.current?.();
    progressSeekCleanupRef.current = null;

    const player = playerRef.current;
    if (!player) return;

    const bind = () => {
      const progressControl = player.el().querySelector(".vjs-progress-control") as HTMLElement | null;
      const seekBar = player.el().querySelector(".vjs-progress-holder") as HTMLElement | null;
      if (!progressControl || !seekBar) return;

      const seekFromClientX = (clientX: number) => {
        const rect = seekBar.getBoundingClientRect();
        if (rect.width <= 0) return;
        const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const dur = player.duration();
        if (!dur || !Number.isFinite(dur)) return;
        player.userActive(true);
        player.currentTime(pct * dur);
      };

      const onPointerDown = (e: MouseEvent | TouchEvent) => {
        if ("button" in e && e.button !== 0) return;
        const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
        if (clientX == null) return;
        e.preventDefault();
        seekFromClientX(clientX);
      };

      const onPointerMove = (e: MouseEvent | TouchEvent) => {
        if (!("buttons" in e) || e.buttons !== 1) {
          if (!("touches" in e)) return;
        }
        const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
        if (clientX == null) return;
        seekFromClientX(clientX);
      };

      progressControl.addEventListener("mousedown", onPointerDown);
      progressControl.addEventListener("touchstart", onPointerDown, { passive: false });
      progressControl.addEventListener("mousemove", onPointerMove);
      progressControl.addEventListener("touchmove", onPointerMove, { passive: false });

      progressSeekCleanupRef.current = () => {
        progressControl.removeEventListener("mousedown", onPointerDown);
        progressControl.removeEventListener("touchstart", onPointerDown);
        progressControl.removeEventListener("mousemove", onPointerMove);
        progressControl.removeEventListener("touchmove", onPointerMove);
      };
    };

    if (player.readyState() >= 1) bind();
    else player.one("loadedmetadata", bind);
  }

  function attachScrubberPreview() {
    scrubCleanupRef.current?.();
    scrubCleanupRef.current = null;

    const player = playerRef.current;
    const root = rootRef.current;
    if (!player || !root || !storyboard?.cues.length) return;

    const bind = () => {
      const seekBar = player.el().querySelector(".vjs-progress-holder") as HTMLElement | null;
      if (!seekBar) return;

      const updatePreview = (clientX: number) => {
        const seekRect = seekBar.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        if (seekRect.width <= 0) return;

        const pct = Math.min(1, Math.max(0, (clientX - seekRect.left) / seekRect.width));
        const dur = player.duration();
        if (!dur || !Number.isFinite(dur)) return;

        const time = pct * dur;
        const cue = findCue(cuesRef.current, time);
        if (!cue) return;

        const scale = Math.min(1, (rootRect.width - 16) / cue.w);
        const half = (cue.w * scale) / 2;
        const left = Math.min(rootRect.width - half, Math.max(half, clientX - rootRect.left));
        const bottom = rootRect.bottom - seekRect.top + 12;
        setPreview({ left, bottom, cue, time, scale });
      };

      const onMove = (e: MouseEvent) => updatePreview(e.clientX);
      const onLeave = () => setPreview(null);
      const onTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (touch) updatePreview(touch.clientX);
      };
      const onTouchEnd = () => setPreview(null);

      seekBar.addEventListener("mousemove", onMove);
      seekBar.addEventListener("mouseleave", onLeave);
      seekBar.addEventListener("touchmove", onTouchMove, { passive: true });
      seekBar.addEventListener("touchend", onTouchEnd);
      seekBar.addEventListener("touchcancel", onTouchEnd);
      scrubCleanupRef.current = () => {
        seekBar.removeEventListener("mousemove", onMove);
        seekBar.removeEventListener("mouseleave", onLeave);
        seekBar.removeEventListener("touchmove", onTouchMove);
        seekBar.removeEventListener("touchend", onTouchEnd);
        seekBar.removeEventListener("touchcancel", onTouchEnd);
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

    attachProgressSeek();

    if (trackingAttachedRef.current) {
      attachScrubberPreview();
      return;
    }
    trackingAttachedRef.current = true;

    player.on("timeupdate", () => {
      const t = player.currentTime() || 0;
      onTimeUpdateRef.current?.(t);
      const loop = clipLoopRef.current;
      if (loop && t >= loop.endSec) {
        player.currentTime(loop.startSec);
      }
      if (!adminPreview) {
        watchedBuckets.current.add(Math.floor(t / BUCKET_SEC));
        const now = Date.now();
        if (now - lastFlush.current > 10_000) {
          lastFlush.current = now;
          flushWatch();
        }
      }
    });
    if (!adminPreview) {
      player.on("play", () => {
        if (!viewCounted.current) {
          viewCounted.current = true;
          fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => {});
        }
      });
      player.on("pause", () => flushWatch());
      player.on("ended", () => flushWatch());
    }

    player.one("loadedmetadata", () => {
      const d = player.duration();
      if (d && Number.isFinite(d)) onDurationRef.current?.(d);
      if (initialPositionSec > 0) player.currentTime(initialPositionSec);
    });

    attachScrubberPreview();
  }

  useEffect(() => {
    if (adminPreview) return;
    const onUnload = () => flushWatch(true);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", () => document.hidden && flushWatch(true));
    return () => window.removeEventListener("beforeunload", onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPreview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player || status !== "playing") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const cur = player.currentTime() || 0;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        player.currentTime(Math.min(player.duration() || cur, cur + SKIP_SEC));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        player.currentTime(Math.max(0, cur - SKIP_SEC));
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

  async function runAd(adSessionId: string, cfg: { skipSeconds: number; timeoutMs: number }) {
    let ad: VastAd | null = null;
    try {
      const res = await fetch(`/api/videos/${videoId}/vast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adSessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        ad = data.ad ?? null;
      }
    } catch {
      ad = null;
    }
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
        if (muted) player.muted(true);
        attachContentTracking();
        await player.play()?.catch(() => {});
        setStatus("playing");
        return;
      }
      const res = await fetch(`/api/videos/${videoId}/ad-session`, { method: "POST" });
      const data = await res.json();
      if (data.adRequired) {
        await runAd(data.adSessionId, data);
      } else {
        await grantAndPlay(data.adSessionId, "noad");
      }
    } catch {
      setStatus("error");
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => playerRef.current?.currentTime() || 0,
      getDuration: () => playerRef.current?.duration() || 0,
      seek: (seconds: number) => {
        playerRef.current?.currentTime(seconds);
      },
      play: async () => {
        await playerRef.current?.play()?.catch(() => {});
      },
      pause: () => {
        playerRef.current?.pause();
      },
      ensurePlaying: async () => {
        if (statusRef.current !== "playing" && statusRef.current !== "loading") {
          await start();
        }
        for (let i = 0; i < 50 && statusRef.current === "loading"; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoId, adminPreview]
  );

  useEffect(() => {
    if (!adminPreview || !autoStart) return;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPreview, autoStart, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.poster(poster);
  }, [poster]);

  return (
    <div
      ref={rootRef}
      className={`relative w-full video-player-root video-player-themed ${
        touchUi ? "video-player-touch" : ""
      } ${status !== "playing" ? "video-player-preplay" : ""}`}
    >

      {heatmapHasData(heatmap) && status === "playing" && (
        <div
          className={`absolute inset-x-0 px-3 transition-opacity duration-300 video-player-heatmap ${
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <Heatmap buckets={heatmap} bucketSec={BUCKET_SEC} onSeek={seekTo} />
        </div>
      )}

      <div data-vjs-player className="w-full overflow-hidden rounded-xl border border-zinc-800/80 bg-black shadow-[0_0_0_1px_rgba(212,175,55,0.08)]">
        <div ref={videoRef} className="w-full" />
      </div>

      {status === "playing" && (
        <>
          <button
            type="button"
            aria-label="Skip back 7 seconds"
            onClick={() => skipBy(-SKIP_SEC)}
            className="absolute left-0 top-0 z-[5] w-[38%] bg-transparent"
            style={{ bottom: "var(--player-bar-height)" }}
          />
          <button
            type="button"
            aria-label="Skip forward 7 seconds"
            onClick={() => skipBy(SKIP_SEC)}
            className="absolute right-0 top-0 z-[5] w-[38%] bg-transparent"
            style={{ bottom: "var(--player-bar-height)" }}
          />
        </>
      )}

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
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/95 shadow-[0_0_40px_rgba(212,175,55,0.35)] ring-2 ring-brand-400/40 sm:h-24 sm:w-24">
              <svg className="ml-1 h-8 w-8 text-zinc-950 sm:ml-1.5 sm:h-10 sm:w-10" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.8A1.5 1.5 0 004 4.1v11.8a1.5 1.5 0 002.3 1.3l9.3-5.9a1.5 1.5 0 000-2.6L6.3 2.8z" />
              </svg>
            </span>
          )}
        </button>
      )}

      {preview && storyboard && (
        <div
          className="pointer-events-none absolute z-40"
          style={{
            left: preview.left,
            bottom: preview.bottom,
            transform: `translateX(-50%) scale(${preview.scale})`,
            transformOrigin: "bottom center",
          }}
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
});
