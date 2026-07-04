"use client";

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

export default function PromoAdIterationTimeline({
  iterations,
  activeNumber,
  onSelect,
}: {
  iterations: Iteration[];
  activeNumber: number;
  onSelect: (n: number) => void;
}) {
  if (iterations.length === 0) {
    return <p className="text-sm text-zinc-500">No iterations yet.</p>;
  }

  return (
    <ol className="space-y-2">
      {iterations.map((it) => {
        const active = it.iterationNumber === activeNumber;
        const cost = it.actualCostUsd ?? it.estimatedCostUsd;
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onSelect(it.iterationNumber)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                active
                  ? "border-brand-500/60 bg-brand-500/10 text-white"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">v{it.iterationNumber}</span>
                <span
                  className={`text-xs ${
                    it.status === "DONE"
                      ? "text-emerald-400"
                      : it.status === "ERROR"
                        ? "text-red-400"
                        : it.status === "GENERATING"
                          ? "text-amber-400"
                          : "text-zinc-500"
                  }`}
                >
                  {it.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {new Date(it.createdAt).toLocaleString()}
                {cost != null && cost > 0 ? ` · $${cost.toFixed(2)}` : cost === 0 ? " · $0" : ""}
              </p>
              {it.userFeedback && (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                  Feedback: {it.userFeedback}
                </p>
              )}
              {it.error && (
                <p className="mt-1 line-clamp-2 text-xs text-red-400">{it.error}</p>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
