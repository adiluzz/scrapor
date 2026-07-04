import LogoMark from "@/components/brand/Logo";
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

  const inner = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        verified
          ? "border border-brand-500/40 bg-brand-500/15 text-brand-200"
          : "bg-zinc-800 text-zinc-300"
      } ${className}`}
      title={verified ? "Verified: contains piss swallow" : undefined}
    >
      {showDrop && <LogoMark className="h-3.5 w-3.5 shrink-0" />}
      {name}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="hover:opacity-90">
        {inner}
      </Link>
    );
  }
  return inner;
}
