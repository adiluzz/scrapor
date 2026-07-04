import type { Pornstar } from "@prisma/client";

export type PornstarUrl = { url: string; type: string };
export type PornstarBodyMod = { location: string; description?: string | null };
export type PornstarMeasurements = {
  band_size?: number | null;
  cup_size?: string | null;
  waist?: number | null;
  hip?: number | null;
  display?: string;
};

export type PornstarProfileData = Pick<
  Pornstar,
  | "disambiguation"
  | "aliases"
  | "gender"
  | "birthDate"
  | "deathDate"
  | "ethnicity"
  | "country"
  | "eyeColor"
  | "hairColor"
  | "heightCm"
  | "measurements"
  | "breastType"
  | "careerStartYear"
  | "careerEndYear"
  | "tattoos"
  | "piercings"
  | "urls"
  | "tpdbId"
  | "tpdbSyncedAt"
>;

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parsePornstarAliases(raw: string | null | undefined): string[] {
  return parseJson<string[]>(raw) ?? [];
}

export function parsePornstarUrls(raw: string | null | undefined): PornstarUrl[] {
  return parseJson<PornstarUrl[]>(raw) ?? [];
}

export function parsePornstarBodyMods(raw: string | null | undefined): PornstarBodyMod[] {
  return parseJson<PornstarBodyMod[]>(raw) ?? [];
}

export function parsePornstarMeasurements(
  raw: string | null | undefined
): PornstarMeasurements | null {
  return parseJson<PornstarMeasurements>(raw);
}

export type PornstarProfileField = {
  label: string;
  value: string;
};

/** Build display rows for public/admin profile sections. */
export function pornstarProfileFields(
  star: Omit<PornstarProfileData, "tpdbId" | "tpdbSyncedAt">
): PornstarProfileField[] {
  const fields: PornstarProfileField[] = [];
  const aliases = parsePornstarAliases(star.aliases);
  const measurements = parsePornstarMeasurements(star.measurements);
  const tattoos = parsePornstarBodyMods(star.tattoos);
  const piercings = parsePornstarBodyMods(star.piercings);

  if (star.disambiguation) fields.push({ label: "Also known as", value: star.disambiguation });
  if (aliases.length) fields.push({ label: "Aliases", value: aliases.join(", ") });
  if (star.gender) fields.push({ label: "Gender", value: star.gender });
  if (star.birthDate) fields.push({ label: "Born", value: star.birthDate });
  if (star.deathDate) fields.push({ label: "Died", value: star.deathDate });
  if (star.ethnicity) fields.push({ label: "Ethnicity", value: star.ethnicity });
  if (star.country) fields.push({ label: "Country", value: star.country });
  if (star.eyeColor) fields.push({ label: "Eyes", value: star.eyeColor });
  if (star.hairColor) fields.push({ label: "Hair", value: star.hairColor });
  if (star.heightCm) fields.push({ label: "Height", value: `${star.heightCm} cm` });
  if (measurements?.display) fields.push({ label: "Measurements", value: measurements.display });
  if (star.breastType) fields.push({ label: "Breast type", value: star.breastType });
  if (star.careerStartYear || star.careerEndYear) {
    const end = star.careerEndYear ?? "present";
    const start = star.careerStartYear ?? "?";
    fields.push({ label: "Career", value: `${start} – ${end}` });
  }
  if (tattoos.length) {
    fields.push({
      label: "Tattoos",
      value: tattoos
        .map((t) => (t.description ? `${t.location} (${t.description})` : t.location))
        .join("; "),
    });
  }
  if (piercings.length) {
    fields.push({
      label: "Piercings",
      value: piercings
        .map((p) => (p.description ? `${p.location} (${p.description})` : p.location))
        .join("; "),
    });
  }

  return fields;
}

export function hasTpdbProfile(star: Pick<Pornstar, "tpdbId" | "tpdbSyncedAt">): boolean {
  return Boolean(star.tpdbId || star.tpdbSyncedAt);
}
