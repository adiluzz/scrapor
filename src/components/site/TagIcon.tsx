import GoldenDrop from "@/components/brand/GoldenDrop";
import FbbMark from "@/components/brand/FbbMark";
import { FBB_MARK_ICON, GOLDEN_DROP_ICON } from "@/lib/verified-tags";

/** Renders the small badge icon for a verified tag (search + tag pills). */
export default function TagIcon({
  icon,
  slug,
  className = "h-4 w-4 shrink-0",
  primaryColor,
}: {
  icon?: string | null;
  slug?: string;
  className?: string;
  primaryColor?: string | null;
}) {
  if (icon === FBB_MARK_ICON) {
    return <FbbMark className={className} id={`tag-icon-${slug || "fbb"}`} color={primaryColor || undefined} />;
  }
  if (icon === GOLDEN_DROP_ICON || !icon) {
    return <GoldenDrop className={className} id={`tag-icon-${slug || "drop"}`} />;
  }
  return <GoldenDrop className={className} id={`tag-icon-${slug || "drop"}`} />;
}
