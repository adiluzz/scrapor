"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ApplicationActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true);
    await fetch(`/api/admin/applications/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reviewNote: note || undefined }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
        className="w-48 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white" />
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => act("approve")}
          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500">Approve</button>
        <button disabled={busy} onClick={() => act("reject")}
          className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-500">Reject</button>
      </div>
    </div>
  );
}
