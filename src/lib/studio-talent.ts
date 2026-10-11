import type { Prisma, StudioTalent, StudioTalentMedia, StudioTalentMediaKind } from "@prisma/client";
import { prisma } from "@/lib/db";

export type StudioRegion = "israel" | "international";

export type StudioStarMedia = {
  id: string;
  url: string;
  title: string | null;
  kind: "image" | "video";
};

export type StudioStar = {
  id: string;
  slug: string;
  name: string;
  role: string;
  region: StudioRegion;
  origin: string;
  basedIn: string;
  languages: string[];
  signed: string;
  featured: boolean;
  photo: string;
  grade: string;
  tagline: string;
  bio: string[];
  images: StudioStarMedia[];
  videos: StudioStarMedia[];
};

const DEFAULT_GRADE = "linear-gradient(160deg, #2a2420 0%, #0a0908 70%)";

const talentWithMedia = {
  media: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.StudioTalentInclude;

export type StudioTalentRow = StudioTalent & { media: StudioTalentMedia[] };

export function parseTalentLanguages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    /* comma-separated fallback */
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeTalentLanguages(languages: string[]): string {
  return JSON.stringify(languages.map((item) => item.trim()).filter(Boolean));
}

export function splitTalentBio(bio: string | null | undefined): string[] {
  if (!bio?.trim()) return [];
  return bio
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinTalentBio(paragraphs: string[]): string {
  return paragraphs.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

export function slugifyTalentName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function talentPhotoUrl(talent: Pick<StudioTalent, "id" | "photoKey" | "photoPath">): string {
  if (talent.photoKey) return `/media/talent/${talent.id}/photo`;
  return talent.photoPath || "";
}

export function talentMediaUrl(talentId: string, mediaId: string): string {
  return `/media/talent/${talentId}/media/${mediaId}`;
}

export function toPublicRegion(region: StudioTalent["region"]): StudioRegion {
  return region === "ISRAEL" ? "israel" : "international";
}

export function toDbRegion(region: string | null | undefined): "ISRAEL" | "INTERNATIONAL" {
  return region === "israel" || region === "ISRAEL" ? "ISRAEL" : "INTERNATIONAL";
}

function toMediaKind(kind: StudioTalentMediaKind): "image" | "video" {
  return kind === "VIDEO" ? "video" : "image";
}

export function toStudioStar(talent: StudioTalentRow): StudioStar {
  const media = talent.media.map((item) => ({
    id: item.id,
    url: talentMediaUrl(talent.id, item.id),
    title: item.title,
    kind: toMediaKind(item.kind),
  }));
  return {
    id: talent.id,
    slug: talent.slug,
    name: talent.name,
    role: talent.role,
    region: toPublicRegion(talent.region),
    origin: talent.origin,
    basedIn: talent.basedIn,
    languages: parseTalentLanguages(talent.languages),
    signed: talent.signed || "",
    featured: talent.featured,
    photo: talentPhotoUrl(talent),
    grade: talent.grade || DEFAULT_GRADE,
    tagline: talent.tagline || "",
    bio: splitTalentBio(talent.bio),
    images: media.filter((item) => item.kind === "image"),
    videos: media.filter((item) => item.kind === "video"),
  };
}

export async function listStudioTeam(siteId: string): Promise<StudioStar[]> {
  const rows = await prisma.studioTalent.findMany({
    where: { siteId, published: true },
    include: talentWithMedia,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toStudioStar);
}

export async function listFeaturedStudioTeam(siteId: string): Promise<StudioStar[]> {
  const rows = await prisma.studioTalent.findMany({
    where: { siteId, published: true, featured: true },
    include: talentWithMedia,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toStudioStar);
}

export async function getStudioStar(siteId: string, slug: string): Promise<StudioStar | null> {
  const row = await prisma.studioTalent.findUnique({
    where: { siteId_slug: { siteId, slug } },
    include: talentWithMedia,
  });
  if (!row || !row.published) return null;
  return toStudioStar(row);
}

export async function listRelatedStudioTeam(
  siteId: string,
  slug: string,
  limit = 4
): Promise<StudioStar[]> {
  const current = await prisma.studioTalent.findUnique({
    where: { siteId_slug: { siteId, slug } },
    select: { region: true },
  });
  const rest = await prisma.studioTalent.findMany({
    where: { siteId, published: true, slug: { not: slug } },
    include: talentWithMedia,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (!current) return rest.slice(0, limit).map(toStudioStar);
  const same = rest.filter((row) => row.region === current.region);
  const others = rest.filter((row) => row.region !== current.region);
  return [...same, ...others].slice(0, limit).map(toStudioStar);
}

export function studioStarPath(slug: string): string {
  return `/team/${slug}`;
}

export function personJsonLd(baseUrl: string, siteName: string, star: StudioStar) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: star.name,
    url: `${baseUrl}${studioStarPath(star.slug)}`,
    image: star.photo ? `${baseUrl}${star.photo}` : undefined,
    jobTitle: star.role,
    description: star.tagline,
    nationality: star.origin,
    knowsLanguage: star.languages,
    worksFor: {
      "@type": "Organization",
      name: siteName,
      url: baseUrl,
    },
  };
}
