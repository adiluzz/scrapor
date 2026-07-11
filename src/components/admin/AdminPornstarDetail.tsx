"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VideoCardData } from "@/lib/queries";
import { pornstarProfileFields, type PornstarProfileData } from "@/lib/pornstar-profile";
import VideoGrid from "@/components/site/VideoGrid";
import TpdbImagePicker, {
  type TpdbPickerImage,
  type TpdbPickerMatch,
} from "@/components/admin/TpdbImagePicker";

type SiteRef = {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
};

type SiteCount = {
  siteId: string;
  name: string;
  slug: string;
  primaryColor: string;
  count: number;
};

type PornstarRow = Omit<PornstarProfileData, "tpdbSyncedAt"> & {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  videoCount: number;
  siteCounts?: SiteCount[];
  storageSite?: { id: string; name: string; slug: string };
  hasImage: boolean;
  imageUrl: string | null;
  tpdbSyncedAt: string | null;
};

type VideoLink = VideoCardData & { linkId: string; sites: SiteRef[] };

function cacheBust(url: string | null) {
  if (!url) return null;
  return `${url}?v=${Date.now()}`;
}

export default function AdminPornstarDetail({
  initialPornstar,
  initialVideos,
  tpdbConfigured,
}: {
  initialPornstar: PornstarRow;
  initialVideos: VideoLink[];
  tpdbConfigured: boolean;
}) {
  const router = useRouter();
  const [star, setStar] = useState(initialPornstar);
  const [videos, setVideos] = useState(initialVideos);
  const [form, setForm] = useState({
    name: initialPornstar.name,
    slug: initialPornstar.slug,
    bio: initialPornstar.bio ?? "",
    disambiguation: initialPornstar.disambiguation ?? "",
    aliases: initialPornstar.aliases ?? "",
    gender: initialPornstar.gender ?? "",
    birthDate: initialPornstar.birthDate ?? "",
    deathDate: initialPornstar.deathDate ?? "",
    ethnicity: initialPornstar.ethnicity ?? "",
    country: initialPornstar.country ?? "",
    eyeColor: initialPornstar.eyeColor ?? "",
    hairColor: initialPornstar.hairColor ?? "",
    heightCm: initialPornstar.heightCm != null ? String(initialPornstar.heightCm) : "",
    measurements: initialPornstar.measurements ?? "",
    breastType: initialPornstar.breastType ?? "",
    careerStartYear:
      initialPornstar.careerStartYear != null ? String(initialPornstar.careerStartYear) : "",
    careerEndYear:
      initialPornstar.careerEndYear != null ? String(initialPornstar.careerEndYear) : "",
    tattoos: initialPornstar.tattoos ?? "",
    piercings: initialPornstar.piercings ?? "",
    urls: initialPornstar.urls ?? "",
  });

  const [imageUrl, setImageUrl] = useState(initialPornstar.imageUrl);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tpdbOpen, setTpdbOpen] = useState(false);

  useEffect(() => {
    setStar(initialPornstar);
    setImageUrl(initialPornstar.imageUrl);
    setVideos(initialVideos);
  }, [initialPornstar, initialVideos]);

  const inputClass =
    "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none";

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/pornstars/${star.id}/image`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const url = cacheBust(`/media/pornstar/${star.id}`);
      setImageUrl(url);
      setStar((s) => ({ ...s, hasImage: true, imageUrl: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyTpdbPick(match: TpdbPickerMatch, image: TpdbPickerImage) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${star.id}/fetch-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tpdbId: match.id, imageUrl: image.url, imageId: image.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      const url = cacheBust(data.imageUrl || `/media/pornstar/${star.id}`);
      setImageUrl(url);
      setStar((s) => ({
        ...s,
        hasImage: true,
        imageUrl: url,
        tpdbId: data.tpdbId ?? s.tpdbId,
        tpdbSyncedAt: data.syncedAt ?? new Date().toISOString(),
      }));
      setSuccess("Image and profile synced from ThePornDB");
      setTpdbOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setBusy(false);
    }
  }

  async function fetchFromTpdbAuto() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${star.id}/fetch-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      const url = cacheBust(data.imageUrl || `/media/pornstar/${star.id}`);
      setImageUrl(url);
      setStar((s) => ({
        ...s,
        hasImage: true,
        imageUrl: url,
        tpdbId: data.tpdbId ?? s.tpdbId,
        tpdbSyncedAt: data.syncedAt ?? new Date().toISOString(),
      }));
      setSuccess("Auto-fetched best image from ThePornDB");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    if (!confirm(`Remove image for ${star.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${star.id}/image`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setImageUrl(null);
      setStar((s) => ({ ...s, hasImage: false, imageUrl: null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${star.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          bio: form.bio.trim() || null,
          disambiguation: form.disambiguation.trim() || null,
          aliases: form.aliases.trim() || null,
          gender: form.gender.trim() || null,
          birthDate: form.birthDate.trim() || null,
          deathDate: form.deathDate.trim() || null,
          ethnicity: form.ethnicity.trim() || null,
          country: form.country.trim() || null,
          eyeColor: form.eyeColor.trim() || null,
          hairColor: form.hairColor.trim() || null,
          heightCm: form.heightCm ? parseInt(form.heightCm, 10) : null,
          measurements: form.measurements.trim() || null,
          breastType: form.breastType.trim() || null,
          careerStartYear: form.careerStartYear ? parseInt(form.careerStartYear, 10) : null,
          careerEndYear: form.careerEndYear ? parseInt(form.careerEndYear, 10) : null,
          tattoos: form.tattoos.trim() || null,
          piercings: form.piercings.trim() || null,
          urls: form.urls.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess("Saved");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function unlinkVideo(videoId: string, title: string) {
    if (!confirm(`Unlink ${star.name} from "${title}"? The video itself will not be deleted.`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/pornstars/${star.id}/videos?videoId=${encodeURIComponent(videoId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setVideos((prev) => prev.filter((v) => v.linkId !== videoId));
      setStar((s) => ({ ...s, videoCount: Math.max(0, s.videoCount - 1) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function removeFromSite(videoId: string, videoTitle: string, site: SiteRef) {
    if (
      !confirm(
        `Remove "${videoTitle}" from ${site.name}? It will no longer appear on that website.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/videos/${videoId}/sites?siteId=${encodeURIComponent(site.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      const nextSites = (data.sites ?? []) as SiteRef[];
      setVideos((prev) =>
        prev.map((v) => (v.linkId === videoId ? { ...v, sites: nextSites } : v))
      );
      setSuccess(`Removed from ${site.name}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative mx-auto h-32 w-32 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-600 to-purple-600 lg:mx-0">
          {imageUrl ? (
            <Image src={imageUrl} alt={star.name} fill className="object-cover" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-white">
              {star.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-zinc-500">
            {star.videoCount} video{star.videoCount === 1 ? "" : "s"} ·{" "}
            <a
              href={`/pornstars/${star.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand-400 hover:underline"
            >
              Public page
            </a>
          </p>

          {star.siteCounts && star.siteCounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {star.siteCounts.map((sc) => (
                <span
                  key={sc.siteId}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: sc.primaryColor }}
                  />
                  {sc.name}
                  <span className="text-zinc-500">{sc.count}</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
              {busy ? "Working…" : "Upload image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {tpdbConfigured && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fetchFromTpdbAuto()}
                  className="rounded-lg bg-brand-600/90 px-3 py-1.5 text-xs text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  Auto-fetch (TPDB)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setTpdbOpen((v) => !v)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Pick from TPDB
                </button>
              </>
            )}
            {imageUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={removeImage}
                className="rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
              >
                Remove image
              </button>
            )}
          </div>

          {star.tpdbSyncedAt && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs font-medium text-zinc-400">
                TPDB profile · {new Date(star.tpdbSyncedAt).toLocaleString()}
              </p>
              <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {pornstarProfileFields(star).map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-zinc-600">{f.label}</dt>
                    <dd className="text-zinc-300">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {tpdbOpen && tpdbConfigured && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <TpdbImagePicker
            initialQuery={star.name}
            disabled={busy}
            onSelect={applyTpdbPick}
          />
        </div>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Edit profile</h2>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-zinc-300 sm:col-span-2">
            Name
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
          <label className="block text-sm text-zinc-300 sm:col-span-2">
            Bio
            <textarea
              rows={3}
              className={inputClass}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Disambiguation
            <input
              className={inputClass}
              value={form.disambiguation}
              onChange={(e) => setForm({ ...form, disambiguation: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Aliases (JSON array string)
            <input
              className={inputClass}
              value={form.aliases}
              onChange={(e) => setForm({ ...form, aliases: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Gender
            <input
              className={inputClass}
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Country
            <input
              className={inputClass}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Birth date
            <input
              className={inputClass}
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Death date
            <input
              className={inputClass}
              value={form.deathDate}
              onChange={(e) => setForm({ ...form, deathDate: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Height (cm)
            <input
              type="number"
              className={inputClass}
              value={form.heightCm}
              onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Ethnicity
            <input
              className={inputClass}
              value={form.ethnicity}
              onChange={(e) => setForm({ ...form, ethnicity: e.target.value })}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Videos ({videos.length})
        </h2>
        {videos.length === 0 ? (
          <p className="text-sm text-zinc-500">No videos linked to this pornstar.</p>
        ) : (
          <div className="space-y-4">
            <VideoGrid videos={videos} hrefPrefix="/admin/videos" />
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
              {videos.map((v) => (
                <li key={v.linkId} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/admin/videos/${v.slug}`} className="text-zinc-200 hover:text-white">
                      {v.title}
                    </Link>
                    <button
                      type="button"
                      onClick={() => unlinkVideo(v.linkId, v.title)}
                      className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
                    >
                      Unlink pornstar
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-zinc-600">
                      Published on
                    </span>
                    {v.sites.length === 0 ? (
                      <span className="text-xs text-zinc-600">No websites</span>
                    ) : (
                      v.sites.map((site) => (
                        <span
                          key={site.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 pl-2 text-xs text-zinc-300"
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: site.primaryColor }}
                          />
                          {site.name}
                          <button
                            type="button"
                            title={`Remove from ${site.name}`}
                            onClick={() => removeFromSite(v.linkId, v.title, site)}
                            className="rounded-r-md px-1.5 py-1 text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
