"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PromoAdModelInfo } from "@/lib/promo-ad-models";

type ClipRow = {
  id: string;
  sortOrder: number;
  detection: {
    id: string;
    videoId: string;
    videoTitle: string;
    label: string;
    startSec: number;
    endSec: number;
  };
};

type AdDraft = {
  id: string;
  title: string | null;
  status: string;
  generationMode: "CLIP_COMPOSE" | "GENERATIVE";
  generativeModelId: string | null;
  prompt: string | null;
  modelParams: {
    durationSeconds?: number;
    maxBodySeconds?: number;
    audioEnabled?: boolean;
    logoPosition?: string;
    showTagline?: boolean;
    crossfadeSec?: number;
    kenBurns?: boolean;
    removeSourceLogos?: boolean;
    logoRemovalMode?: "presets" | "auto" | "both";
  };
  clips: ClipRow[];
};

type Estimate = {
  totalUsd: number;
  formula: string;
  wallTimeEstimate: string;
  durationSeconds: number;
};

export default function CreateAdPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adId = searchParams.get("id");

  const [ad, setAd] = useState<AdDraft | null>(null);
  const [models, setModels] = useState<PromoAdModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const clipDuration = useMemo(() => {
    if (!ad) return 0;
    return ad.clips.reduce(
      (s, c) => s + Math.max(0, c.detection.endSec - c.detection.startSec),
      0
    );
  }, [ad]);

  const loadAd = useCallback(async () => {
    if (!adId) return;
    const res = await fetch(`/api/promo-ads/${adId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load ad");
    setAd(data.ad);
  }, [adId]);

  useEffect(() => {
    document.title = "Create promo ad · Admin";
  }, []);

  useEffect(() => {
    fetch("/api/promo-ads/models")
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!adId) {
      setLoading(false);
      setError("Missing ad id — start from Ad clips");
      return;
    }
    loadAd()
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [adId, loadAd]);

  useEffect(() => {
    if (!ad) return;
    const mode = ad.generationMode;
    const durationSeconds =
      mode === "CLIP_COMPOSE"
        ? Math.min(ad.modelParams.maxBodySeconds ?? 60, Math.ceil(clipDuration))
        : (ad.modelParams.durationSeconds ?? 12);

    const t = setTimeout(() => {
      fetch("/api/promo-ads/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          modelId: ad.generativeModelId ?? undefined,
          durationSeconds,
          audioEnabled: ad.modelParams.audioEnabled,
          clipCount: ad.clips.length,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.estimate) setEstimate(d.estimate);
        })
        .catch(() => setEstimate(null));
    }, 300);
    return () => clearTimeout(t);
  }, [ad, clipDuration]);

  async function savePatch(patch: Record<string, unknown>) {
    if (!ad) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/promo-ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setAd(data.ad);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!ad || !estimate) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/promo-ads/${ad.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedCostUsd: estimate.totalUsd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generate failed");
      router.push(`/admin/ads/${ad.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setGenerating(false);
      setConfirmOpen(false);
    }
  }

  const generativeModels = models.filter((m) => m.generationMode === "generative");
  const selectedGenerativeModel =
    generativeModels.find((m) => m.id === ad?.generativeModelId) ?? generativeModels[0];
  const durationMax = selectedGenerativeModel?.maxDurationSec ?? 120;
  const durationStep = selectedGenerativeModel?.id.startsWith("luma-ray-2-") ? 1 : 6;
  const durationMin = selectedGenerativeModel?.id.startsWith("luma-ray-2-") ? 5 : 6;

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading draft…</p>;
  }

  if (!ad) {
    return (
      <div className="space-y-4">
        <p className="text-red-400">{error || "Ad not found"}</p>
        <Link href="/admin/ad-clips" className="text-brand-400 hover:underline">
          ← Back to ad clips
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Edit promo ad</h1>
          <p className="text-sm text-zinc-400">Status: {ad.status}</p>
        </div>
        <Link href="/admin/ad-clips" className="text-sm text-zinc-400 hover:text-white">
          ← Ad clips
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <label className="block text-sm text-zinc-300">
        Title
        <input
          value={ad.title ?? ""}
          onChange={(e) => setAd({ ...ad, title: e.target.value })}
          onBlur={() => savePatch({ title: ad.title })}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>

      <fieldset className="space-y-2 rounded-xl border border-zinc-800 p-4">
        <legend className="px-1 text-sm font-medium text-zinc-300">Creation mode</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={ad.generationMode === "CLIP_COMPOSE"}
            onChange={() => {
              setAd({ ...ad, generationMode: "CLIP_COMPOSE" });
              savePatch({ generationMode: "CLIP_COMPOSE" });
            }}
          />
          Clip compose — professional stitch + logo intro/outro ($0 AI)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={ad.generationMode === "GENERATIVE"}
            onChange={() => {
              setAd({ ...ad, generationMode: "GENERATIVE" });
              savePatch({ generationMode: "GENERATIVE" });
            }}
          />
          AI generate — new footage from prompt
        </label>
      </fieldset>

      {ad.generationMode === "GENERATIVE" && (
        <>
          <label className="block text-sm text-zinc-300">
            Generative model
            <select
              value={ad.generativeModelId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                setAd({ ...ad, generativeModelId: id });
                savePatch({ generativeModelId: id });
              }}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            >
              {generativeModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — ${m.pricePerSecondUsd.toFixed(3)}/s
                  {m.deprecated ? " (deprecated)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-zinc-300">
            Prompt
            <textarea
              rows={6}
              value={ad.prompt ?? ""}
              onChange={(e) => setAd({ ...ad, prompt: e.target.value })}
              onBlur={() => savePatch({ prompt: ad.prompt })}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white"
            />
          </label>

          <label className="block text-sm text-zinc-300">
            Duration (seconds)
            <input
              type="number"
              min={durationMin}
              max={durationMax}
              step={durationStep}
              value={ad.modelParams.durationSeconds ?? 12}
              onChange={(e) => {
                const durationSeconds = parseInt(e.target.value, 10) || 12;
                const modelParams = { ...ad.modelParams, durationSeconds };
                setAd({ ...ad, modelParams });
              }}
              onBlur={() => savePatch({ modelParams: ad.modelParams })}
              className="mt-1 w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
            {selectedGenerativeModel?.id.startsWith("luma-ray-2-") && (
              <span className="mt-1 block text-xs text-zinc-500">
                Luma Ray 2 bills 5s or 9s only (≥7s request → 9s clip).
              </span>
            )}
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={ad.modelParams.audioEnabled ?? false}
              onChange={(e) => {
                const modelParams = { ...ad.modelParams, audioEnabled: e.target.checked };
                setAd({ ...ad, modelParams });
                savePatch({ modelParams });
              }}
            />
            Generate with audio (higher cost on supported models)
          </label>
        </>
      )}

      {ad.generationMode === "CLIP_COMPOSE" && (
        <div className="space-y-4 rounded-xl border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Clip compose options</h2>

          <label className="block text-sm text-zinc-300">
            Max body length (seconds)
            <input
              type="number"
              min={10}
              max={180}
              value={ad.modelParams.maxBodySeconds ?? 60}
              onChange={(e) => {
                const maxBodySeconds = parseInt(e.target.value, 10) || 60;
                setAd({ ...ad, modelParams: { ...ad.modelParams, maxBodySeconds } });
              }}
              onBlur={() => savePatch({ modelParams: ad.modelParams })}
              className="mt-1 w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
            <span className="mt-1 block text-xs text-zinc-500">
              Selected clips total ~{Math.ceil(clipDuration)}s (+ 5s intro/outro)
            </span>
          </label>

          <label className="block text-sm text-zinc-300">
            Crossfade between clips (seconds)
            <input
              type="number"
              min={0.2}
              max={1.5}
              step={0.1}
              value={ad.modelParams.crossfadeSec ?? 0.5}
              onChange={(e) => {
                const crossfadeSec = parseFloat(e.target.value) || 0.5;
                setAd({ ...ad, modelParams: { ...ad.modelParams, crossfadeSec } });
              }}
              onBlur={() => savePatch({ modelParams: ad.modelParams })}
              className="mt-1 w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={ad.modelParams.kenBurns ?? false}
              onChange={(e) => {
                const modelParams = { ...ad.modelParams, kenBurns: e.target.checked };
                setAd({ ...ad, modelParams });
                savePatch({ modelParams });
              }}
            />
            Ken Burns slow zoom (more CPU)
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={ad.modelParams.removeSourceLogos ?? true}
              onChange={(e) => {
                const modelParams = { ...ad.modelParams, removeSourceLogos: e.target.checked };
                setAd({ ...ad, modelParams });
                savePatch({ modelParams });
              }}
            />
            Remove source-site corner watermarks
          </label>

          {(ad.modelParams.removeSourceLogos ?? true) && (
            <label className="block text-sm text-zinc-300">
              Watermark removal mode
              <select
                value={ad.modelParams.logoRemovalMode ?? "both"}
                onChange={(e) => {
                  const logoRemovalMode = e.target.value as "presets" | "auto" | "both";
                  const modelParams = { ...ad.modelParams, logoRemovalMode };
                  setAd({ ...ad, modelParams });
                  savePatch({ modelParams });
                }}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              >
                <option value="both">Presets + auto-detect fallback</option>
                <option value="presets">Per-source presets only</option>
                <option value="auto">OpenCV auto-detect only</option>
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={ad.modelParams.showTagline ?? true}
              onChange={(e) => {
                const modelParams = { ...ad.modelParams, showTagline: e.target.checked };
                setAd({ ...ad, modelParams });
                savePatch({ modelParams });
              }}
            />
            Show site domain on outro
          </label>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Clips ({ad.clips.length})</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-400">
          {ad.clips.map((c) => (
            <li key={c.id}>
              {c.detection.label} — {c.detection.videoTitle}
            </li>
          ))}
        </ul>
      </div>

      {estimate && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
          <h2 className="text-sm font-medium text-brand-200">Estimated cost</h2>
          <p className="mt-1 text-2xl font-bold text-white">
            ${estimate.totalUsd.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">{estimate.formula}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Wall time: {estimate.wallTimeEstimate}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={generating || saving || ad.status === "GENERATING"}
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {generating ? "Starting…" : "Generate ad"}
        </button>
        <Link
          href={`/admin/ads/${ad.id}`}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          View ad page
        </Link>
      </div>

      {confirmOpen && estimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="text-lg font-semibold text-white">Confirm generation</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This will charge approximately{" "}
              <strong className="text-white">${estimate.totalUsd.toFixed(2)}</strong>{" "}
              ({estimate.formula}).
            </p>
            <p className="mt-1 text-xs text-zinc-500">{estimate.wallTimeEstimate}</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
