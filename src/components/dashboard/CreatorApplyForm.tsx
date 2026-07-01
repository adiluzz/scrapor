"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatorApplyForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [desiredSlug, setDesiredSlug] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/creator/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, desiredSlug, bio }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setDone(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-emerald-300">
        Application submitted! We&apos;ll email you once it&apos;s reviewed.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-lg font-semibold text-white">Become a creator</h2>
      <p className="text-sm text-zinc-400">Apply to upload your own videos and get a public creator page.</p>
      {error && <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      <input required placeholder="Display name" value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none" />
      <input placeholder="Desired page URL (optional)" value={desiredSlug}
        onChange={(e) => setDesiredSlug(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none" />
      <textarea placeholder="Tell us about yourself (optional)" value={bio} rows={3}
        onChange={(e) => setBio(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none" />
      <button disabled={loading} type="submit"
        className="rounded-lg bg-pink-600 px-5 py-2.5 font-medium text-white hover:bg-pink-500 disabled:opacity-50">
        {loading ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
