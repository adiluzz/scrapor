"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunActions({
  runId,
  status,
  failed,
  hasSelectedCandidates,
}: {
  runId: string;
  status: string;
  failed: number;
  hasSelectedCandidates: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStop = status === "RUNNING" || status === "QUEUED";
  const canContinue = status === "STOPPED";
  const canRetryFailed =
    hasSelectedCandidates &&
    failed > 0 &&
    status !== "RUNNING" &&
    status !== "QUEUED";

  if (!canStop && !canContinue && !canRetryFailed) return null;

  async function act(action: "stop" | "continue" | "retry-failed") {
    if (action === "retry-failed") {
      const ok = confirm(
        `Retry ${failed} failed video${failed === 1 ? "" : "s"}? Already-saved and catalog videos are skipped.`
      );
      if (!ok) return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/scrape-runs/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {canStop && (
        <button
          onClick={() => act("stop")}
          disabled={loading}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {loading ? "Stopping…" : "Stop run"}
        </button>
      )}
      {canContinue && (
        <button
          onClick={() => act("continue")}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Resuming…" : "Continue run"}
        </button>
      )}
      {canRetryFailed && (
        <button
          onClick={() => act("retry-failed")}
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {loading ? "Queuing…" : `Retry failed (${failed})`}
        </button>
      )}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
