"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminVideoRow({
  video,
}: {
  video: { id: string; title: string; slug: string; isDeleted: boolean; viewCount: number; sourceSite: string | null };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch(`/api/admin/videos/${video.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  async function toggleDelete() {
    setBusy(true);
    await fetch(`/api/admin/videos/${video.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDeleted: !video.isDeleted }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <tr className={video.isDeleted ? "opacity-50" : ""}>
      <td className="px-4 py-3">
        {editing ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white" />
        ) : (
          <a href={`/admin/videos/${video.slug}`} className="text-zinc-200 hover:text-white">{video.title}</a>
        )}
      </td>
      <td className="px-4 py-3 text-zinc-500">{video.sourceSite || "—"}</td>
      <td className="px-4 py-3 text-zinc-400">{video.viewCount}</td>
      <td className="px-4 py-3">
        {video.isDeleted ? <span className="text-red-400">deleted</span> : <span className="text-emerald-400">live</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <button disabled={busy} onClick={save} className="rounded bg-brand-600 px-3 py-1 text-xs text-white hover:bg-brand-500">Save</button>
              <button onClick={() => setEditing(false)} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700">Edit</button>
              <button disabled={busy} onClick={toggleDelete}
                className={`rounded px-3 py-1 text-xs text-white ${video.isDeleted ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"}`}>
                {video.isDeleted ? "Restore" : "Delete"}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
