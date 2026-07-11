"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none";

export default function NewWebsiteForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"TUBE" | "STUDIO">("TUBE");
  const [slug, setSlug] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#D4AF37");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          name,
          kind,
          slug: slug || undefined,
          primaryColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create");
        return;
      }
      router.push(`/admin/websites/${data.site.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      {error && <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Domain</span>
        <input
          required
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Slug</span>
        <input
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="example"
          pattern="[a-z0-9-]+"
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Kind</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "TUBE" | "STUDIO")}
          className={inputClass}
        >
          <option value="TUBE">TUBE</option>
          <option value="STUDIO">STUDIO</option>
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Primary color</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-zinc-700 bg-zinc-950"
          />
          <input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className={`${inputClass} max-w-[140px]`}
          />
        </div>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create website"}
      </button>
    </form>
  );
}
