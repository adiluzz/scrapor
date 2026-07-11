import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { pornstarImageUrl } from "@/lib/pornstar-image";
import { isTpdbConfigured } from "@/lib/theporndb";
import { toCard } from "@/lib/queries";
import { pornstarSiteVideoCounts } from "@/lib/pornstar-sites";
import AdminPornstarDetail from "@/components/admin/AdminPornstarDetail";

export const dynamic = "force-dynamic";

export default async function AdminPornstarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug: idOrSlug } = await params;

  // Prefer id (stable across sites); fall back to slug for old bookmarks.
  const star =
    (await prisma.pornstar.findUnique({
      where: { id: idOrSlug },
      include: {
        _count: { select: { videos: true } },
        site: { select: { id: true, name: true, slug: true } },
      },
    })) ??
    (await prisma.pornstar.findFirst({
      where: { slug: idOrSlug },
      include: {
        _count: { select: { videos: true } },
        site: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { name: "asc" },
    }));
  if (!star) notFound();

  const videoRows = await prisma.video.findMany({
    where: { pornstars: { some: { pornstarId: star.id } } },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      pornstars: { include: { pornstar: true }, take: 3 },
      sites: {
        include: {
          site: { select: { id: true, name: true, slug: true, primaryColor: true } },
        },
      },
    },
  });

  const [cards, siteCountsMap] = await Promise.all([
    Promise.all(videoRows.map(async (v) => ({ ...(await toCard(v)), linkId: v.id }))),
    pornstarSiteVideoCounts([star.id]),
  ]);

  const videosWithSites = videoRows.map((v, i) => ({
    ...cards[i],
    sites: v.sites.map((m) => m.site),
  }));

  const initialPornstar = {
    id: star.id,
    name: star.name,
    slug: star.slug,
    bio: star.bio,
    videoCount: star._count.videos,
    siteCounts: siteCountsMap.get(star.id) ?? [],
    storageSite: star.site,
    hasImage: Boolean(star.s3Image),
    imageUrl: pornstarImageUrl(star),
    tpdbId: star.tpdbId,
    tpdbSyncedAt: star.tpdbSyncedAt?.toISOString() ?? null,
    gender: star.gender,
    country: star.country,
    ethnicity: star.ethnicity,
    birthDate: star.birthDate,
    heightCm: star.heightCm,
    measurements: star.measurements,
    aliases: star.aliases,
    disambiguation: star.disambiguation,
    deathDate: star.deathDate,
    eyeColor: star.eyeColor,
    hairColor: star.hairColor,
    breastType: star.breastType,
    careerStartYear: star.careerStartYear,
    careerEndYear: star.careerEndYear,
    tattoos: star.tattoos,
    piercings: star.piercings,
    urls: star.urls,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pornstars" className="text-sm text-zinc-500 hover:text-white">
          ← Pornstars
        </Link>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">{star.name}</h1>
      </div>

      <AdminPornstarDetail
        initialPornstar={initialPornstar}
        initialVideos={videosWithSites}
        tpdbConfigured={isTpdbConfigured()}
      />
    </div>
  );
}
