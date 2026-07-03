"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiKeyType } from "@prisma/client";

const API_KEY_TYPES: ApiKeyType[] = ["READ_ONLY", "FULL_ACCESS"];

const TYPE_LABELS: Record<ApiKeyType, string> = {
  READ_ONLY: "Read Only",
  FULL_ACCESS: "Full Access",
};

interface ApiKeyRow {
  id: string;
  keyNumber: number;
  name: string;
  type: ApiKeyType;
  typeLabel: string;
  maskedHint: string;
  createdByName: string | null;
  updatedByName: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type ConfirmAction = "revoke" | "rotate";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function Modal({
  open,
  title,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        <div className="px-5 py-4">{children}</div>
        {actions && (
          <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">{actions}</div>
        )}
      </div>
    </div>
  );
}

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", type: "READ_ONLY" as ApiKeyType });
  const [creating, setCreating] = useState(false);

  const [editRow, setEditRow] = useState<ApiKeyRow | null>(null);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealTitle, setRevealTitle] = useState("API Key Created");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>("revoke");
  const [confirmTarget, setConfirmTarget] = useState<ApiKeyRow | null>(null);
  const [confirmProcessing, setConfirmProcessing] = useState(false);

  useEffect(() => {
    document.title = "API Keys · Admin";
  }, []);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/api-keys", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load API keys");
      setKeys(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create API key");
        return;
      }
      setIsCreateOpen(false);
      setCreateForm({ name: "", type: "READ_ONLY" });
      setRevealTitle("API Key Created");
      setRevealedKey(data.apiKey);
      await fetchKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleSaveName = async () => {
    if (!editRow || !editName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/api-keys/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update name");
        return;
      }
      setEditRow(null);
      await fetchKeys();
    } finally {
      setSavingName(false);
    }
  };

  const openConfirm = (action: ConfirmAction, row: ApiKeyRow) => {
    setConfirmAction(action);
    setConfirmTarget(row);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    setConfirmProcessing(true);
    try {
      if (confirmAction === "revoke") {
        const res = await fetch(`/api/api-keys/${confirmTarget.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to revoke API key");
          return;
        }
        setConfirmOpen(false);
        setConfirmTarget(null);
        await fetchKeys();
      } else {
        const res = await fetch(`/api/api-keys/${confirmTarget.id}/rotate`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to rotate API key");
          return;
        }
        setConfirmOpen(false);
        setConfirmTarget(null);
        setRevealTitle("API Key Rotated");
        setRevealedKey(data.apiKey);
        await fetchKeys();
      }
    } finally {
      setConfirmProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Create and manage scoped API keys for external integrations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          Create API Key
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-300">Usage</p>
        <p className="mt-1">
          Pass your key as{" "}
          <code className="rounded bg-zinc-800 px-1 text-zinc-200">Authorization: Bearer spk_…</code>{" "}
          or as a query parameter{" "}
          <code className="rounded bg-zinc-800 px-1 text-zinc-200">?apiKey=spk_…</code>.
        </p>
        <p className="mt-2">
          Read-only keys can access all GET endpoints. Full-access keys can use all API methods.
          View protected docs at{" "}
          <code className="rounded bg-zinc-800 px-1 text-zinc-200">/api/docs</code> with any active
          key.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        {loading ? (
          <div className="flex justify-center p-8 text-zinc-400">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No API keys yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Created By</th>
                  <th className="px-4 py-3 font-medium">Last Used</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {keys.map((k) => {
                  const revoked = Boolean(k.revokedAt);
                  return (
                    <tr key={k.id} className="bg-zinc-950/50 hover:bg-zinc-900/50">
                      <td className="px-4 py-3 text-white">{k.name}</td>
                      <td className="px-4 py-3 text-zinc-300">{k.typeLabel}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{k.maskedHint}</td>
                      <td className="px-4 py-3 text-zinc-400">{k.createdByName || "—"}</td>
                      <td className="px-4 py-3 text-zinc-400">{formatDate(k.lastUsedAt)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            revoked
                              ? "bg-zinc-800 text-zinc-400"
                              : "bg-emerald-900/50 text-emerald-300"
                          }`}
                        >
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {!revoked && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditRow(k);
                                setEditName(k.name);
                              }}
                              className="text-xs text-brand-400 hover:text-brand-300"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openConfirm("rotate", k)}
                              className="text-xs text-amber-400 hover:text-amber-300"
                            >
                              Rotate
                            </button>
                            <button
                              type="button"
                              onClick={() => openConfirm("revoke", k)}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={isCreateOpen}
        title="Create API Key"
        onClose={() => !creating && setIsCreateOpen(false)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              disabled={creating}
              className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !createForm.name.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Production integration"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Type</label>
            <select
              value={createForm.type}
              onChange={(e) =>
                setCreateForm({ ...createForm, type: e.target.value as ApiKeyType })
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            >
              {API_KEY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editRow}
        title="Edit API Key Name"
        onClose={() => !savingName && setEditRow(null)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setEditRow(null)}
              disabled={savingName}
              className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveName}
              disabled={savingName || !editName.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {savingName ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </Modal>

      <Modal
        open={!!revealedKey}
        title={revealTitle}
        onClose={() => setRevealedKey(null)}
        actions={
          <>
            <button
              type="button"
              onClick={() => revealedKey && copyText(revealedKey)}
              className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Copy Key
            </button>
            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
            >
              Done
            </button>
          </>
        }
      >
        <div className="mb-3 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          Copy this key now. It will not be shown again.
        </div>
        <textarea
          readOnly
          value={revealedKey ?? ""}
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white"
        />
      </Modal>

      <Modal
        open={confirmOpen}
        title={confirmAction === "revoke" ? "Revoke API Key" : "Rotate API Key"}
        onClose={() => !confirmProcessing && setConfirmOpen(false)}
        actions={
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={confirmProcessing}
              className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmProcessing}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                confirmAction === "revoke"
                  ? "bg-red-700 hover:bg-red-600"
                  : "bg-amber-700 hover:bg-amber-600"
              }`}
            >
              {confirmProcessing ? "Processing…" : "Confirm"}
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          {confirmAction === "revoke" ? (
            <>
              Are you sure you want to revoke <strong>{confirmTarget?.name}</strong>? Any integrations
              using this key will stop working immediately.
            </>
          ) : (
            <>
              Are you sure you want to rotate <strong>{confirmTarget?.name}</strong>? The current key
              will stop working immediately. You will receive the new key once.
            </>
          )}
        </p>
      </Modal>
    </div>
  );
}
