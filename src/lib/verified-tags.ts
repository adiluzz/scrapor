/** Verified content badge tags (AI-reviewed or admin-applied). */

export const PISS_SWALLOW_VERIFIED_SLUG = "piss-swallow";
export const PISS_SWALLOW_VERIFIED_NAME = "piss swallow";
export const GOLDEN_DROP_ICON = "golden-drop";

const SWALLOW_LABEL_RE = /piss\s*swallow/i;

export function isPissSwallowVerificationLabel(label: string): boolean {
  return SWALLOW_LABEL_RE.test(label.trim());
}

export function isVerifiedBadgeTag(tag: { slug: string; icon?: string | null }): boolean {
  return tag.slug === PISS_SWALLOW_VERIFIED_SLUG || tag.icon === GOLDEN_DROP_ICON;
}
