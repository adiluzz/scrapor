"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import TagBadge from "@/components/site/TagBadge";
import PornstarPicker from "@/components/admin/PornstarPicker";
import {
  PISS_SWALLOW_VERIFIED_NAME,
  PISS_SWALLOW_VERIFIED_SLUG,
} from "@/lib/verified-tags";

type VideoForm = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sourceUrl: string;
  sourceSite: string;
  durationSec: string;
  viewCount: string;
  status: string;
  isDeleted: boolean;
  sourceUploadDate: string;
  tags: string[];
  pornstars: string[];
  categories: string[];
  tagDetails: { name: string; slug: string; icon: string | null }[];
  previewVersion: number | null;
  hasPreview: boolean;
  hasVideoSource: boolean;
};

const STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const;

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AdminVideoEditor({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<VideoForm | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [pornstars, setPornstars] = useState<string[]>([]);
  const [categoriesText, setCategoriesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [redownloading, setRedownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [taxonomyTags, setTaxonomyTags] = useState<string[]>([]);
  const [taxonomyStars, setTaxonomyStars] = useState<string[]>([]);
  const [taxonomyCategories, setTaxonomyCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [videoRes, taxRes] = await Promise.all([
        fetch(`/api/admin/videos/${videoId}`),
        fetch("/api/admin/taxonomy"),
      ]);
      const videoData = await videoRes.json();
      const taxData = await taxRes.json();
      if (!videoRes.ok) throw new Error(videoData.error || "Failed to load video");
      const v = videoData.video;
      setForm({
        id: v.id,
        slug: v.slug,
        title: v.title,
        description: v.description ?? "",
        sourceUrl: v.sourceUrl,
        sourceSite: v.sourceSite ?? "",
        durationSec: v.durationSec != null ? String(v.durationSec) : "",
        viewCount: String(v.viewCount ?? 0),
        status: v.status,
        isDeleted: v.isDeleted,
        sourceUploadDate: v.sourceUploadDate ? v.sourceUploadDate.slice(0, 16) : "",
        tags: v.tags ?? [],
        pornstars: v.pornstars ?? [],
        categories: v.categories ?? [],
        tagDetails: v.tagDetails ?? [],
        previewVersion: v.previewVersion ?? null,
        hasPreview: Boolean(v.hasPreview),
        hasVideoSource: Boolean(v.hasVideoSource),
      });
      setTagsText((v.tags ?? []).join(", "));
      setPornstars(v.pornstars ?? []);
      setCategoriesText((v.categories ?? []).join(", "));
      setTaxonomyTags((taxData.tags ?? []).map((t: { name: string }) => t.name));
      setTaxonomyStars((taxData.pornstars ?? []).map((p: { name: string }) => p.name));
      setTaxonomyCategories((taxData.categories ?? []).map((c: { name: string }) => c.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleVerifiedTag() {
    const has = tagsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .includes(PISS_SWALLOW_VERIFIED_NAME);
    const parts = parseList(tagsText).filter(
      (t) => t.toLowerCase() !== PISS_SWALLOW_VERIFIED_NAME
    );
    if (!has) parts.unshift(PISS_SWALLOW_VERIFIED_NAME);
    setTagsText(parts.join(", "));
  }

  const hasVerifiedTag = parseList(tagsText).some(
    (t) => t.toLowerCase() === PISS_SWALLOW_VERIFIED_NAME
  );

  async function regeneratePreview() {
    if (!form) return;
    if (!confirm("Regenerate hover preview and storyboard for this video? This may take a minute.")) {
      return;
    }
    setRegenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/regenerate-preview`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");
      setSuccess("Preview regeneration queued — refresh in about a minute to see v2 preview.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function redownloadVideo() {
    if (!form) return;
    if (
      !confirm(
        "Re-download this video from the source site? Existing files will be replaced. This may take several minutes."
      )
    ) {
      return;
    }
    setRedownloading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/redownload`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-download failed");
      setSuccess("Re-download queued — refresh in a few minutes when processing completes.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-download failed");
    } finally {
      setRedownloading(false);
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        sourceUrl: form.sourceUrl.trim(),
        sourceSite: form.sourceSite.trim() || null,
        durationSec: form.durationSec ? parseInt(form.durationSec, 10) : null,
        viewCount: parseInt(form.viewCount, 10) || 0,
        status: form.status,
        isDeleted: form.isDeleted,
        tags: parseList(tagsText),
        pornstars,
        categories: parseList(categoriesText),
      };
      if (form.sourceUploadDate) {
        body.sourceUploadDate = new Date(form.sourceUploadDate).toISOString();
      } else {
        body.sourceUploadDate = null;
      }

      const res = await fetch(`/api/admin/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess("Saved");
      router.refresh();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm text-zinc-500">Loading editor…</p>;
  }

  if (!form) {
    return <p className="mt-6 text-sm text-red-400">{error || "Failed to load"}</p>;
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none";

  return (
    <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Edit video</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Update metadata, taxonomy, and publication state.
        {form.hasPreview && (
          <>
            {" "}
            Hover preview:{" "}
            <span className="text-zinc-400">
              {form.previewVersion === 2 ? "v2 (scene montage)" : "legacy"}
            </span>
          </>
        )}
      </p>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-zinc-300 sm:col-span-2">
          Title
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Slug
          <input
            className={inputClass}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Status
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-zinc-300 sm:col-span-2">
          Description
          <textarea
            rows={4}
            className={inputClass}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>

        <label className="block text-sm text-zinc-300 sm:col-span-2">
          Source URL
          <input
            className={inputClass}
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Source site
          <input
            className={inputClass}
            value={form.sourceSite}
            onChange={(e) => setForm({ ...form, sourceSite: e.target.value })}
            placeholder="PornHub, XVideos…"
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Duration (seconds)
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.durationSec}
            onChange={(e) => setForm({ ...form, durationSec: e.target.value })}
          />
        </label>

        <label className="block text-sm text-zinc-300">
          View count
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.viewCount}
            onChange={(e) => setForm({ ...form, viewCount: e.target.value })}
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Source upload date
          <input
            type="datetime-local"
            className={inputClass}
            value={form.sourceUploadDate}
            onChange={(e) => setForm({ ...form, sourceUploadDate: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-2 self-end text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.isDeleted}
            onChange={(e) => setForm({ ...form, isDeleted: e.target.checked })}
          />
          Soft-deleted (hidden from site/CDN)
        </label>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-zinc-300">
            Tags (comma-separated)
            <input
              className={inputClass}
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              list="admin-tag-suggestions"
            />
          </label>
          <datalist id="admin-tag-suggestions">
            {taxonomyTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleVerifiedTag}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                hasVerifiedTag
                  ? "border-brand-500/50 bg-brand-500/10 text-brand-200"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {hasVerifiedTag ? "Remove" : "Add"} verified piss swallow
            </button>
            <TagBadge
              name={PISS_SWALLOW_VERIFIED_NAME}
              slug={PISS_SWALLOW_VERIFIED_SLUG}
              icon="golden-drop"
            />
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Verified badge means the video contains piss swallow (AI-reviewed or admin-confirmed).
          </p>
        </div>

        <label className="block text-sm text-zinc-300">
          Categories (comma-separated)
          <input
            className={inputClass}
            value={categoriesText}
            onChange={(e) => setCategoriesText(e.target.value)}
            list="admin-category-suggestions"
          />
          <datalist id="admin-category-suggestions">
            {taxonomyCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <div className="block text-sm text-zinc-300 sm:col-span-2">
          <span className="mb-1 block">Pornstars</span>
          <PornstarPicker
            value={pornstars}
            onChange={setPornstars}
            suggestions={taxonomyStars}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          disabled={regenerating || !form.hasVideoSource}
          onClick={regeneratePreview}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          title="Rebuild ~4s scene montage hover preview and adaptive storyboard"
        >
          {regenerating ? "Queuing…" : "Regenerate preview (v2)"}
        </button>
        <button
          type="button"
          disabled={redownloading || !form.sourceUrl || form.sourceUrl.startsWith("upload://")}
          onClick={redownloadVideo}
          className="rounded-lg border border-amber-700/50 px-4 py-2 text-sm text-amber-300 hover:bg-amber-950/30 disabled:opacity-50"
          title="Download fresh copy from source URL and replace stored video + previews"
        >
          {redownloading ? "Queuing…" : "Re-download from source"}
        </button>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
