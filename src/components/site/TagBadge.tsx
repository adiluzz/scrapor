import GoldenDrop from "@/components/brand/GoldenDrop";
import {
  GOLDEN_DROP_ICON,
  isVerifiedBadgeTag,
  PISS_SWALLOW_VERIFIED_SLUG,
} from "@/lib/verified-tags";
import Link from "next/link";

type TagBadgeProps = {
  name: string;
  slug: string;
  icon?: string | null;
  href?: string;
  className?: string;
};

export default function TagBadge({ name, slug, icon, href, className = "" }: TagBadgeProps) {
  const verified =
    isVerifiedBadgeTag({ slug, icon }) || slug === PISS_SWALLOW_VERIFIED_SLUG;
  const showDrop = verified || icon === GOLDEN_DROP_ICON;

  const inner = verified ? (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-brand-500/45 bg-gradient-to-r from-brand-950/90 via-zinc-900/90 to-brand-950/70 px-3 py-1.5 text-xs font-semibold tracking-wide text-brand-100 shadow-[0_0_14px_rgba(212,175,55,0.12)] ${className}`}
      title="Verified: contains piss swallow"
    >
      {showDrop && <GoldenDrop className="h-4 w-4 shrink-0" id={`tag-${slug}`} />}
      <span>{name}</span>
    </span>
  ) : (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 ${className}`}
    >
      {showDrop && <GoldenDrop className="h-3.5 w-3.5 shrink-0" id={`tag-${slug}`} />}
      {name}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`rounded-full transition-opacity hover:opacity-90 ${verified ? "hover:shadow-[0_0_18px_rgba(212,175,55,0.2)]" : ""}`}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
