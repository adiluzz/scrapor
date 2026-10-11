"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { serializeAdminTalent } from "@/lib/studio-talent-admin";

type Talent = ReturnType<typeof serializeAdminTalent>;

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none";

function cacheBust(url: string | null): string | null {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

export default function AdminTalentEditor({ initialTalent }: { initialTalent: Talent }) {
  const router = useRouter();
  const [talent, setTalent] = useState(initialTalent);
  const [form, setForm] = useState({
    name: initialTalent.name,
    slug: initialTalent.slug,
    role: initialTalent.role,
    region: initialTalent.region,
    origin: initialTalent.origin,
    basedIn: initialTalent.basedIn,
    languages: initialTalent.languages.join(", "),
    signed: initialTalent.signed,
    featured: initialTalent.featured,
    published: initialTalent.published,
    sortOrder: String(initialTalent.sortOrder),
    tagline: initialTalent.tagline,
    bio: initialTalent.bio,
    grade: initialTalent.grade,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function applyTalent(next: Talent) {
    setTalent({
      ...next,
      photoUrl: cacheBust(next.photoUrl),
      images: next.images.map((item) => ({ ...item, url: cacheBust(item.url) || item.url })),
      videos: next.videos.map((item) => ({ ...item, url: cacheBust(item.url) || item.url })),
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/talent/${talent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          role: form.role,
          region: form.region,
          origin: form.origin,
          basedIn: form.basedIn,
          languages: form.languages.split(",").map((item) => item.trim()).filter(Boolean),
          signed: form.signed,
          featured: form.featured,
          published: form.published,
          sortOrder: Number(form.sortOrder) || 0,
          tagline: form.tagline,
          bio: form.bio,
          grade: form.grade,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      applyTalent(data.talent);
      setForm((current) => ({ ...current, slug: data.talent.slug }));
      setSuccess("Saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/talent/${talent.id}/photo`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      applyTalent(data.talent);
      setSuccess("Main image updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearPhoto() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/talent/${talent.id}/photo`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove image");
      applyTalent(data.talent);
      setSuccess("Main image removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove image");
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(kind: "image" | "video", file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch(`/api/admin/talent/${talent.id}/media`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      applyTalent(data.talent);
      setSuccess(kind === "image" ? "Still added" : "Video added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMedia(mediaId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/talent/${talent.id}/media/${mediaId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      applyTalent(data.talent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function removeTalent() {
    if (!confirm(`Delete ${talent.name} from the roster?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/talent/${talent.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      router.push("/admin/talent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">
            <Link href="/admin/talent" className="hover:text-zinc-300">
              Talent
            </Link>
            <span className="mx-2">/</span>
            {talent.site?.name || "Studio"}
          </p>
          <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">{talent.name}</h1>
        </div>
        {talent.site?.domain ? (
          <Link
            href={`https://${talent.site.domain}/team/${talent.slug}`}
            className="text-sm text-zinc-400 hover:text-white"
            target="_blank"
          >
            View public page
          </Link>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

      <section className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-200">Main image</p>
          <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-zinc-900">
            {talent.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={talent.photoUrl} alt={talent.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No portrait
              </div>
            )}
          </div>
          <label className="block cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-center text-sm text-zinc-200 hover:border-zinc-500">
            {busy ? "Working…" : "Upload portrait"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
          {talent.photoUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearPhoto()}
              className="w-full text-sm text-zinc-500 hover:text-red-400"
            >
              Remove portrait
            </button>
          ) : null}
        </div>

        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
              required
            />
          </label>
          <label className="text-sm text-zinc-300">
            Slug
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className={inputClass}
              required
            />
          </label>
          <label className="text-sm text-zinc-300">
            Role
            <input
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Region
            <select
              value={form.region}
              onChange={(e) =>
                setForm((f) => ({ ...f, region: e.target.value as Talent["region"] }))
              }
              className={inputClass}
            >
              <option value="israel">Israel</option>
              <option value="international">International</option>
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            Origin
            <input
              value={form.origin}
              onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Based in
            <input
              value={form.basedIn}
              onChange={(e) => setForm((f) => ({ ...f, basedIn: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Languages
            <input
              value={form.languages}
              onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))}
              className={inputClass}
              placeholder="Hebrew, English"
            />
          </label>
          <label className="text-sm text-zinc-300">
            Signed
            <input
              value={form.signed}
              onChange={(e) => setForm((f) => ({ ...f, signed: e.target.value }))}
              className={inputClass}
              placeholder="2024"
            />
          </label>
          <label className="text-sm text-zinc-300">
            Sort order
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="text-sm text-zinc-300 sm:col-span-2">
            Tagline
            <input
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="text-sm text-zinc-300 sm:col-span-2">
            Bio
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={8}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              Separate paragraphs with a blank line.
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
            />
            Featured on homepage
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
            />
            Published
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save talent"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeTalent()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-red-500 hover:text-red-400"
            >
              Delete
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Gallery stills</h2>
          <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500">
            Add images
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                files.forEach((file) => void uploadMedia("image", file));
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {talent.images.length === 0 ? (
          <p className="text-sm text-zinc-500">No extra stills yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {talent.images.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.title || ""} className="aspect-[3/4] w-full object-cover" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteMedia(item.id)}
                  className="w-full px-2 py-1.5 text-xs text-zinc-400 hover:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Videos</h2>
          <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500">
            Add videos
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                files.forEach((file) => void uploadMedia("video", file));
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {talent.videos.length === 0 ? (
          <p className="text-sm text-zinc-500">No videos yet. MP4, WebM, or MOV, under 80MB.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {talent.videos.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                <video src={item.url} controls className="aspect-video w-full bg-black" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteMedia(item.id)}
                  className="w-full px-2 py-1.5 text-xs text-zinc-400 hover:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
