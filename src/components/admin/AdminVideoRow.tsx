"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Video = {
  id: string;
  title: string;
  slug: string;
  isDeleted: boolean;
  viewCount: number;
  sourceSite: string | null;
};

function useAdminVideoActions(video: Video) {
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

  return { editing, setEditing, title, setTitle, busy, save, toggleDelete };
}

function ActionButtons({
  editing,
  busy,
  isDeleted,
  onSave,
  onCancel,
  onEdit,
  onToggleDelete,
}: {
  editing: boolean;
  busy: boolean;
  isDeleted: boolean;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onToggleDelete: () => void;
}) {
  if (editing) {
    return (
      <>
        <button disabled={busy} onClick={onSave} className="rounded bg-brand-600 px-3 py-1 text-xs text-white hover:bg-brand-500">
          Save
        </button>
        <button onClick={onCancel} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
          Cancel
        </button>
      </>
    );
  }

  return (
    <>
      <button onClick={onEdit} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
        Edit
      </button>
      <button
        disabled={busy}
        onClick={onToggleDelete}
        className={`rounded px-3 py-1 text-xs text-white ${isDeleted ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"}`}
      >
        {isDeleted ? "Restore" : "Delete"}
      </button>
    </>
  );
}

function StatusBadge({ isDeleted }: { isDeleted: boolean }) {
  return isDeleted ? (
    <span className="text-red-400">deleted</span>
  ) : (
    <span className="text-emerald-400">live</span>
  );
}

export function AdminVideoRow({ video }: { video: Video }) {
  const { editing, setEditing, title, setTitle, busy, save, toggleDelete } = useAdminVideoActions(video);

  return (
    <tr className={video.isDeleted ? "opacity-50" : ""}>
      <td className="px-4 py-3">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
          />
        ) : (
          <a href={`/admin/videos/${video.slug}`} className="text-zinc-200 hover:text-white">
            {video.title}
          </a>
        )}
      </td>
      <td className="px-4 py-3 text-zinc-500">{video.sourceSite || "—"}</td>
      <td className="px-4 py-3 text-zinc-400">{video.viewCount}</td>
      <td className="px-4 py-3">
        <StatusBadge isDeleted={video.isDeleted} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <ActionButtons
            editing={editing}
            busy={busy}
            isDeleted={video.isDeleted}
            onSave={save}
            onCancel={() => setEditing(false)}
            onEdit={() => setEditing(true)}
            onToggleDelete={toggleDelete}
          />
        </div>
      </td>
    </tr>
  );
}

export function AdminVideoCard({ video }: { video: Video }) {
  const { editing, setEditing, title, setTitle, busy, save, toggleDelete } = useAdminVideoActions(video);

  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${video.isDeleted ? "opacity-50" : ""}`}
    >
      <div className="space-y-2">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        ) : (
          <a href={`/admin/videos/${video.slug}`} className="block text-sm font-medium text-zinc-200 hover:text-white">
            {video.title}
          </a>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{video.sourceSite || "—"}</span>
          <span>{video.viewCount.toLocaleString()} views</span>
          <StatusBadge isDeleted={video.isDeleted} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButtons
          editing={editing}
          busy={busy}
          isDeleted={video.isDeleted}
          onSave={save}
          onCancel={() => setEditing(false)}
          onEdit={() => setEditing(true)}
          onToggleDelete={toggleDelete}
        />
      </div>
    </div>
  );
}

export default AdminVideoRow;
