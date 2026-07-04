"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ApprovedClipGrid, { type ApprovedClip } from "@/components/admin/ApprovedClipGrid";

export default function AdClipsPage() {
  const router = useRouter();
  const [clips, setClips] = useState<ApprovedClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showcaseVideoId, setShowcaseVideoId] = useState("");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"CLIP_COMPOSE" | "GENERATIVE">("CLIP_COMPOSE");

  useEffect(() => {
    document.title = "Ad clips · Admin";
  }, []);

  const loadClips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/promo-ads/clips");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load clips");
      setClips(data.clips ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  const showcaseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of selectedIds) {
      const clip = clips.find((c) => c.id === id);
      if (clip) map.set(clip.videoId, clip.videoTitle);
    }
    return Array.from(map.entries());
  }, [clips, selectedIds]);

  useEffect(() => {
    if (!showcaseVideoId && showcaseOptions[0]) {
      setShowcaseVideoId(showcaseOptions[0][0]);
    }
  }, [showcaseOptions, showcaseVideoId]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createAd() {
    if (selectedIds.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/promo-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detectionIds: Array.from(selectedIds),
          showcaseVideoId: showcaseVideoId || undefined,
          generationMode: mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create ad");
      router.push(`/admin/ads/create?id=${data.ad.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Approved ad clips</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Select clips from Video Agent approvals to build a promo ad.
          </p>
        </div>
        <Link
          href="/admin/ads"
          className="text-sm text-brand-400 hover:text-brand-300"
        >
          View all promo ads →
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading clips…</p>
      ) : (
        <ApprovedClipGrid clips={clips} selectedIds={selectedIds} onToggle={toggle} />
      )}

      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 rounded-xl border border-zinc-700 bg-zinc-900/95 p-4 backdrop-blur">
          <p className="mb-3 text-sm text-zinc-300">
            {selectedIds.size} clip{selectedIds.size === 1 ? "" : "s"} selected
          </p>

          <div className="mb-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="radio"
                checked={mode === "CLIP_COMPOSE"}
                onChange={() => setMode("CLIP_COMPOSE")}
              />
              Clip compose (no AI, $0)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="radio"
                checked={mode === "GENERATIVE"}
                onChange={() => setMode("GENERATIVE")}
              />
              AI generate
            </label>
          </div>

          {showcaseOptions.length > 0 && (
            <label className="mb-3 block text-sm text-zinc-400">
              Showcase video
              <select
                value={showcaseVideoId}
                onChange={(e) => setShowcaseVideoId(e.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              >
                {showcaseOptions.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            disabled={creating}
            onClick={createAd}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {creating ? "Creating draft…" : "Create promo ad"}
          </button>
        </div>
      )}
    </div>
  );
}
