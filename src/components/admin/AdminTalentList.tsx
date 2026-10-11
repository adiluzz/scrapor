"use client";

import Link from "next/link";

export type AdminTalentRow = {
  id: string;
  name: string;
  slug: string;
  role: string;
  region: "israel" | "international";
  origin: string;
  featured: boolean;
  published: boolean;
  photoUrl: string | null;
  images: { id: string }[];
  videos: { id: string }[];
  site: { id: string; name: string; domain: string } | null;
};

export default function AdminTalentList({
  initialTalents,
}: {
  initialTalents: AdminTalentRow[];
  studioSites: { id: string; name: string; domain: string }[];
}) {
  if (initialTalents.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-sm text-zinc-400">
        No talent yet.{" "}
        <Link href="/admin/talent/new" className="text-brand-400 hover:underline">
          Add the first performer
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {initialTalents.map((talent) => (
        <li key={talent.id}>
          <Link
            href={`/admin/talent/${talent.id}`}
            className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/70"
          >
            <span className="relative h-14 w-11 shrink-0 overflow-hidden bg-zinc-800">
              {talent.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={talent.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                  {talent.name.charAt(0)}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-white">{talent.name}</span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500">
                {talent.role}
                {talent.origin ? ` · ${talent.origin}` : ""}
                {talent.site ? ` · ${talent.site.name}` : ""}
              </span>
            </span>
            <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">
              {talent.images.length} stills · {talent.videos.length} videos
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1 text-[10px] uppercase tracking-wide">
              {talent.featured ? (
                <span className="text-brand-400">Featured</span>
              ) : null}
              <span className={talent.published ? "text-emerald-400" : "text-zinc-500"}>
                {talent.published ? "Live" : "Draft"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
