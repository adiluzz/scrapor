/** Turn arbitrary text into a URL-safe slug. */
export function slugify(input: string): string {
  return (input || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Slug with a short random suffix to guarantee uniqueness within a site. */
export function slugifyUnique(input: string): string {
  const base = slugify(input) || "item";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

/** Normalize a search query for dedup: trim + lowercase + collapse whitespace. */
export function normalizeQuery(input: string): string {
  return (input || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}
