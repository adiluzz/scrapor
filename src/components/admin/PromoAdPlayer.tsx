"use client";

import { useEffect, useState } from "react";

export default function PromoAdPlayer({
  adId,
  iterationNumber,
}: {
  adId: string;
  iterationNumber: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);

    fetch(`/api/promo-ads/${adId}/playback?iteration=${iterationNumber}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Playback failed");
        if (!cancelled) setUrl(d.url);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Playback failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adId, iterationNumber]);

  if (loading) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-black text-sm text-zinc-500">
        Loading video…
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center text-sm text-zinc-500">
        {error || "Video not available yet"}
      </div>
    );
  }

  return (
    <video
      key={url}
      src={url}
      controls
      playsInline
      className="aspect-video w-full rounded-xl bg-black"
    />
  );
}
