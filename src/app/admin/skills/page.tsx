"use client";

import { useEffect, useState } from "react";
import AssistantNav from "@/components/admin/AssistantNav";

type AgentSkill = {
  id: string;
  key: string;
  title: string;
  content: string;
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const loadSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-skills", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load skills");
      setSkills(Array.isArray(json.skills) ? json.skills : []);
    } catch (e) {
      setError((e as Error).message || "Failed to load skills");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { document.title = "Skills | Scrapor"; }, []);

  useEffect(() => {
    loadSkills();
  }, []);

  const editSkill = (s: AgentSkill) => {
    setEditingId(s.id);
    setKeyInput(s.key);
    setTitleInput(s.title);
    setContentInput(s.content);
    setError(null);
    setStatus(`Editing "${s.title}"`);
  };

  const resetEditor = () => {
    setEditingId(null);
    setKeyInput("");
    setTitleInput("");
    setContentInput("");
  };

  const saveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = keyInput.trim().toLowerCase();
    const title = titleInput.trim();
    const content = contentInput;
    if (!key) return setError("Skill key is required.");
    if (!title) return setError("Skill title is required.");
    if (!content.trim()) return setError("Skill content is required.");

    setSaving(true);
    setError(null);
    setStatus("");
    try {
      if (editingId) {
        const res = await fetch(`/api/agent-skills/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, title, content }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to update skill");
        setStatus(`Skill updated: ${title}`);
      } else {
        const res = await fetch("/api/agent-skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, title, content }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to create skill");
        setStatus(`Skill created: ${title}`);
      }
      await loadSkills();
      resetEditor();
    } catch (e) {
      setError((e as Error).message || "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AssistantNav active="/admin/skills" />
      <h1 className="text-xl font-bold text-white sm:text-2xl">Skills</h1>

      <div className="mt-6 max-w-5xl space-y-6">
        {(error || status) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"}`}>
            {error || status}
          </div>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <h2 className="font-medium">{editingId ? "Update skill" : "Create skill"}</h2>
          <form onSubmit={saveSkill} className="space-y-3">
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Skill key (unique, e.g. web-research-citation)"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
            />
            <input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Skill title"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
            />
            <textarea
              value={contentInput}
              onChange={(e) => setContentInput(e.target.value)}
              placeholder="Skill content (text instructions loaded dynamically)"
              className="w-full min-h-[220px] px-3 py-2 rounded bg-zinc-950 border border-zinc-700"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update skill" : "Create skill"}
              </button>
              <button
                type="button"
                onClick={resetEditor}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">All skills</h2>
            <button
              onClick={loadSkills}
              disabled={loading}
              className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {skills.map((s) => (
            <div key={s.id} className="rounded border border-zinc-800 p-3">
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-zinc-500 mb-1 font-mono">{s.key}</div>
              <button
                onClick={() => editSkill(s)}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
              >
                Edit
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

