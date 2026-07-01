"use client";

/**
 * "Most replayed" bar rendered above the scrubber. `buckets` is the aggregate
 * per-N-second watch counter array; values are normalized to bar heights.
 */
export default function Heatmap({ buckets }: { buckets: number[] }) {
  if (!buckets || buckets.length === 0) return null;
  const max = Math.max(...buckets, 1);

  return (
    <div className="flex h-8 w-full items-end gap-px overflow-hidden rounded-t bg-black/30">
      {buckets.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-gradient-to-t from-pink-600 to-pink-400"
          style={{ height: `${Math.max(6, (b / max) * 100)}%`, opacity: 0.4 + 0.6 * (b / max) }}
          title={`Segment ${i + 1}`}
        />
      ))}
    </div>
  );
}
