import TagIcon from "@/components/site/TagIcon";
import {
  isVerifiedBadgeTag,
  verifiedBadgeTitle,
} from "@/lib/verified-tags";
import Link from "next/link";

type TagBadgeProps = {
  name: string;
  slug: string;
  icon?: string | null;
  href?: string;
  className?: string;
  primaryColor?: string | null;
};

export default function TagBadge({
  name,
  slug,
  icon,
  href,
  className = "",
  primaryColor,
}: TagBadgeProps) {
  const verified = isVerifiedBadgeTag({ slug, icon });
  const showIcon = verified || Boolean(icon);

  const baseClass = verified
    ? `inline-flex cursor-pointer items-center gap-2 rounded-full border border-brand-500/45 bg-gradient-to-r from-brand-950/90 via-zinc-900/90 to-brand-950/70 px-3 py-1.5 text-xs font-semibold tracking-wide text-brand-100 shadow-[0_0_14px_rgb(var(--brand-rgb)/0.12)] transition hover:border-brand-400/70 hover:shadow-[0_0_18px_rgb(var(--brand-rgb)/0.2)] ${className}`
    : `inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 transition hover:border-brand-500/40 hover:bg-zinc-700 hover:text-brand-300 ${className}`;

  const title = verified ? verifiedBadgeTitle({ slug, name }) : undefined;

  const content = (
    <>
      {showIcon && (
        <TagIcon
          icon={icon}
          slug={slug}
          className={verified ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"}
          primaryColor={primaryColor}
        />
      )}
      <span>{name}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={baseClass} title={title}>
        {content}
      </Link>
    );
  }

  return (
    <span className={baseClass.replace("cursor-pointer ", "")} title={title}>
      {content}
    </span>
  );
}
