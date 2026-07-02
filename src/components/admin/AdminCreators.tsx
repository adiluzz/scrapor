"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Creator = {
  id: string;
  displayName: string;
  slug: string;
  bio: string | null;
  user: { email: string };
  _count: { videos: number };
};

function Row({ creator }: { creator: Creator }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(creator.displayName);
  const [slug, setSlug] = useState(creator.slug);
  const [bio, setBio] = useState(creator.bio || "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch(`/api/admin/creators/${creator.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, slug, bio }),
    });
    setBusy(false); setEditing(false); router.refresh();
  }
  async function remove() {
    if (!confirm(`Delete creator ${creator.displayName}? Their videos will be soft-deleted.`)) return;
    setBusy(true);
    await fetch(`/api/admin/creators/${creator.id}`, { method: "DELETE" });
    setBusy(false); router.refresh();
  }

  return (
    <tr>
      <td className="px-4 py-3">
        {editing ? (
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white" />
        ) : (
          <a href={`/creators/${creator.slug}`} className="text-zinc-200 hover:text-white">{creator.displayName}</a>
        )}
      </td>
      <td className="px-4 py-3 text-zinc-500">
        {editing ? (
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white" />
        ) : creator.slug}
      </td>
      <td className="px-4 py-3 text-zinc-500">{creator.user.email}</td>
      <td className="px-4 py-3 text-zinc-400">{creator._count.videos}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <button disabled={busy} onClick={save} className="rounded bg-brand-600 px-3 py-1 text-xs text-white">Save</button>
              <button onClick={() => setEditing(false)} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300">Edit</button>
              <button disabled={busy} onClick={remove} className="rounded bg-red-600 px-3 py-1 text-xs text-white">Delete</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminCreators({ creators }: { creators: Creator[] }) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const res = await fetch("/api/admin/creators", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userEmail, displayName }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error || "Failed"); return; }
    setUserEmail(""); setDisplayName(""); router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <label className="block text-xs text-zinc-500">User email</label>
          <input required value={userEmail} onChange={(e) => setUserEmail(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs text-zinc-500">Display name</label>
          <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" />
        </div>
        <button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500">Create creator</button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Videos</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {creators.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No creators.</td></tr>
            ) : creators.map((c) => <Row key={c.id} creator={c} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
