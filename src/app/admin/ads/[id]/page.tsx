"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PromoAdIterationTimeline from "@/components/admin/PromoAdIterationTimeline";
import PromoAdPlayer from "@/components/admin/PromoAdPlayer";

type Iteration = {
  id: string;
  iterationNumber: number;
  status: string;
  userFeedback?: string | null;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  error?: string | null;
  createdAt: string;
};

type AdDetail = {
  id: string;
  title: string | null;
  status: string;
  generationMode: "CLIP_COMPOSE" | "GENERATIVE";
  generativeModelId: string | null;
  prompt: string | null;
  iterations: Iteration[];
};

export default function AdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [adId, setAdId] = useState<string | null>(null);
  const [ad, setAd] = useState<AdDetail | null>(null);
  const [activeIter, setActiveIter] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    params.then((p) => setAdId(p.id));
  }, [params]);

  const loadAd = useCallback(async () => {
    if (!adId) return;
    const res = await fetch(`/api/promo-ads/${adId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load");
    setAd(data.ad);
    const latest = data.ad.iterations[data.ad.iterations.length - 1];
    if (latest) setActiveIter(latest.iterationNumber);
    return data.ad as AdDetail;
  }, [adId]);

  useEffect(() => {
    document.title = "Promo ad · Admin";
  }, []);

  useEffect(() => {
    if (!adId) return;
    loadAd()
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [adId, loadAd]);

  useEffect(() => {
    if (!ad || ad.status !== "GENERATING") {
      setPolling(false);
      return;
    }
    setPolling(true);
    const t = setInterval(() => {
      loadAd().catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [ad?.status, loadAd]);

  async function revise() {
    if (!adId || !feedback.trim()) return;
    setRevising(true);
    setError(null);
    try {
      const estRes = await fetch("/api/promo-ads/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "GENERATIVE",
          modelId: ad?.generativeModelId,
          durationSeconds: 12,
        }),
      });
      const estData = await estRes.json();
      const res = await fetch(`/api/promo-ads/${adId}/iterate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: feedback.trim(),
          estimatedCostUsd: estData.estimate?.totalUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Revise failed");
      setFeedback("");
      await loadAd();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revise failed");
    } finally {
      setRevising(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;

  if (!ad) {
    return (
      <div>
        <p className="text-red-400">{error || "Not found"}</p>
        <Link href="/admin/ads" className="text-brand-400 hover:underline">
          ← All ads
        </Link>
      </div>
    );
  }

  const activeIteration = ad.iterations.find((i) => i.iterationNumber === activeIter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{ad.title || "Promo ad"}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {ad.generationMode === "CLIP_COMPOSE" ? "Clip compose" : `AI · ${ad.generativeModelId}`}
            {" · "}
            <span
              className={
                ad.status === "GENERATING"
                  ? "text-amber-400"
                  : ad.status === "DONE"
                    ? "text-emerald-400"
                    : ad.status === "ERROR"
                      ? "text-red-400"
                      : ""
              }
            >
              {ad.status}
              {polling ? " (refreshing…)" : ""}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/ads/create?id=${ad.id}`}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Edit params
          </Link>
          <Link href="/admin/ads" className="text-sm text-zinc-400 hover:text-white">
            ← All ads
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {adId && activeIteration?.status === "DONE" ? (
            <PromoAdPlayer adId={adId} iterationNumber={activeIter} />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm text-zinc-500">
              {activeIteration?.status === "GENERATING" || ad.status === "GENERATING"
                ? "Generating…"
                : activeIteration?.error || "No completed video for this iteration"}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-zinc-300">Iterations</h2>
          <PromoAdIterationTimeline
            iterations={ad.iterations}
            activeNumber={activeIter}
            onSelect={setActiveIter}
          />
        </div>
      </div>

      {ad.generationMode === "GENERATIVE" && ad.status !== "GENERATING" && (
        <div className="rounded-xl border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-white">Revise with feedback</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Nova 2 Lite rewrites the prompt; a new iteration is queued with image-to-video context.
          </p>
          <textarea
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Make the pacing faster and emphasize the golden brand colors"
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={revising || !feedback.trim()}
            onClick={revise}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {revising ? "Starting revision…" : "Revise ad"}
          </button>
        </div>
      )}

      {ad.prompt && (
        <details className="rounded-xl border border-zinc-800 p-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-300">Prompt</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">{ad.prompt}</pre>
        </details>
      )}
    </div>
  );
}
