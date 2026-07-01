"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AgentTool = {
  id: string;
  key: string;
  description: string;
};

export default function ToolsPage() {
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTools = async () => {
    setLoading(true);
    setError(null);
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
  };

  useEffect(() => { document.title = "Tools | Scrapor"; }, []);

  useEffect(() => {
    loadTools();
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200 text-sm">← Home</Link>
        <Link href="/assistant" className="text-zinc-400 hover:text-zinc-200 text-sm">Assistant</Link>
        <Link href="/settings" className="text-zinc-400 hover:text-zinc-200 text-sm">Settings</Link>
        <Link href="/contexts" className="text-zinc-400 hover:text-zinc-200 text-sm">Contexts</Link>
        <Link href="/skills" className="text-zinc-400 hover:text-zinc-200 text-sm">Skills</Link>
        <Link href="/chats" className="text-zinc-400 hover:text-zinc-200 text-sm">Chats</Link>
        <h1 className="text-lg font-semibold ml-2">Tool Descriptions</h1>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-4">
        {error && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"}`}>
            {error}
          </div>
        )}
        <div className="flex justify-end">
          <button
            onClick={loadTools}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {tools.map((tool, idx) => (
          <section key={tool.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
            <div className="text-xs text-zinc-500">Tool #{idx + 1}</div>
            <div className="font-mono text-sm text-zinc-200">{tool.key}</div>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{tool.description}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
