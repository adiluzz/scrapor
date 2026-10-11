import Link from "next/link";
import type { StudioStar } from "@/lib/studio-talent";
import { studioStarPath } from "@/lib/studio-talent";
import StudioPortrait from "@/components/studio/StudioPortrait";

export default function StudioTalentCard({
  star,
  priority = false,
}: {
  star: StudioStar;
  priority?: boolean;
}) {
  return (
    <Link
      href={studioStarPath(star.slug)}
      className="group relative block aspect-[3/4] overflow-hidden bg-zinc-950"
    >
      <StudioPortrait star={star} priority={priority} className="absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <p className="studio-kicker text-[11px] text-brand-300/90">{star.origin}</p>
        <h3 className="font-display mt-1 text-2xl font-medium tracking-tight text-white sm:text-3xl">
          {star.name}
        </h3>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">{star.role}</p>
      </div>
    </Link>
  );
}
