import type { StudioTalent, StudioTalentMedia } from "@prisma/client";
import {
  parseTalentLanguages,
  talentMediaUrl,
  talentPhotoUrl,
  toPublicRegion,
} from "@/lib/studio-talent";

export function serializeAdminTalent(
  talent: StudioTalent & { media?: StudioTalentMedia[]; site?: { id: string; name: string; domain: string } }
) {
  const media = talent.media ?? [];
  return {
    id: talent.id,
    siteId: talent.siteId,
    site: talent.site ?? null,
    name: talent.name,
    slug: talent.slug,
    role: talent.role,
    region: toPublicRegion(talent.region),
    origin: talent.origin,
    basedIn: talent.basedIn,
    languages: parseTalentLanguages(talent.languages),
    signed: talent.signed ?? "",
    featured: talent.featured,
    published: talent.published,
    sortOrder: talent.sortOrder,
    tagline: talent.tagline ?? "",
    bio: talent.bio ?? "",
    grade: talent.grade ?? "",
    photoUrl: talentPhotoUrl(talent) || null,
    hasPhoto: Boolean(talent.photoKey || talent.photoPath),
    images: media
      .filter((item) => item.kind === "IMAGE")
      .map((item) => ({
        id: item.id,
        url: talentMediaUrl(talent.id, item.id),
        title: item.title,
        sortOrder: item.sortOrder,
      })),
    videos: media
      .filter((item) => item.kind === "VIDEO")
      .map((item) => ({
        id: item.id,
        url: talentMediaUrl(talent.id, item.id),
        title: item.title,
        sortOrder: item.sortOrder,
      })),
    createdAt: talent.createdAt.toISOString(),
    updatedAt: talent.updatedAt.toISOString(),
  };
}
