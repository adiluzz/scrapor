"use client";

import { useCallback, useEffect, useState } from "react";
import DetectionClipCard, { type DetectionClip } from "@/components/admin/DetectionClipCard";

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
  userPrompt: string;
  searchQuery: string;
  extractTargets: string;
  analysisModel: string;
  status: string;
  error?: string | null;
  agent?: { name: string; key: string };
  detections: DetectionClip[];
};

const DEFAULT_PROMPT =
  "Search for videos related to golden shower and watersports content. Detect exactly where piss drinking happens and exactly where piss swallowing happens. Return the time range and on-screen location for each occurrence.";

const POLL_MS = 3000;

export default function VideoAgentPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [analysisModel, setAnalysisModel] = useState("pegasus-1-5");
  const [models, setModels] = useState<VideoAgentModel[]>([]);
  const [running, setRunning] = useState(false);
  const [polling, setPolling] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setRun(data.run);
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
        }
      } catch (e) {
        setError((e as Error).message);
        setPolling(false);
        setRunning(false);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, run?.id, pollRun]);

  async function startAnalysis() {
    if (!prompt.trim()) return;
    setRunning(true);
    setPolling(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/video-agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), analysisModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setRun(data.run);
      if (data.run.status === "DONE" || data.run.status === "ERROR") {
        setPolling(false);
        setRunning(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setPolling(false);
      setRunning(false);
    }
  }

  async function submitFeedback(detectionId: string, approved: boolean) {
    setFeedbackBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/video-agent/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detectionId, approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Feedback failed");

      setRun((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          detections: prev.detections.map((d) =>
            d.id === detectionId ? { ...d, feedback: { approved } } : d
          ),
        };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFeedbackBusy(false);
    }
  }

  const targets = run ? (JSON.parse(run.extractTargets) as string[]) : [];
  const selectedModel = models.find((m) => m.id === analysisModel);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Video Content Agent</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Describe what to search in the catalog and what on-screen events to detect. A Python
          video-analyzer service processes full video clips with native AI models (Pegasus, Nova),
          returns time ranges and screen regions, and learns from your approve/reject feedback.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Analysis model</label>
          <select
            value={analysisModel}
            onChange={(e) => setAnalysisModel(e.target.value)}
            disabled={running}
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
            disabled={running}
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
          onClick={startAnalysis}
          disabled={running || !prompt.trim()}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {running ? "Analysis in progress…" : "Run analysis"}
        </button>
      </section>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {running && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-sm text-zinc-400">
          Job queued — searching all matching videos and analyzing each in segments with{" "}
          <span className="text-zinc-300">{selectedModel?.label ?? analysisModel}</span>. This may
          take a while for long videos or large result sets…
        </div>
      )}

      {run && (
        <section className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm">
            <p className="text-zinc-300">
              <span className="text-zinc-500">Status:</span> {run.status}
            </p>
            <p className="text-zinc-300">
              <span className="text-zinc-500">Model:</span> {run.analysisModel}
            </p>
            <p className="text-zinc-300">
              <span className="text-zinc-500">Search query:</span> {run.searchQuery}
            </p>
            <p className="mt-1 text-zinc-300">
              <span className="text-zinc-500">Detecting:</span> {targets.join(", ")}
            </p>
            {run.status === "ERROR" && run.error && (
              <p className="mt-2 text-red-400">{run.error}</p>
            )}
          </div>

          {run.status === "DONE" && run.detections.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-8">
              No detections found. Try a different prompt, model, or search terms.
            </p>
          )}

          {run.detections.length > 0 && (
            <>
              <p className="text-sm text-zinc-400">
                Review each clip below. Approve correct detections and reject false positives —
                both are saved as training examples for future runs.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {run.detections.map((d) => (
                  <DetectionClipCard
                    key={d.id}
                    detection={d}
                    onFeedback={submitFeedback}
                    busy={feedbackBusy}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
