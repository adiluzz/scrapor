"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SiteOption = {
  id: string;
  name: string;
  domain: string;
  slug: string;
  primaryColor: string;
};

export default function SiteAssociationEditor({
  videoId,
  allSites,
  initialSiteIds,
}: {
  videoId: string;
  allSites: SiteOption[];
  initialSiteIds: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSiteIds));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    setStatus("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/sites`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setStatus("Sites updated.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h2 className="text-lg font-semibold text-white">Published on</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Choose which managed websites list this video. Storage site is unchanged.
      </p>

      {(error || status) && (
        <p
          className={`mt-3 rounded px-3 py-2 text-sm ${
            error ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {error || status}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {allSites.map((s) => {
          const on = selected.has(s.id);
          return (
            <label
              key={s.id}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                on
                  ? "border-brand-500 bg-brand-600/20 text-brand-200"
                  : "border-zinc-700 bg-zinc-950 text-zinc-400"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={on}
                onChange={() => toggle(s.id)}
              />
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.primaryColor }}
                />
                {s.name}
              </span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={loading}
        className="mt-4 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save site membership"}
      </button>
    </section>
  );
}
