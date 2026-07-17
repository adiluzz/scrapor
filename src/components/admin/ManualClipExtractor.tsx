"use client";

import { useCallback, useEffect, useState } from "react";
import ClipRangeSelector from "@/components/admin/ClipRangeSelector";

type VideoOption = {
  id: string;
  title: string;
  slug?: string;
  durationSec?: number | null;
};

export default function ManualClipExtractor({
  runId,
  labelOptions,
  runVideos,
  onAdded,
}: {
  runId: string;
  labelOptions: string[];
  runVideos: VideoOption[];
  onAdded: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<VideoOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [videoId, setVideoId] = useState(runVideos[0]?.id ?? "");
  const [label, setLabel] = useState(labelOptions[0] ?? "");
  const [customLabel, setCustomLabel] = useState("");
  const [range, setRange] = useState({ startSec: 0, endSec: 5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveLabel = label === "__custom__" ? customLabel.trim() : label;

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/videos/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.videos ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(searchQ), 300);
    return () => clearTimeout(t);
  }, [searchQ, doSearch]);

  const pickerVideos = searchQ.trim().length >= 2 ? searchResults : runVideos;

  async function submit() {
    if (!videoId) {
      setError("Select a video");
      return;
    }
    if (!effectiveLabel) {
      setError("Enter a detection label");
      return;
    }
    if (range.endSec <= range.startSec) {
      setError("Invalid time range");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-agent/runs/${runId}/detections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          label: effectiveLabel,
          startSec: range.startSec,
          endSec: range.endSec,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add clip");
      onAdded();
      setExpanded(false);
      setSearchQ("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Add manual detection</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Select any video, mark the clip range, and tag it like the agent would.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
        >
          {expanded ? "Close" : "+ Add clip"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
          {error && <p className="text-sm text-red-400">{error}</p>}

          <label className="block text-xs text-zinc-400">
            Search videos (or pick from this run)
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search by title…"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block text-xs text-zinc-400">
            Video
            <select
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            >
              {pickerVideos.length === 0 && <option value="">No videos</option>}
              {pickerVideos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                  {v.durationSec ? ` (${Math.floor(v.durationSec / 60)}m)` : ""}
                </option>
              ))}
            </select>
          </label>
          {searching && <p className="text-xs text-zinc-600">Searching…</p>}

          {videoId && (
            <ClipRangeSelector clipId={videoId} videoId={videoId} onRangeChange={setRange} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Detection label
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                {labelOptions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value="__custom__">Custom label…</option>
              </select>
            </label>
            {label === "__custom__" && (
              <label className="block text-xs text-zinc-400">
                Custom label
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g. piss swallowing"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </label>
            )}
          </div>

          <button
            type="button"
            disabled={saving || !videoId}
            onClick={submit}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add detection to run"}
          </button>
        </div>
      )}
    </div>
  );
}
