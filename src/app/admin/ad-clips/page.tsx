"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ApprovedClipGrid, { type ApprovedClip } from "@/components/admin/ApprovedClipGrid";

export default function AdClipsPage() {
  const router = useRouter();
  const [clips, setClips] = useState<ApprovedClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openInEditor() {
    if (selectedIds.size === 0) return;
    const qs = new URLSearchParams({
      detections: Array.from(selectedIds).join(","),
    });
    router.push(`/admin/video-editor?${qs}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ad clips</h1>
          <p className="mt-1 text-sm text-zinc-400">
            All saved clips from the Video editor (AI highlight and manual trims). Select clips to
            open them on the timeline.
          </p>
        </div>
        <Link
          href="/admin/video-editor"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          Open video editor
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
          <button
            type="button"
            onClick={openInEditor}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            Open in video editor
          </button>
        </div>
      )}
    </div>
  );
}
