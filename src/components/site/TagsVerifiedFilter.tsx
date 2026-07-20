"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function TagsVerifiedFilter({ verifiedOnly }: { verifiedOnly: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(verified: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (verified) params.set("verified", "1");
    else params.delete("verified");
    const q = params.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <Link
        href={hrefFor(false)}
        className={`rounded-full border px-3 py-1.5 text-sm transition ${
          !verifiedOnly
            ? "border-brand-500/50 bg-brand-500/10 text-brand-200"
            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        }`}
      >
        All tags
      </Link>
      <Link
        href={hrefFor(true)}
        className={`rounded-full border px-3 py-1.5 text-sm transition ${
          verifiedOnly
            ? "border-brand-500/50 bg-brand-500/10 text-brand-200"
            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        }`}
      >
        Verified only
      </Link>
    </div>
  );
}
