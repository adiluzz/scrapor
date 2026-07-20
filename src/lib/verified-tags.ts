/** Verified content badge tags (AI-reviewed or admin-applied). */

export const GOLDEN_DROP_ICON = "golden-drop";
export const FBB_MARK_ICON = "fbb-mark";

export const PISS_SWALLOW_VERIFIED_SLUG = "piss-swallow";
export const PISS_SWALLOW_VERIFIED_NAME = "piss swallow";
/** Pornstar profile badge when any of their videos has the verified piss swallow tag. */
export const PISS_SWALLOWER_PORNSTAR_LABEL = "piss swallower";

export const FBB_FUCK_VERIFIED_SLUG = "fbb-fuck";
export const FBB_FUCK_VERIFIED_NAME = "fbb fuck";

export const FBB_GANGBANG_VERIFIED_SLUG = "fbb-gangbang";
export const FBB_GANGBANG_VERIFIED_NAME = "fbb gangbang";

export type VerifiedTagDefinition = {
  slug: string;
  name: string;
  icon: string;
  /** When set, tag is seeded only for this site domain. */
  siteDomain?: string;
};

/** Canonical registry — slug, display name, badge icon. */
export const VERIFIED_TAG_DEFINITIONS: VerifiedTagDefinition[] = [
  {
    slug: PISS_SWALLOW_VERIFIED_SLUG,
    name: PISS_SWALLOW_VERIFIED_NAME,
    icon: GOLDEN_DROP_ICON,
  },
  {
    slug: FBB_FUCK_VERIFIED_SLUG,
    name: FBB_FUCK_VERIFIED_NAME,
    icon: FBB_MARK_ICON,
    siteDomain: "fbbtube.com",
  },
  {
    slug: FBB_GANGBANG_VERIFIED_SLUG,
    name: FBB_GANGBANG_VERIFIED_NAME,
    icon: FBB_MARK_ICON,
    siteDomain: "fbbtube.com",
  },
];

const BY_SLUG = new Map(VERIFIED_TAG_DEFINITIONS.map((d) => [d.slug, d]));
const VERIFIED_ICONS = new Set(VERIFIED_TAG_DEFINITIONS.map((d) => d.icon));

const SWALLOW_LABEL_RE = /piss\s*swallow/i;

export function getVerifiedTagDefinition(slug: string): VerifiedTagDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function verifiedTagDefinitionsForSite(domain: string): VerifiedTagDefinition[] {
  return VERIFIED_TAG_DEFINITIONS.filter((d) => !d.siteDomain || d.siteDomain === domain);
}

/** Union of verified tags applicable to any of the given site domains. */
export function verifiedTagDefinitionsForDomains(domains: string[]): VerifiedTagDefinition[] {
  const seen = new Set<string>();
  const out: VerifiedTagDefinition[] = [];
  for (const domain of domains) {
    if (!domain) continue;
    for (const def of verifiedTagDefinitionsForSite(domain)) {
      if (seen.has(def.slug)) continue;
      seen.add(def.slug);
      out.push(def);
    }
  }
  return out.length > 0 ? out : VERIFIED_TAG_DEFINITIONS;
}

export function tagListIncludesVerifiedName(tags: string[], name: string): boolean {
  const want = name.trim().toLowerCase();
  return tags.some((t) => t.trim().toLowerCase() === want);
}

/** Add or remove a verified tag name from a comma-separated tag field. */
export function toggleVerifiedTagInList(tagsText: string, def: VerifiedTagDefinition): string {
  const parts = tagsText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const has = tagListIncludesVerifiedName(parts, def.name);
  const filtered = parts.filter((t) => t.trim().toLowerCase() !== def.name.toLowerCase());
  if (!has) filtered.unshift(def.name);
  return filtered.join(", ");
}

export function isPissSwallowVerificationLabel(label: string): boolean {
  return SWALLOW_LABEL_RE.test(label.trim());
}

/** Any tag row with a known verified badge icon. */
export function isVerifiedBadgeTag(tag: { slug: string; icon?: string | null }): boolean {
  if (tag.icon && VERIFIED_ICONS.has(tag.icon)) return true;
  return BY_SLUG.has(tag.slug);
}

export function verifiedBadgeTitle(tag: { slug: string; name: string }): string {
  const def = BY_SLUG.get(tag.slug);
  return def ? `Verified: ${def.name}` : `Verified: ${tag.name}`;
}
