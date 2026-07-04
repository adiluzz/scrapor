"use client";

/**
 * "Most replayed" bar rendered above the scrubber. `buckets` is the aggregate
 * per-N-second watch counter array; values are normalized to bar heights.
 */
export default function Heatmap({
  buckets,
  bucketSec = 5,
  onSeek,
}: {
  buckets: number[];
  bucketSec?: number;
  /** Seek to the start of a bucket when a bar is clicked. */
  onSeek?: (timeSec: number) => void;
}) {
  if (!buckets || buckets.length === 0) return null;
  const max = Math.max(...buckets, 1);

  return (
    <div className="flex h-8 w-full items-end gap-px overflow-hidden rounded-t bg-black/30">
      {buckets.map((b, i) => (
        <button
          key={i}
          type="button"
          title={`Jump to ${Math.floor((i * bucketSec) / 60)}:${String((i * bucketSec) % 60).padStart(2, "0")}`}
          onClick={() => onSeek?.(i * bucketSec)}
          className="flex-1 rounded-sm bg-gradient-to-t from-brand-700 to-brand-400 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          style={{ height: `${Math.max(6, (b / max) * 100)}%`, opacity: 0.4 + 0.6 * (b / max) }}
        />
      ))}
    </div>
  );
}
