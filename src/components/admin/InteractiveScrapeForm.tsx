"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ExternalVideoSelectGrid from "@/components/admin/ExternalVideoSelectGrid";
import { SOURCE_SITES } from "@/lib/source-sites";
import type { ScrapeCandidate } from "@/types/scrape-candidate";

const PREVIEW_BATCH = 50;

export default function InteractiveScrapeForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<string[]>([...SOURCE_SITES]);
  const [minMinutes, setMinMinutes] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [videos, setVideos] = useState<ScrapeCandidate[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [cursors, setCursors] = useState<Record<string, number | string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);

  function toggleSource(s: string) {
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function toggleUrl(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleAll() {
    const selectable = videos.filter((v) => !v.inCatalog);
    if (selectedUrls.size === selectable.length && selectable.length > 0) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(selectable.map((v) => v.url)));
    }
  }

  async function fetchPreview(append: boolean) {
    const res = await fetch("/api/admin/scrape-runs/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        sources,
        minDurationSec: minMinutes * 60,
        cursors: append ? cursors : undefined,
        limit: PREVIEW_BATCH,
        excludeUrls: append ? videos.map((v) => v.url) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed");
    return data as {
      videos: ScrapeCandidate[];
      cursors: Record<string, number | string>;
      hasMore: boolean;
    };
  }

  async function searchVideos() {
    setSearching(true);
    setError(null);
    setVideos([]);
    setSelectedUrls(new Set());
    setCursors({});
    setHasMore(false);
    try {
      const data = await fetchPreview(false);
      setVideos(data.videos);
      setCursors(data.cursors);
      setHasMore(data.hasMore);
      setSelectedUrls(new Set(data.videos.filter((v) => !v.inCatalog).map((v) => v.url)));
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const data = await fetchPreview(true);
      setVideos((prev) => [...prev, ...data.videos]);
      setCursors(data.cursors);
      setHasMore(data.hasMore);
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        for (const v of data.videos) {
          if (!v.inCatalog) next.add(v.url);
        }
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function downloadSelected() {
    if (selectedUrls.size === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const selected = videos.filter((v) => selectedUrls.has(v.url));
      const res = await fetch("/api/admin/scrape-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          sources: [...new Set(selected.map((v) => v.sourceSite))],
          minDurationSec: minMinutes * 60,
          candidates: selected.map(({ durationLabel: _d, inCatalog: _i, ...rest }) => rest),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to queue download");
      router.push(`/admin/scrape-runs/${data.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  const selectableCount = videos.filter((v) => !v.inCatalog).length;
  const allSelected = selectableCount > 0 && selectedUrls.size === selectableCount;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Interactive scrape</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Step 1: search source sites and preview thumbnails. Step 2: pick videos to download.
              Load 50 more at a time until a site runs out of results.
            </p>
          </div>
          <Link
            href="/admin/scrape-runs"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Auto scrape runs
          </Link>
        </div>

        <input
          required
          placeholder="Search query (e.g. milf)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={searching || downloading}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
        />

        <div>
          <p className="mb-2 text-sm text-zinc-400">Source sites</p>
          <div className="flex flex-wrap gap-2">
            {SOURCE_SITES.map((s) => (
              <label
                key={s}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                  sources.includes(s)
                    ? "border-brand-500 bg-brand-600/20 text-brand-200"
                    : "border-zinc-700 bg-zinc-950 text-zinc-400"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={sources.includes(s)}
                  onChange={() => toggleSource(s)}
                  disabled={searching || downloading}
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Minimum duration
          <input
            type="number"
            min={0}
            max={600}
            value={minMinutes}
            onChange={(e) => setMinMinutes(parseInt(e.target.value || "0", 10))}
            disabled={searching || downloading}
            className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-white focus:border-brand-500 focus:outline-none"
          />
          minutes
        </label>

        <button
          type="button"
          onClick={searchVideos}
          disabled={searching || downloading || !query.trim() || sources.length === 0}
          className="rounded-lg bg-zinc-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
        >
          {searching ? "Searching…" : "Step 1 — Search videos"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {searched && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">
              Showing {videos.length} preview{videos.length === 1 ? "" : "s"}
              {hasMore ? " — more available" : " — no more results"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleAll}
                disabled={selectableCount === 0}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {allSelected ? "Deselect all" : "Select all new"}
              </button>
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore || searching || downloading}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load 50 more"}
                </button>
              )}
              <button
                type="button"
                onClick={downloadSelected}
                disabled={downloading || selectedUrls.size === 0}
                className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {downloading
                  ? "Queuing…"
                  : `Step 2 — Download ${selectedUrls.size} selected`}
              </button>
            </div>
          </div>

          <ExternalVideoSelectGrid
            videos={videos}
            selectedUrls={selectedUrls}
            onToggle={toggleUrl}
          />
        </section>
      )}
    </div>
  );
}
