"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import VideoSelectGrid, { type SelectableVideo } from "@/components/admin/VideoSelectGrid";

type VideoAgentModel = {
  id: string;
  label: string;
  provider: string;
  description: string;
  supportsBbox: boolean;
  costTier: string;
  pricePerHourApprox: string;
};

type AgentRun = {
  id: string;
  status: string;
  error?: string | null;
};

type SearchResult = {
  searchQuery: string;
  extractTargets: string[];
  videos: SelectableVideo[];
  total: number;
};

const DEFAULT_PROMPT =
  "Search for videos related to golden shower and watersports content. Detect exactly where piss drinking happens and exactly where piss swallowing happens. Return the time range and on-screen location for each occurrence.";

const POLL_MS = 3000;

export default function VideoAgentPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [analysisModel, setAnalysisModel] = useState("pegasus-1-5");
  const [models, setModels] = useState<VideoAgentModel[]>([]);
  const [searching, setSearching] = useState(false);
  const [running, setRunning] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<AgentRun | null>(null);

  useEffect(() => {
    document.title = "Video Agent · Admin";
  }, []);

  useEffect(() => {
    fetch("/api/video-agent/models")
      .then((r) => r.json())
      .then((d) => {
        const list = d.models as VideoAgentModel[];
        if (list?.length) {
          setModels(list);
          if (!list.some((m) => m.id === analysisModel)) {
            setAnalysisModel(list[0].id);
          }
        }
      })
      .catch(() => {});
  }, [analysisModel]);

  const pollRun = useCallback(async (runId: string) => {
    const res = await fetch(`/api/video-agent/runs/${runId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load run");
    setRun({ id: data.run.id, status: data.run.status, error: data.run.error });
    return data.run as AgentRun;
  }, []);

  useEffect(() => {
    if (!polling || !run?.id) return;
    const id = run.id;
    const timer = setInterval(async () => {
      try {
        const updated = await pollRun(id);
        if (updated.status === "DONE" || updated.status === "ERROR") {
          setPolling(false);
          setRunning(false);
          router.push(`/admin/video-agent/runs/${id}`);
        }
      } catch (e) {
        setError((e as Error).message);
        setPolling(false);
        setRunning(false);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, run?.id, pollRun, router]);

  async function searchVideos() {
    if (!prompt.trim()) return;
    setSearching(true);
    setError(null);
    setSearchResult(null);
    setSelectedIds(new Set());
    setRun(null);
    try {
      const res = await fetch("/api/video-agent/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setSearchResult(data);
      setSelectedIds(new Set(data.videos.map((v: SelectableVideo) => v.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function startAnalysis() {
    if (!prompt.trim() || !searchResult || selectedIds.size === 0) return;
    setRunning(true);
    setPolling(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/video-agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          analysisModel,
          searchQuery: searchResult.searchQuery,
          extractTargets: searchResult.extractTargets,
          videoIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      const created = data.run as AgentRun;
      setRun(created);
      if (created.status === "DONE" || created.status === "ERROR") {
        setPolling(false);
        setRunning(false);
        router.push(`/admin/video-agent/runs/${created.id}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setPolling(false);
      setRunning(false);
    }
  }

  function toggleVideo(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!searchResult) return;
    if (selectedIds.size === searchResult.videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(searchResult.videos.map((v) => v.id)));
    }
  }

  const targets = searchResult?.extractTargets ?? [];
  const selectedModel = models.find((m) => m.id === analysisModel);
  const allSelected =
    searchResult != null && selectedIds.size === searchResult.videos.length && searchResult.videos.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Video Content Agent</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Step 1: search the catalog from your prompt. Step 2: pick which videos to analyze.
            Results are saved permanently — review and approve detections on the analysis page.
          </p>
        </div>
        <Link
          href="/admin/video-agent/runs"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          Past analyses
        </Link>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Analysis model</label>
          <select
            value={analysisModel}
            onChange={(e) => setAnalysisModel(e.target.value)}
            disabled={searching || running}
            className="w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.pricePerHourApprox} ({m.provider})
              </option>
            ))}
          </select>
          {selectedModel && (
            <p className="mt-1.5 text-xs text-zinc-500">
              {selectedModel.description} Approx. {selectedModel.pricePerHourApprox} per hour of
              video analyzed (2 detection targets).
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Agent prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={searching || running}
            rows={5}
            placeholder="Search for … and detect exactly where … happens"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Parsed into a catalog search query and a list of events to detect (e.g. piss drinking,
            piss swallowing).
          </p>
        </div>

        <button
          type="button"
          onClick={searchVideos}
          disabled={searching || running || !prompt.trim()}
          className="rounded-lg bg-zinc-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
        >
          {searching ? "Searching…" : "Step 1 — Search videos"}
        </button>
      </section>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
          {error.includes("VideoAgent") && (
            <p className="mt-2 text-xs text-red-400/80">
              On the server run: <code className="text-red-200">docker compose run --rm migrate</code>
            </p>
          )}
        </div>
      )}

      {searchResult && !running && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-400">
              <p>
                <span className="text-zinc-500">Search query:</span> {searchResult.searchQuery}
              </p>
              <p className="mt-1">
                <span className="text-zinc-500">Detecting:</span> {targets.join(", ")}
              </p>
              <p className="mt-1">
                Found {searchResult.total} video{searchResult.total === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleAll}
                disabled={searchResult.videos.length === 0}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <button
                type="button"
                onClick={startAnalysis}
                disabled={selectedIds.size === 0}
                className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {`Step 2 — Analyze ${selectedIds.size} selected video${selectedIds.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          <VideoSelectGrid
            videos={searchResult.videos}
            selectedIds={selectedIds}
            onToggle={toggleVideo}
          />
        </section>
      )}

      {running && run && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-sm text-zinc-400">
          <p>
            Analyzing {selectedIds.size} video{selectedIds.size === 1 ? "" : "s"} with{" "}
            <span className="text-zinc-300">{selectedModel?.label ?? analysisModel}</span>…
          </p>
          <p className="mt-2 text-zinc-500">Status: {run.status}</p>
          <Link
            href={`/admin/video-agent/runs/${run.id}`}
            className="mt-4 inline-block text-brand-400 hover:underline"
          >
            Open analysis page →
          </Link>
        </div>
      )}
    </div>
  );
}
