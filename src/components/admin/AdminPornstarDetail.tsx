"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VideoCardData } from "@/lib/queries";
import { pornstarProfileFields, type PornstarProfileData } from "@/lib/pornstar-profile";
import AssignPornstarVideos from "@/components/admin/AssignPornstarVideos";
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
  suspended: boolean;
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scopeSiteId, setScopeSiteId] = useState("");
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setStar(initialPornstar);
    setImageUrl(initialPornstar.imageUrl);
    setVideos(initialVideos);
    setSelectedIds([]);
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

  async function deletePornstar() {
    const count = star.videoCount;
    if (
      !confirm(
        `Delete ${star.name} (/pornstars/${star.slug})? This removes the profile and unlinks it from ${count} video${count === 1 ? "" : "s"}. The videos stay.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${star.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      router.push("/admin/pornstars");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function setSuspension(opts: {
    suspended: boolean;
    videoIds?: string[];
    all?: boolean;
    siteId?: string;
  }) {
    const siteId = opts.siteId ?? (scopeSiteId || undefined);
    const scopeName =
      siteId
        ? star.siteCounts?.find((site) => site.siteId === siteId)?.name ||
          videos.flatMap((video) => video.sites).find((site) => site.id === siteId)?.name ||
          "that site"
        : "every site";
    const target = opts.all
      ? `all ${star.videoCount} video${star.videoCount === 1 ? "" : "s"} linked to ${star.name}`
      : `${opts.videoIds?.length ?? 0} selected video${opts.videoIds?.length === 1 ? "" : "s"}`;
    const verb = opts.suspended ? "Suspend" : "Unsuspend";
    if (
      !confirm(
        `${verb} ${target} on ${scopeName}? The slug and URL stay. Suspended pages return a 404 with a link to the homepage.`
      )
    ) {
      return;
    }

    setSuspendBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/videos/suspension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suspended: opts.suspended,
          ...(siteId ? { siteId } : {}),
          ...(opts.all ? { pornstarId: star.id } : { videoIds: opts.videoIds }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setVideos((prev) =>
        prev.map((video) => {
          const affected = opts.all || opts.videoIds?.includes(video.id);
          if (!affected) return video;
          return {
            ...video,
            sites: video.sites.map((site) =>
              !siteId || site.id === siteId ? { ...site, suspended: opts.suspended } : site
            ),
          };
        })
      );
      setSelectedIds([]);
      setSuccess(
        `${opts.suspended ? "Suspended" : "Unsuspended"} ${data.updated} site listing${data.updated === 1 ? "" : "s"}.`
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSuspendBusy(false);
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
            <button
              type="button"
              disabled={busy || deleting}
              onClick={deletePornstar}
              className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete pornstar"}
            </button>
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

      <AssignPornstarVideos
        pornstarId={star.id}
        pornstarName={star.name}
        pornstarSlug={star.slug}
        onAssigned={(linked) => {
          if (linked > 0) {
            setStar((current) => ({ ...current, videoCount: current.videoCount + linked }));
            router.refresh();
          }
        }}
      />

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Videos ({star.videoCount})</h2>
          {star.videoCount > videos.length && (
            <p className="text-xs text-zinc-500">
              Showing the latest {videos.length}. Suspend all still covers every linked video.
            </p>
          )}
        </div>
        {videos.length === 0 ? (
          <p className="text-sm text-zinc-500">No videos linked to this pornstar.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={suspendBusy}
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === videos.length ? [] : videos.map((video) => video.id)
                  )
                }
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {selectedIds.length === videos.length ? "Clear shown" : "Select shown"}
              </button>
              <label className="text-xs text-zinc-400">
                Site
                <select
                  value={scopeSiteId}
                  onChange={(e) => setScopeSiteId(e.target.value)}
                  className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                >
                  <option value="">All sites</option>
                  {(star.siteCounts ?? []).map((site) => (
                    <option key={site.siteId} value={site.siteId}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-zinc-500">{selectedIds.length} selected</span>
              <button
                type="button"
                disabled={suspendBusy || selectedIds.length === 0}
                onClick={() => setSuspension({ suspended: true, videoIds: selectedIds })}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-black hover:bg-amber-500 disabled:opacity-50"
              >
                Suspend selected
              </button>
              <button
                type="button"
                disabled={suspendBusy || selectedIds.length === 0}
                onClick={() => setSuspension({ suspended: false, videoIds: selectedIds })}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Unsuspend selected
              </button>
              <button
                type="button"
                disabled={suspendBusy || star.videoCount === 0}
                onClick={() => setSuspension({ suspended: true, all: true })}
                className="rounded-lg border border-amber-700 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
              >
                Suspend all
              </button>
              <button
                type="button"
                disabled={suspendBusy || star.videoCount === 0}
                onClick={() => setSuspension({ suspended: false, all: true })}
                className="rounded-lg border border-emerald-800 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
              >
                Unsuspend all
              </button>
            </div>
            <VideoGrid
              videos={videos}
              hrefPrefix="/admin/videos"
              hrefBy="id"
              selectedIds={new Set(selectedIds)}
              onToggleSelect={toggleSelected}
              badges={Object.fromEntries(
                videos.flatMap((video) => {
                  const relevant = scopeSiteId
                    ? video.sites.filter((site) => site.id === scopeSiteId)
                    : video.sites;
                  const suspendedCount = relevant.filter((site) => site.suspended).length;
                  if (suspendedCount === 0) return [];
                  const label = suspendedCount === relevant.length ? "Suspended" : "Partial";
                  return [[video.id, label]];
                })
              )}
            />
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
              {videos.map((v) => (
                <li key={v.linkId} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(v.id)}
                        aria-label={`Select ${v.title}`}
                        onChange={() => toggleSelected(v.id)}
                        className="h-4 w-4 accent-brand-500"
                      />
                      <Link href={`/admin/videos/${v.id}`} className="text-zinc-200 hover:text-white">
                        {v.title}
                      </Link>
                    </div>
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
                          {site.suspended ? <span className="text-amber-400">suspended</span> : null}
                          <button
                            type="button"
                            disabled={suspendBusy}
                            onClick={() =>
                              setSuspension({
                                suspended: !site.suspended,
                                videoIds: [v.id],
                                siteId: site.id,
                              })
                            }
                            className="px-1.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                          >
                            {site.suspended ? "Unsuspend" : "Suspend"}
                          </button>
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
