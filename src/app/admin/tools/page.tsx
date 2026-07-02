"use client";

import { useEffect, useState } from "react";
import AssistantNav from "@/components/admin/AssistantNav";

type AgentTool = {
  id: string;
  key: string;
  description: string;
};

export default function AdminToolsPage() {
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Tools · Admin";
    (async () => {
      try {
        const res = await fetch("/api/agent-tools", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load tools");
        setTools(Array.isArray(json.tools) ? json.tools : []);
      } catch (e) {
        setError((e as Error).message || "Failed to load tools");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <AssistantNav active="/admin/tools" />
      <h1 className="text-xl font-bold text-white sm:text-2xl">Tool descriptions</h1>
      <p className="mt-1 text-sm text-zinc-500">Code-owned assistant tools registered in the app.</p>

      <div className="mt-6 max-w-5xl space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <ul className="space-y-3">
            {tools.map((t) => (
              <li key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <code className="text-sm text-brand-400">{t.key}</code>
                <p className="mt-2 text-sm text-zinc-300">{t.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
