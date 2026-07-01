"use client";

import { useEffect, useMemo, useState } from "react";
import AssistantNav from "@/components/admin/AssistantNav";

type SavedContext = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  selectedToolIds?: string[];
  selectedSkillIds?: string[];
};

type AgentTool = {
  id: string;
  key: string;
  description: string;
};

type AgentSkill = {
  id: string;
  key: string;
  title: string;
  content: string;
};

export default function ContextsPage() {
  const [contexts, setContexts] = useState<SavedContext[]>([]);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingActive, setSettingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [activeContextId, setActiveContextId] = useState("");
  const [selectedContextName, setSelectedContextName] = useState("");
  const [editorContextId, setEditorContextId] = useState<string | null>(null);
  const [contextNameInput, setContextNameInput] = useState("");
  const [contextContentInput, setContextContentInput] = useState("");
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [toolInput, setToolInput] = useState("");
  const [skillInput, setSkillInput] = useState("");

  const contextNames = useMemo(() => contexts.map((c) => c.name), [contexts]);
  const toolLabels = useMemo(
    () => tools.map((t) => `${t.key} — ${t.description}`),
    [tools]
  );
  const skillLabels = useMemo(
    () => skills.map((s) => `${s.title} (${s.key})`),
    [skills]
  );

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/assistant-settings", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return;
      setActiveContextId(String(json?.settings?.activeContextId || ""));
    } catch {
      // no-op
    }
  };

  const loadToolsAndSkills = async () => {
    try {
      const [toolsRes, skillsRes] = await Promise.all([
        fetch("/api/agent-tools", { cache: "no-store" }),
        fetch("/api/agent-skills", { cache: "no-store" }),
      ]);
      const toolsJson = await toolsRes.json();
      const skillsJson = await skillsRes.json();
      if (toolsRes.ok) setTools(Array.isArray(toolsJson.tools) ? toolsJson.tools : []);
      if (skillsRes.ok) setSkills(Array.isArray(skillsJson.skills) ? skillsJson.skills : []);
    } catch {
      // no-op
    }
  };

  const loadContexts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contexts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load contexts");
      const loaded = Array.isArray(json.contexts) ? (json.contexts as SavedContext[]) : [];
      setContexts(loaded);
      if (!selectedContextName && loaded.length > 0) {
        setSelectedContextName(loaded[0].name);
      }
    } catch (e) {
      setError((e as Error).message || "Failed to load contexts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { document.title = "Contexts | Scrapor"; }, []);

  useEffect(() => {
    loadContexts();
    loadToolsAndSkills();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSelectedAsActiveContext = async () => {
    const selected = contexts.find((c) => c.name === selectedContextName);
    if (!selected) {
      setError("Select an existing context name from autocomplete list.");
      return;
    }
    setSettingActive(true);
    setError(null);
    setStatus("");
    try {
      const res = await fetch("/api/assistant-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeContextId: selected.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to set active context");
      setActiveContextId(selected.id);
      setStatus(`Active context set to "${selected.name}".`);
    } catch (e) {
      setError((e as Error).message || "Failed to set active context");
    } finally {
      setSettingActive(false);
    }
  };

  const editSelectedContext = () => {
    const selected = contexts.find((c) => c.name === selectedContextName);
    if (!selected) {
      setError("Select an existing context name from autocomplete list.");
      return;
    }
    setEditorContextId(selected.id);
    setContextNameInput(selected.name);
    setContextContentInput(selected.content);
    setSelectedToolIds(selected.selectedToolIds || tools.map((t) => t.id));
    setSelectedSkillIds(selected.selectedSkillIds || []);
    setStatus(`Editing context "${selected.name}".`);
    setError(null);
  };

  const resetContextEditor = () => {
    setEditorContextId(null);
    setContextNameInput("");
    setContextContentInput("");
    setSelectedToolIds(tools.map((t) => t.id));
    setSelectedSkillIds([]);
    setToolInput("");
    setSkillInput("");
  };

  useEffect(() => {
    if (!editorContextId && tools.length > 0 && selectedToolIds.length === 0) {
      setSelectedToolIds(tools.map((t) => t.id));
    }
  }, [editorContextId, selectedToolIds.length, tools]);

  const addToolSelection = () => {
    const raw = toolInput.trim();
    if (!raw) return;
    const tool = tools.find((t) => `${t.key} — ${t.description}` === raw || t.key === raw || t.id === raw);
    if (!tool) {
      setError("Select a tool from autocomplete suggestions.");
      return;
    }
    setSelectedToolIds((prev) => (prev.includes(tool.id) ? prev : [...prev, tool.id]));
    setToolInput("");
    setError(null);
  };

  const addSkillSelection = () => {
    const raw = skillInput.trim();
    if (!raw) return;
    const skill = skills.find((s) => `${s.title} (${s.key})` === raw || s.key === raw || s.title === raw);
    if (!skill) {
      setError("Select a skill from autocomplete suggestions.");
      return;
    }
    setSelectedSkillIds((prev) => (prev.includes(skill.id) ? prev : [...prev, skill.id]));
    setSkillInput("");
    setError(null);
  };

  const saveContext = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = contextNameInput.trim();
    const content = contextContentInput;
    if (!name) {
      setError("Context name is required.");
      return;
    }
    if (!content.trim()) {
      setError("Context content is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setStatus("");
    try {
      if (editorContextId) {
        const res = await fetch(`/api/contexts/${editorContextId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content, selectedToolIds, selectedSkillIds }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to update context");
        setStatus(`Context updated: ${name}`);
      } else {
        const res = await fetch("/api/contexts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content, selectedToolIds, selectedSkillIds }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to create context");
        setStatus(`Context created: ${name}`);
      }
      await loadContexts();
      setSelectedContextName(name);
      resetContextEditor();
    } catch (e) {
      setError((e as Error).message || "Failed to save context");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AssistantNav active="/admin/contexts" />
      <h1 className="text-2xl font-bold text-white">Context manager</h1>

      <div className="mt-6 max-w-4xl space-y-6">
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

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Contexts</h2>
            <button
              onClick={loadContexts}
              disabled={loading}
              className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh contexts"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
            <label className="text-sm md:col-span-2">
              <div className="mb-1 text-zinc-400">Load context (autocomplete)</div>
              <input
                list="saved-context-names"
                value={selectedContextName}
                onChange={(e) => setSelectedContextName(e.target.value)}
                placeholder="Start typing a saved context name"
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void setSelectedAsActiveContext()}
                disabled={settingActive}
                className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-sm"
              >
                {settingActive ? "Setting..." : "Set active"}
              </button>
              <button
                type="button"
                onClick={editSelectedContext}
                className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
              >
                Edit selected
              </button>
            </div>
          </div>
          {activeContextId && (
            <div className="text-xs text-zinc-500">
              Active context id: <span className="text-zinc-300">{activeContextId}</span>
            </div>
          )}

          <form onSubmit={saveContext} className="space-y-3">
            <div className="text-xs text-zinc-500">
              {editorContextId ? "Update existing context" : "Create new context"}
            </div>
            <label className="text-sm block">
              <div className="mb-1 text-zinc-400">Context name (unique, autocomplete)</div>
              <input
                list="saved-context-names"
                value={contextNameInput}
                onChange={(e) => setContextNameInput(e.target.value)}
                placeholder="e.g. Xhamster Context"
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
              />
            </label>
            <label className="text-sm block">
              <div className="mb-1 text-zinc-400">Context content</div>
              <textarea
                value={contextContentInput}
                onChange={(e) => setContextContentInput(e.target.value)}
                placeholder="Write prompt/context text here..."
                className="w-full min-h-[220px] px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
              />
            </label>

            <label className="text-sm block">
              <div className="mb-1 text-zinc-400">Select tools (autocomplete)</div>
              <div className="flex gap-2">
                <input
                  list="tool-options"
                  value={toolInput}
                  onChange={(e) => setToolInput(e.target.value)}
                  placeholder="Type tool key..."
                  className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
                />
                <button
                  type="button"
                  onClick={addToolSelection}
                  className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
                >
                  Add tool
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedToolIds(tools.map((t) => t.id))}
                  className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedToolIds([])}
                  className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
                >
                  None
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedToolIds.map((id) => {
                  const tool = tools.find((t) => t.id === id);
                  if (!tool) return null;
                  return (
                    <span
                      key={id}
                      className="px-2 py-1 rounded bg-zinc-800 text-xs border border-zinc-700"
                    >
                      {tool.key}
                      <button
                        type="button"
                        onClick={() => setSelectedToolIds((prev) => prev.filter((x) => x !== id))}
                        className="ml-2 text-zinc-400 hover:text-red-300"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
              {tools.length === 0 && (
                <div className="mt-2 text-xs text-zinc-500">No tools loaded.</div>
              )}
            </label>

            <label className="text-sm block">
              <div className="mb-1 text-zinc-400">Select skills (autocomplete)</div>
              <div className="flex gap-2">
                <input
                  list="skill-options"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  placeholder="Type skill title..."
                  className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
                />
                <button
                  type="button"
                  onClick={addSkillSelection}
                  className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
                >
                  Add skill
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedSkillIds.map((id) => {
                  const skill = skills.find((s) => s.id === id);
                  if (!skill) return null;
                  return (
                    <span
                      key={id}
                      className="px-2 py-1 rounded bg-zinc-800 text-xs border border-zinc-700"
                    >
                      {skill.title}
                      <button
                        type="button"
                        onClick={() => setSelectedSkillIds((prev) => prev.filter((x) => x !== id))}
                        className="ml-2 text-zinc-400 hover:text-red-300"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : editorContextId ? "Update context" : "Create context"}
              </button>
              <button
                type="button"
                onClick={resetContextEditor}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>
          </form>
        </section>
      </div>

      <datalist id="saved-context-names">
        {contextNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="tool-options">
        {toolLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      <datalist id="skill-options">
        {skillLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </div>
  );
}
