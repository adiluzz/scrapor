import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { pornstarImageUrl } from "@/lib/pornstar-image";
import { hasTpdbProfile } from "@/lib/pornstar-profile";
import { pornstarSiteVideoCounts } from "@/lib/pornstar-sites";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

type DataFilter = "all" | "with" | "without";

function parseDataFilter(raw: string | null): DataFilter {
  if (raw === "with" || raw === "without") return raw;
  return "all";
}

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const dataFilter = parseDataFilter(url.searchParams.get("data"));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const tpdbDataWhere =
    dataFilter === "with"
      ? { OR: [{ tpdbId: { not: null } }, { tpdbSyncedAt: { not: null } }] }
      : dataFilter === "without"
        ? { AND: [{ tpdbId: null }, { tpdbSyncedAt: null }] }
        : {};

  const where = {
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...tpdbDataWhere,
  };

  const [stars, total] = await Promise.all([
    prisma.pornstar.findMany({
      where,
      orderBy: [{ videos: { _count: "desc" } }, { name: "asc" }],
      include: {
        _count: { select: { videos: true } },
        site: { select: { id: true, name: true, slug: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.pornstar.count({ where }),
  ]);

  const siteCounts = await pornstarSiteVideoCounts(stars.map((s) => s.id));

  return NextResponse.json({
    total,
    page,
    limit,
    data: dataFilter,
    pornstars: stars.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      bio: s.bio,
      tpdbId: s.tpdbId,
      disambiguation: s.disambiguation,
      aliases: s.aliases,
      gender: s.gender,
      birthDate: s.birthDate,
      deathDate: s.deathDate,
      ethnicity: s.ethnicity,
      country: s.country,
      eyeColor: s.eyeColor,
      hairColor: s.hairColor,
      heightCm: s.heightCm,
      measurements: s.measurements,
      breastType: s.breastType,
      careerStartYear: s.careerStartYear,
      careerEndYear: s.careerEndYear,
      tattoos: s.tattoos,
      piercings: s.piercings,
      urls: s.urls,
      tpdbSyncedAt: s.tpdbSyncedAt?.toISOString() ?? null,
      hasTpdbData: hasTpdbProfile(s),
      videoCount: s._count.videos,
      siteCounts: siteCounts.get(s.id) ?? [],
      storageSite: s.site,
      hasImage: Boolean(s.s3Image),
      imageUrl: pornstarImageUrl(s),
    })),
  });
}
