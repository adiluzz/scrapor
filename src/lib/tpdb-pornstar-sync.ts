import type { Prisma } from "@prisma/client";
import type { TpdbPerformer } from "@/lib/theporndb";

function jsonOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

function strOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function formatMeasurements(
  m: NonNullable<TpdbPerformer["measurements"]>
): string {
  const parts: string[] = [];
  if (m.band_size != null && m.cup_size) {
    parts.push(`${m.band_size}${m.cup_size}`);
  } else if (m.cup_size) {
    parts.push(m.cup_size);
  }
  if (m.waist != null) parts.push(String(m.waist));
  if (m.hip != null) parts.push(String(m.hip));
  return parts.join("-");
}

/** Map a ThePornDB performer record to Prisma Pornstar update fields. */
export function tpdbPerformerToPornstarData(
  performer: TpdbPerformer
): Prisma.PornstarUpdateInput {
  const measurements =
    performer.measurements != null
      ? {
          ...performer.measurements,
          display: formatMeasurements(performer.measurements),
        }
      : null;

  return {
    tpdbId: performer.id,
    disambiguation: strOrNull(performer.disambiguation),
    aliases: jsonOrNull(performer.aliases),
    gender: strOrNull(performer.gender),
    birthDate: strOrNull(performer.birth_date),
    deathDate: strOrNull(performer.death_date),
    ethnicity: strOrNull(performer.ethnicity),
    country: strOrNull(performer.country),
    eyeColor: strOrNull(performer.eye_color),
    hairColor: strOrNull(performer.hair_color),
    heightCm: performer.height ?? null,
    measurements: jsonOrNull(measurements),
    breastType: strOrNull(performer.breast_type),
    careerStartYear: performer.career_start_year ?? null,
    careerEndYear: performer.career_end_year ?? null,
    tattoos: jsonOrNull(performer.tattoos),
    piercings: jsonOrNull(performer.piercings),
    urls: jsonOrNull(performer.urls),
    tpdbSyncedAt: new Date(),
  };
}
