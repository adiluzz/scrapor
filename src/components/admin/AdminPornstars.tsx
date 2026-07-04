"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { pornstarProfileFields, type PornstarProfileData } from "@/lib/pornstar-profile";

type PornstarRow = Omit<PornstarProfileData, "tpdbSyncedAt"> & {
  id: string;
  name: string;
  slug: string;
  videoCount: number;
  hasImage: boolean;
  imageUrl: string | null;
  tpdbSyncedAt: string | null;
};

type TpdbMatch = {
  id: string;
  name: string;
  disambiguation?: string | null;
  imageUrl: string | null;
  imageCount: number;
};

function cacheBust(url: string | null) {
  if (!url) return null;
  return `${url}?v=${Date.now()}`;
}

function PornstarImageEditor({
  star,
  tpdbConfigured,
  onUpdated,
}: {
  star: PornstarRow;
  tpdbConfigured: boolean;
  onUpdated: (id: string, patch: Partial<PornstarRow>) => void;
}) {
  const [imageUrl, setImageUrl] = useState(star.imageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tpdbOpen, setTpdbOpen] = useState(false);
  const [tpdbQ, setTpdbQ] = useState(star.name);
  const [tpdbMatches, setTpdbMatches] = useState<TpdbMatch[]>([]);
  const [tpdbSearching, setTpdbSearching] = useState(false);

  useEffect(() => {
    setImageUrl(star.imageUrl);
  }, [star.imageUrl]);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/pornstars/${star.id}/image`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const url = cacheBust(`/media/pornstar/${star.id}`);
      setImageUrl(url);
      onUpdated(star.id, { hasImage: true, imageUrl: url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function fetchFromTpdb(tpdbId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${star.id}/fetch-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tpdbId ? { tpdbId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      const url = data.imageSaved ? cacheBust(`/media/pornstar/${star.id}`) : imageUrl;
      if (data.imageSaved) setImageUrl(url);
      onUpdated(star.id, {
        hasImage: Boolean(data.imageSaved) || star.hasImage,
        imageUrl: data.imageSaved ? url : star.imageUrl,
        tpdbId: data.tpdbId ?? star.tpdbId,
        tpdbSyncedAt: data.syncedAt ?? new Date().toISOString(),
      });
      if (data.metadataSynced) {
        const refresh = await fetch(`/api/admin/pornstars?limit=100&q=${encodeURIComponent(star.name)}`);
        const refreshed = await refresh.json();
        const row = refreshed.pornstars?.find((p: PornstarRow) => p.id === star.id);
        if (row) onUpdated(star.id, row);
      }
      setTpdbOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setBusy(false);
    }
  }

  async function searchTpdb() {
    if (tpdbQ.trim().length < 2) return;
    setTpdbSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/pornstars/search-external?q=${encodeURIComponent(tpdbQ.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setTpdbMatches(data.performers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setTpdbMatches([]);
    } finally {
      setTpdbSearching(false);
    }
  }

  async function removeImage() {
    if (!confirm(`Remove image for ${star.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${star.id}/image`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setImageUrl(null);
      onUpdated(star.id, { hasImage: false, imageUrl: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-600 to-purple-600">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={star.name}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
              {star.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{star.name}</p>
          <p className="text-xs text-zinc-500">
            {star.videoCount} video{star.videoCount === 1 ? "" : "s"} · /pornstars/{star.slug}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
              {busy ? "Working…" : "Upload image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>

            {tpdbConfigured && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fetchFromTpdb()}
                  className="rounded-lg bg-brand-600/90 px-3 py-1.5 text-xs text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  Auto-fetch (TPDB)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setTpdbOpen((v) => !v);
                    if (!tpdbOpen) searchTpdb();
                  }}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Pick from TPDB
                </button>
              </>
            )}

            {imageUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={removeImage}
                className="rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          {!tpdbConfigured && (
            <p className="mt-2 text-xs text-zinc-600">
              Set <code className="text-zinc-500">TPDB_API_KEY</code> to enable ThePornDB image fetch.
            </p>
          )}

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          {star.tpdbSyncedAt && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs font-medium text-zinc-400">
                TPDB profile · {new Date(star.tpdbSyncedAt).toLocaleString()}
              </p>
              <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {pornstarProfileFields(star).map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-zinc-600">{f.label}</dt>
                    <dd className="text-zinc-300">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {tpdbOpen && tpdbConfigured && (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          <div className="flex gap-2">
            <input
              value={tpdbQ}
              onChange={(e) => setTpdbQ(e.target.value)}
              placeholder="Search ThePornDB…"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-white"
            />
            <button
              type="button"
              onClick={searchTpdb}
              disabled={tpdbSearching}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {tpdbSearching ? "…" : "Search"}
            </button>
          </div>

          {tpdbMatches.length === 0 && !tpdbSearching && (
            <p className="text-xs text-zinc-500">No performers found.</p>
          )}

          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {tpdbMatches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fetchFromTpdb(m.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-left hover:border-brand-500/40 disabled:opacity-50"
                >
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">
                      ?
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{m.name}</span>
                    {m.disambiguation && (
                      <span className="block truncate text-xs text-zinc-500">{m.disambiguation}</span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-600">{m.imageCount} img</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AdminPornstars({
  initialPornstars,
  tpdbConfigured,
}: {
  initialPornstars: PornstarRow[];
  tpdbConfigured: boolean;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(initialPornstars);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async (query: string) => {
    setSearching(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/pornstars?${params}`);
      const data = await res.json();
      if (res.ok) setRows(data.pornstars ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  function handleUpdated(id: string, patch: Partial<PornstarRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter pornstars…"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
      />

      {searching && <p className="text-xs text-zinc-500">Loading…</p>}

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No pornstars found.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((star) => (
            <PornstarImageEditor
              key={star.id}
              star={star}
              tpdbConfigured={tpdbConfigured}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
