"use client";

import { useEffect, useState } from "react";

type Estimate = {
  totalUsd: number;
  formula: string;
  wallTimeEstimate: string;
  analysisModelLabel: string;
  breakdown: { analysisUsd: number; plannerUsd: number; renderUsd: number };
  note: string;
  targetDurationSec: number;
  sourceDurationSec: number;
};

type Segment = {
  videoId: string;
  title: string;
  startSec: number;
  endSec: number;
  confidence?: number;
};

type ModelRow = {
  id: string;
  label: string;
  pricePerHourApprox: string;
  deprecated?: boolean;
};

export default function VideoEditorAiPanel({
  siteId,
  videoIds,
  onSegmentsReady,
}: {
  siteId: string;
  videoIds: string[];
  onSegmentsReady: (segments: Segment[], jobId: string) => void;
}) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [modelId, setModelId] = useState("nova-2-lite");
  const [targetDurationSec, setTargetDurationSec] = useState(30);
  const [prompt, setPrompt] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"ANALYZE_OPEN" | "AUTO_RENDER">("ANALYZE_OPEN");

  useEffect(() => {
    fetch("/api/video-agent/models")
      .then((r) => r.json())
      .then((d) => {
        const list = ((d.models || []) as ModelRow[]).filter((m) => !m.deprecated);
        if (list.length) {
          setModels(list);
          if (!list.some((m) => m.id === modelId)) setModelId(list[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  useEffect(() => {
    if (videoIds.length < 1 || !siteId) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/admin/video-editor/estimate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoIds, targetDurationSec, analysisModelId: modelId }),
        });
        const data = await res.json();
        if (res.ok) setEstimate(data.estimate);
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [videoIds, targetDurationSec, modelId, siteId]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      const res = await fetch(`/api/admin/video-editor/jobs/${jobId}`);
      const data = await res.json();
      if (cancelled || !res.ok) return;
      setStatus(data.job?.status || "");
      if (data.job?.status === "READY" && Array.isArray(data.segments)) {
        onSegmentsReady(data.segments, jobId);
        setLoading(false);
      }
      if (data.job?.status === "DONE") {
        setLoading(false);
        setStatus("DONE — check Promo ads / library for the rendered file");
      }
      if (data.job?.status === "ERROR") {
        setError(data.job.error || "Job failed");
        setLoading(false);
      }
      if (["ANALYZING", "PENDING", "RENDERING"].includes(data.job?.status)) {
        setTimeout(tick, 4000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [jobId, onSegmentsReady]);

  async function start() {
    setError(null);
    setLoading(true);
    setStatus("Starting…");
    try {
      const res = await fetch("/api/admin/video-editor/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          videoIds,
          targetDurationSec,
          analysisModelId: modelId,
          mode,
          prompt: prompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start");
        setLoading(false);
        return;
      }
      setJobId(data.job.id);
      setEstimate(data.estimate);
      setStatus(data.job.status);
    } catch {
      setError("Request failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div>
        <h2 className="text-sm font-medium text-zinc-200">AI highlight (Bedrock)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Uses the videos you checked in Library (server-side from S3). Segments are added to the
          timeline when analysis completes.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Model</span>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        >
          {(models.length ? models : [{ id: "nova-2-lite", label: "Nova 2 Lite", pricePerHourApprox: "~$0.40/hr" }]).map(
            (m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.pricePerHourApprox})
              </option>
            )
          )}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Target length (seconds)</span>
        <input
          type="number"
          min={5}
          max={300}
          value={targetDurationSec}
          onChange={(e) => setTargetDurationSec(parseInt(e.target.value || "30", 10))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Prompt (optional)</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          placeholder="e.g. Find flex peaks and strongest muscle worship moments"
        />
      </label>

      <fieldset className="flex flex-wrap gap-4 text-sm text-zinc-300">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "ANALYZE_OPEN"}
            onChange={() => setMode("ANALYZE_OPEN")}
          />
          Analyze → add to timeline
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "AUTO_RENDER"}
            onChange={() => setMode("AUTO_RENDER")}
          />
          Auto-render (FFmpeg + logo)
        </label>
      </fieldset>

      {estimate ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-400">
          <p className="text-zinc-300">
            Est. <span className="font-medium text-white">${estimate.totalUsd.toFixed(2)}</span>
            {" · "}
            {estimate.analysisModelLabel}
            {" · "}
            {(estimate.sourceDurationSec / 60).toFixed(0)} min → {estimate.targetDurationSec}s
          </p>
          <p className="mt-1">
            Analysis ${estimate.breakdown.analysisUsd.toFixed(2)} + planner $
            {estimate.breakdown.plannerUsd.toFixed(2)} + render $
            {estimate.breakdown.renderUsd.toFixed(2)}
          </p>
          <p className="mt-1 text-zinc-500">{estimate.formula}</p>
          <p className="mt-1 text-zinc-500">Wall time {estimate.wallTimeEstimate}</p>
        </div>
      ) : null}

      {(error || status) && (
        <p className={`text-sm ${error ? "text-red-400" : "text-zinc-400"}`}>{error || status}</p>
      )}

      <button
        type="button"
        disabled={loading || videoIds.length === 0 || !siteId}
        onClick={() => void start()}
        className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {loading ? "Running…" : mode === "AUTO_RENDER" ? "Analyze & auto-render" : "Analyze & add clips"}
      </button>
    </div>
  );
}
