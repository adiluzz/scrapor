"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Site } from "@prisma/client";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none";

export default function WebsiteIdentityForm({ site }: { site: Site }) {
  const router = useRouter();
  const [form, setForm] = useState({
    domain: site.domain,
    name: site.name,
    kind: site.kind as "TUBE" | "STUDIO",
    slug: site.slug,
    tagline: site.tagline || "",
    primaryColor: site.primaryColor,
    logoPath: site.logoPath || "",
    logoKey: site.logoKey || "",
    isNetworkMember: site.isNetworkMember,
    mailFromName: site.mailFromName || "",
    networkOrder: site.networkOrder,
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sites/${site.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: form.domain,
          name: form.name,
          kind: form.kind,
          slug: form.slug,
          tagline: form.tagline || null,
          primaryColor: form.primaryColor,
          logoPath: form.logoPath || null,
          logoKey: form.logoKey || null,
          isNetworkMember: form.isNetworkMember,
          mailFromName: form.mailFromName || null,
          networkOrder: form.networkOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setStatus("Saved.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      {(error || status) && (
        <p
          className={`rounded px-3 py-2 text-sm ${
            error ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {error || status}
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Domain</span>
        <input required value={form.domain} onChange={(e) => set("domain", e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Name</span>
        <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Kind</span>
          <select
            value={form.kind}
            onChange={(e) => set("kind", e.target.value as "TUBE" | "STUDIO")}
            className={inputClass}
          >
            <option value="TUBE">TUBE</option>
            <option value="STUDIO">STUDIO</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Slug</span>
          <input required value={form.slug} onChange={(e) => set("slug", e.target.value)} className={inputClass} />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Tagline</span>
        <input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Primary color</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={form.primaryColor}
            onChange={(e) => set("primaryColor", e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-zinc-700 bg-zinc-950"
          />
          <input
            value={form.primaryColor}
            onChange={(e) => set("primaryColor", e.target.value)}
            className={`${inputClass} max-w-[140px]`}
          />
        </div>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Logo path</span>
          <input
            value={form.logoPath}
            onChange={(e) => set("logoPath", e.target.value)}
            placeholder="/brand/…-lockup.png"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Logo key</span>
          <input
            value={form.logoKey}
            onChange={(e) => set("logoKey", e.target.value)}
            placeholder="golden-drop | fbb-mark | sharlila-mark"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Mail from name</span>
        <input value={form.mailFromName} onChange={(e) => set("mailFromName", e.target.value)} className={inputClass} />
      </label>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.isNetworkMember}
            onChange={(e) => set("isNetworkMember", e.target.checked)}
            className="rounded border-zinc-600"
          />
          Network member
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Network order
          <input
            type="number"
            value={form.networkOrder}
            onChange={(e) => set("networkOrder", parseInt(e.target.value || "0", 10))}
            className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-white focus:border-brand-500 focus:outline-none"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save identity"}
      </button>
    </form>
  );
}
