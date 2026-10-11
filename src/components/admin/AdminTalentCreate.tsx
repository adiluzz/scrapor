"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminTalentCreate({
  studioSites,
}: {
  studioSites: { id: string; name: string; domain: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState(studioSites[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/talent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, siteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create talent");
      router.push(`/admin/talent/${data.talent.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create talent");
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <label className="block text-sm text-zinc-300">
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Noa Koren"
        />
      </label>
      <label className="block text-sm text-zinc-300">
        Studio site
        <select
          required
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className={inputClass}
        >
          {studioSites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name} ({site.domain})
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !name.trim() || !siteId}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create and edit"}
      </button>
    </form>
  );
}
