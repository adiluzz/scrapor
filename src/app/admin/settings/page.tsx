"use client";

import { useEffect, useMemo, useState } from "react";
import AssistantNav from "@/components/admin/AssistantNav";

type AssistantSettings = {
  temperature: number;
  maxSteps: number;
  numCtx: number;
  numPredict: number;
  model: string;
  customSystemPrompt: string;
};

type BedrockModel = {
  id: string;
  supportsTools: boolean;
  hasVision: boolean;
};

const defaultSettings: AssistantSettings = {
  temperature: 0,
  maxSteps: 12,
  numCtx: 8192,
  numPredict: 4096,
  model: "",
  customSystemPrompt: "",
};

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

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AssistantSettings>(defaultSettings);
  const [models, setModels] = useState<BedrockModel[]>([]);
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const selected = useMemo(
    () => models.find((m) => m.id === settings.model),
    [models, settings.model]
  );

  useEffect(() => {
    document.title = "Assistant settings · Admin";
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          fetch("/api/assistant-settings"),
          fetch("/api/admin/bedrock/models"),
        ]);
        const settingsJson = await settingsRes.json();
        const modelsJson = await modelsRes.json();
        if (!settingsRes.ok) throw new Error(settingsJson?.error || "Failed to load settings");
        if (!modelsRes.ok) throw new Error(modelsJson?.error || "Failed to load Bedrock models");
        setSettings({ ...defaultSettings, ...(settingsJson.settings || {}) });
        setModels(modelsJson.models || []);
        setRegion(modelsJson.region || "");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveSettings(e: React.FormEvent) {
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
  }

  return (
    <div>
      <AssistantNav active="/admin/settings" />
      <h1 className="text-xl font-bold text-white sm:text-2xl">Assistant settings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Models run on AWS Bedrock{region ? ` (${region})` : ""}. Credentials come from the server
        environment (IAM role or access keys).
      </p>

      <div className="mt-6 max-w-3xl space-y-6">
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

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="font-medium text-zinc-100">Bedrock models</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Configure <code className="text-zinc-400">BEDROCK_MODELS</code> (comma-separated) or{" "}
            <code className="text-zinc-400">BEDROCK_MODEL_ID</code> in the server environment.
          </p>
          {models.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No models configured.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {models.map((m) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    m.id === settings.model ? "border-brand-500/40 bg-brand-500/5" : "border-zinc-800"
                  }`}
                >
                  <code className="text-xs text-zinc-200">{m.id}</code>
                  <CapBadge ok={m.supportsTools} label="tools" />
                  <CapBadge ok={m.hasVision} label="vision" />
                  {m.id !== settings.model && (
                    <button
                      type="button"
                      onClick={() => setSettings((p) => ({ ...p, model: m.id }))}
                      className="ml-auto text-xs text-brand-400 hover:text-brand-300"
                    >
                      Select
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form
          onSubmit={saveSettings}
          className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4"
        >
          <h2 className="font-medium text-zinc-100">Runtime</h2>
          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-zinc-400">Active model</span>
                <select
                  value={settings.model}
                  onChange={(e) => setSettings((p) => ({ ...p, model: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  {models.length === 0 ? (
                    <option value={settings.model}>{settings.model || "Not configured"}</option>
                  ) : (
                    models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))
                  )}
                </select>
                {selected && (
                  <span className="mt-2 flex gap-2">
                    <CapBadge ok={selected.supportsTools} label="tool calling" />
                    <CapBadge ok={selected.hasVision} label="vision" />
                  </span>
                )}
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-zinc-400">Temperature: {settings.temperature}</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.temperature}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, temperature: Number(e.target.value) }))
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-zinc-400">Max agent steps</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={settings.maxSteps}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, maxSteps: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-zinc-400">Max output tokens</span>
                  <input
                    type="number"
                    min={256}
                    max={8192}
                    step={256}
                    value={settings.numPredict}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, numPredict: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-zinc-400">Custom system prompt (optional)</span>
                <textarea
                  value={settings.customSystemPrompt}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, customSystemPrompt: e.target.value }))
                  }
                  className="mt-1 min-h-[120px] w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </label>

              <button
                type="submit"
                disabled={saving || !settings.model}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
