import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { pornstarImageUrl } from "@/lib/pornstar-image";
import { slugify } from "@/lib/slug";

function serializePornstar(star: {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  s3Image: string | null;
  tpdbId: string | null;
  disambiguation: string | null;
  aliases: string | null;
  gender: string | null;
  birthDate: string | null;
  deathDate: string | null;
  ethnicity: string | null;
  country: string | null;
  eyeColor: string | null;
  hairColor: string | null;
  heightCm: number | null;
  measurements: string | null;
  breastType: string | null;
  careerStartYear: number | null;
  careerEndYear: number | null;
  tattoos: string | null;
  piercings: string | null;
  urls: string | null;
  tpdbSyncedAt: Date | null;
  _count?: { videos: number };
}) {
  return {
    id: star.id,
    name: star.name,
    slug: star.slug,
    bio: star.bio,
    tpdbId: star.tpdbId,
    disambiguation: star.disambiguation,
    aliases: star.aliases,
    gender: star.gender,
    birthDate: star.birthDate,
    deathDate: star.deathDate,
    ethnicity: star.ethnicity,
    country: star.country,
    eyeColor: star.eyeColor,
    hairColor: star.hairColor,
    heightCm: star.heightCm,
    measurements: star.measurements,
    breastType: star.breastType,
    careerStartYear: star.careerStartYear,
    careerEndYear: star.careerEndYear,
    tattoos: star.tattoos,
    piercings: star.piercings,
    urls: star.urls,
    tpdbSyncedAt: star.tpdbSyncedAt?.toISOString() ?? null,
    videoCount: star._count?.videos ?? 0,
    hasImage: Boolean(star.s3Image),
    imageUrl: pornstarImageUrl(star),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const star = await prisma.pornstar.findUnique({
    where: { id },
    include: { _count: { select: { videos: true } } },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ pornstar: serializePornstar(star) });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  bio: z.string().max(8000).nullable().optional(),
  disambiguation: z.string().max(400).nullable().optional(),
  aliases: z.string().max(4000).nullable().optional(),
  gender: z.string().max(80).nullable().optional(),
  birthDate: z.string().max(40).nullable().optional(),
  deathDate: z.string().max(40).nullable().optional(),
  ethnicity: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  eyeColor: z.string().max(80).nullable().optional(),
  hairColor: z.string().max(80).nullable().optional(),
  heightCm: z.number().int().min(0).max(300).nullable().optional(),
  measurements: z.string().max(500).nullable().optional(),
  breastType: z.string().max(80).nullable().optional(),
  careerStartYear: z.number().int().min(1900).max(2100).nullable().optional(),
  careerEndYear: z.number().int().min(1900).max(2100).nullable().optional(),
  tattoos: z.string().max(4000).nullable().optional(),
  piercings: z.string().max(4000).nullable().optional(),
  urls: z.string().max(8000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const star = await prisma.pornstar.findUnique({ where: { id } });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  let slug = d.slug;
  if (d.name && !slug) slug = slugify(d.name);
  if (slug && slug !== star.slug) {
    const clash = await prisma.pornstar.findUnique({
      where: { siteId_slug: { siteId: star.siteId, slug } },
    });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }
  }

  const updated = await prisma.pornstar.update({
    where: { id },
    data: {
      name: d.name ?? undefined,
      slug: slug ?? undefined,
      bio: d.bio === undefined ? undefined : d.bio,
      disambiguation: d.disambiguation === undefined ? undefined : d.disambiguation,
      aliases: d.aliases === undefined ? undefined : d.aliases,
      gender: d.gender === undefined ? undefined : d.gender,
      birthDate: d.birthDate === undefined ? undefined : d.birthDate,
      deathDate: d.deathDate === undefined ? undefined : d.deathDate,
      ethnicity: d.ethnicity === undefined ? undefined : d.ethnicity,
      country: d.country === undefined ? undefined : d.country,
      eyeColor: d.eyeColor === undefined ? undefined : d.eyeColor,
      hairColor: d.hairColor === undefined ? undefined : d.hairColor,
      heightCm: d.heightCm === undefined ? undefined : d.heightCm,
      measurements: d.measurements === undefined ? undefined : d.measurements,
      breastType: d.breastType === undefined ? undefined : d.breastType,
      careerStartYear: d.careerStartYear === undefined ? undefined : d.careerStartYear,
      careerEndYear: d.careerEndYear === undefined ? undefined : d.careerEndYear,
      tattoos: d.tattoos === undefined ? undefined : d.tattoos,
      piercings: d.piercings === undefined ? undefined : d.piercings,
      urls: d.urls === undefined ? undefined : d.urls,
    },
    include: { _count: { select: { videos: true } } },
  });

  return NextResponse.json({ ok: true, pornstar: serializePornstar(updated) });
}
