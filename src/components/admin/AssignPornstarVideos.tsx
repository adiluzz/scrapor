"use client";

import { useEffect, useState } from "react";

type Hit = {
  id: string;
  title: string;
  slug: string;
  alreadyLinked?: boolean;
};

export default function AssignPornstarVideos({
  pornstarId,
  pornstarName,
  pornstarSlug,
  onAssigned,
}: {
  pornstarId: string;
  pornstarName: string;
  pornstarSlug: string;
  onAssigned: (linked: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({
        q,
        limit: "20",
        pornstarId,
      });
      fetch(`/api/admin/videos/search?${params}`)
        .then((res) => res.json())
        .then((data) => {
          setHits((data.videos ?? []) as Hit[]);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, pornstarId]);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function assign() {
    const ids = picked.filter((id) => hits.find((hit) => hit.id === id && !hit.alreadyLinked));
    if (ids.length === 0) return;
    if (
      !confirm(
        `Assign ${pornstarName} (/${pornstarSlug}) to ${ids.length} video${ids.length === 1 ? "" : "s"}? Other pornstars on those videos stay.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${pornstarId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assign failed");
      setHits((prev) =>
        prev.map((hit) => (ids.includes(hit.id) ? { ...hit, alreadyLinked: true } : hit))
      );
      setPicked([]);
      setMessage(
        data.linked
          ? `Assigned to ${data.linked} video${data.linked === 1 ? "" : "s"}.`
          : "Those videos were already linked."
      );
      onAssigned(data.linked ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  const selectable = hits.filter((hit) => !hit.alreadyLinked);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Assign to videos</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Search by title or slug and link this profile. This does not create another pornstar.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search videos…"
        className="mt-4 w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
      />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
      {searching && <p className="mt-3 text-xs text-zinc-500">Searching…</p>}
      {!searching && query.trim().length >= 2 && hits.length === 0 && (
        <p className="mt-3 text-sm text-zinc-500">No videos match that search.</p>
      )}
      {hits.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
          {hits.map((hit) => (
            <li key={hit.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={hit.alreadyLinked || picked.includes(hit.id)}
                disabled={hit.alreadyLinked || busy}
                aria-label={`Select ${hit.title}`}
                onChange={() => toggle(hit.id)}
                className="mt-1 h-4 w-4 accent-brand-500"
              />
              <div className="min-w-0">
                <p className="text-zinc-200">{hit.title}</p>
                <p className="truncate text-xs text-zinc-500">/{hit.slug}</p>
              </div>
              {hit.alreadyLinked && (
                <span className="ml-auto shrink-0 text-xs text-zinc-500">Already linked</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={busy || picked.length === 0 || selectable.length === 0}
        onClick={assign}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {busy ? "Assigning…" : "Assign selected"}
      </button>
    </section>
  );
}
