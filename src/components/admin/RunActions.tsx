"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunActions({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStop = status === "RUNNING" || status === "QUEUED";
  const canContinue = status === "STOPPED";
  if (!canStop && !canContinue) return null;

  async function act(action: "stop" | "continue") {
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
    <div className="flex items-center gap-3">
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
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
