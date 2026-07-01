"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AssistantSettings = {
  temperature: number;
  maxSteps: number;
  numCtx: number;
  numPredict: number;
  /** Single model used for all tasks. */
  model: string;
  customSystemPrompt: string;
};

const defaultSettings: AssistantSettings = {
  temperature: 0,
  maxSteps: 12,
  numCtx: 8192,
  numPredict: 4096,
  model: "qwen2.5:7b",
  customSystemPrompt: "",
};

type ModelInfo = {
  name: string;
  size: number;
  hasVision: boolean;
  supportsTools: boolean;
};

function humanSize(bytes: number): string {
  if (!bytes) return "-";
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function CapBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
        ok ? "bg-emerald-900/60 text-emerald-300" : "bg-zinc-800 text-zinc-500"
      }`}
    >
      {label}
    </span>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AssistantSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [catalogModels, setCatalogModels] = useState<Array<{ name: string; size: number }>>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [pullModelName, setPullModelName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  const modelNames = useMemo(() => models.map((m) => m.name), [models]);
  const catalogModelNames = useMemo(() => catalogModels.map((m) => m.name), [catalogModels]);
  const selectedModelInfo = useMemo(
    () => models.find((m) => m.name === settings.model),
    [models, settings.model]
  );

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant-settings");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load settings");
      setSettings({ ...defaultSettings, ...(json.settings || {}) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const res = await fetch("/api/ollama/models");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to list models");
      setModels(json.models || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadCatalogModels = async () => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const res = await fetch("/api/ollama/catalog");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to list downloadable models");
      setCatalogModels(json.models || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => { document.title = "Settings | Scrapor"; }, []);

  useEffect(() => {
    loadSettings();
    loadModels();
    loadCatalogModels();
  }, []);

  // Auto-select first installed model if current selection isn't installed
  useEffect(() => {
    if (models.length === 0) return;
    const installed = new Set(modelNames);
    if (!installed.has(settings.model)) {
      const preferred =
        models.find((m) => m.supportsTools)?.name ||
        models.find((m) => m.name.startsWith("qwen2.5:"))?.name ||
        modelNames[0];
      if (preferred) setSettings((prev) => ({ ...prev, model: preferred }));
    }
  }, [models, modelNames, settings.model]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatus("");
    try {
      const res = await fetch("/api/assistant-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save settings");
      setSettings({ ...defaultSettings, ...(json.settings || {}) });
      setStatus("Settings saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pullModel = async () => {
    const model = pullModelName.trim();
    if (!model) return;
    setPulling(true);
    setError(null);
    setStatus("");
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to pull model");
      setStatus(`Model pulled: ${model}`);
      await loadModels();
      setSettings((prev) => ({ ...prev, model }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPulling(false);
    }
  };

  const deleteModel = async (model: string) => {
    if (!model || !window.confirm(`Delete model "${model}" from local Ollama?`)) return;
    setDeletingModel(model);
    setError(null);
    setStatus("");
    try {
      const res = await fetch("/api/ollama/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to delete model");
      setStatus(`Model deleted: ${model}`);
      await loadModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingModel(null);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200 text-sm">← Home</Link>
        <Link href="/assistant" className="text-zinc-400 hover:text-zinc-200 text-sm">Assistant</Link>
        <Link href="/contexts" className="text-zinc-400 hover:text-zinc-200 text-sm">Contexts</Link>
        <Link href="/tools" className="text-zinc-400 hover:text-zinc-200 text-sm">Tools</Link>
        <Link href="/skills" className="text-zinc-400 hover:text-zinc-200 text-sm">Skills</Link>
        <Link href="/chats" className="text-zinc-400 hover:text-zinc-200 text-sm">Chats</Link>
        <h1 className="text-lg font-semibold ml-2">Model & Assistant Settings</h1>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {(error || status) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              error
                ? "bg-red-500/10 border-red-500/30 text-red-300"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            }`}
          >
            {error || status}
          </div>
        )}

        {/* Installed models table */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-medium">Ollama models</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Loading the model list also probes each model for tool support — this may take a
                moment.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadModels}
                disabled={loadingModels}
                className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
              >
                {loadingModels ? "Testing models…" : "Refresh / test models"}
              </button>
              <button
                onClick={loadCatalogModels}
                disabled={loadingCatalog}
                className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
              >
                {loadingCatalog ? "Refreshing…" : "Refresh catalog"}
              </button>
            </div>
          </div>

          {/* Pull model */}
          <div className="mb-4 flex gap-2">
            <input
              list="ollama-downloadable-models"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
              placeholder="Model name to download (e.g. qwen2.5:7b)"
              className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
            />
            <button
              onClick={pullModel}
              disabled={pulling || !pullModelName.trim()}
              className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50"
            >
              {pulling ? "Downloading…" : "Download"}
            </button>
          </div>

          <div className="mb-2 text-xs text-zinc-500">
            Catalog entries: {catalogModels.length}
          </div>

          {/* Installed */}
          <div className="max-h-60 overflow-y-auto rounded border border-zinc-800 mb-3">
            {models.length === 0 ? (
              <div className="p-3 text-zinc-400 text-sm">
                {loadingModels ? "Testing models for tool support…" : "No installed models detected."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Model</th>
                    <th className="text-left p-2">Size</th>
                    <th className="text-left p-2">Capabilities</th>
                    <th className="text-left p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr
                      key={m.name}
                      className={`border-t border-zinc-800 ${
                        m.name === settings.model ? "bg-zinc-800/50" : ""
                      }`}
                    >
                      <td className="p-2 font-mono text-xs">{m.name}</td>
                      <td className="p-2 text-zinc-400">{humanSize(m.size)}</td>
                      <td className="p-2 flex gap-1 flex-wrap">
                        <CapBadge ok={m.supportsTools} label="tools" />
                        <CapBadge ok={m.hasVision} label="vision" />
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => setSettings((prev) => ({ ...prev, model: m.name }))}
                          disabled={m.name === settings.model}
                          className="mr-2 px-2 py-1 rounded text-xs bg-emerald-700/70 hover:bg-emerald-600 disabled:opacity-30"
                        >
                          Select
                        </button>
                        <button
                          onClick={() => deleteModel(m.name)}
                          disabled={deletingModel === m.name}
                          className="px-2 py-1 rounded text-xs bg-red-600/80 hover:bg-red-500 disabled:opacity-50"
                        >
                          {deletingModel === m.name ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Downloadable catalog */}
          <div className="max-h-48 overflow-y-auto rounded border border-zinc-800">
            {catalogModels.length === 0 ? (
              <div className="p-3 text-zinc-400 text-sm">No downloadable catalog models found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Downloadable model</th>
                    <th className="text-left p-2">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogModels.map((m) => (
                    <tr key={m.name} className="border-t border-zinc-800">
                      <td className="p-2">{m.name}</td>
                      <td className="p-2 text-zinc-400">{humanSize(m.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Assistant settings form */}
        <form
          onSubmit={saveSettings}
          className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4"
        >
          <h2 className="font-medium">Assistant runtime settings</h2>

          {loading ? (
            <div className="text-sm text-zinc-400">Loading settings…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Single model selector */}
                <label className="text-sm md:col-span-2">
                  <div className="mb-1 text-zinc-400">Active model</div>
                  <select
                    value={settings.model}
                    onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
                    disabled={models.length === 0}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
                  >
                    {models.length === 0 ? (
                      <option value="">No installed models</option>
                    ) : (
                      modelNames.map((name) => {
                        const info = models.find((m) => m.name === name);
                        const caps = [
                          info?.supportsTools ? "tools" : null,
                          info?.hasVision ? "vision" : null,
                        ]
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <option key={name} value={name}>
                            {name}
                            {caps ? `  [${caps}]` : ""}
                          </option>
                        );
                      })
                    )}
                  </select>
                  {selectedModelInfo && (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <CapBadge ok={selectedModelInfo.supportsTools} label="tool calling" />
                      <CapBadge ok={selectedModelInfo.hasVision} label="vision" />
                      {!selectedModelInfo.supportsTools && (
                        <span className="text-xs text-zinc-400">
                          Tool support not confirmed for this model — tools will still be offered but may not be used reliably.
                        </span>
                      )}
                    </div>
                  )}
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-zinc-400">Temperature: {settings.temperature}</div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.temperature}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, temperature: Number(e.target.value) }))
                    }
                    className="w-full"
                  />
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Keep at 0 for reliable tool calling
                  </div>
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-zinc-400">Max agent steps</div>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={settings.maxSteps}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, maxSteps: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
                  />
                  <div className="text-xs text-zinc-500 mt-0.5">Use 80+ for long scraping tasks</div>
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-zinc-400">Context window (numCtx)</div>
                  <input
                    type="number"
                    min={256}
                    max={32768}
                    step={256}
                    value={settings.numCtx}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, numCtx: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-zinc-400">Max output tokens (numPredict)</div>
                  <input
                    type="number"
                    min={32}
                    max={4096}
                    step={32}
                    value={settings.numPredict}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, numPredict: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
                  />
                </label>
              </div>

              <label className="text-sm block">
                <div className="mb-1 text-zinc-400">Custom system prompt (optional override)</div>
                <textarea
                  value={settings.customSystemPrompt}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, customSystemPrompt: e.target.value }))
                  }
                  placeholder="If set, this replaces the default system prompt."
                  className="w-full min-h-[120px] px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
                />
              </label>

              <button
                type="submit"
                disabled={saving || models.length === 0}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </>
          )}
        </form>
      </div>

      <datalist id="ollama-downloadable-models">
        {catalogModelNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </main>
  );
}
