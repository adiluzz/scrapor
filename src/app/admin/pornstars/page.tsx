import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { pornstarImageUrl } from "@/lib/pornstar-image";
import { isTpdbConfigured } from "@/lib/theporndb";
import AdminPornstars from "@/components/admin/AdminPornstars";

export const dynamic = "force-dynamic";

export default async function AdminPornstarsPage() {
  const user = await requireAdmin();

  const stars = await prisma.pornstar.findMany({
    where: { siteId: user.siteId },
    orderBy: [{ videos: { _count: "desc" } }, { name: "asc" }],
    include: { _count: { select: { videos: true } } },
    take: 100,
  });

  const initialPornstars = stars.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    videoCount: s._count.videos,
    hasImage: Boolean(s.s3Image),
    imageUrl: pornstarImageUrl(s),
    tpdbId: s.tpdbId,
    tpdbSyncedAt: s.tpdbSyncedAt?.toISOString() ?? null,
    gender: s.gender,
    country: s.country,
    ethnicity: s.ethnicity,
    birthDate: s.birthDate,
    heightCm: s.heightCm,
    measurements: s.measurements,
    aliases: s.aliases,
    disambiguation: s.disambiguation,
    deathDate: s.deathDate,
    eyeColor: s.eyeColor,
    hairColor: s.hairColor,
    breastType: s.breastType,
    careerStartYear: s.careerStartYear,
    careerEndYear: s.careerEndYear,
    tattoos: s.tattoos,
    piercings: s.piercings,
    urls: s.urls,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white sm:text-2xl">Pornstars</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Upload portrait images or fetch profile data and images from{" "}
          <a
            href="https://theporndb.net"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 hover:underline"
          >
            ThePornDB
          </a>{" "}
          (stash-box GraphQL API). Images and metadata appear on public pornstar pages.
        </p>
        {!isTpdbConfigured() && (
          <p className="mt-2 text-xs text-amber-500/90">
            TPDB auto-fetch is disabled until <code>TPDB_API_KEY</code> is set. Manual upload still
            works.
          </p>
        )}
      </div>

      <AdminPornstars
        initialPornstars={initialPornstars}
        tpdbConfigured={isTpdbConfigured()}
      />
    </div>
  );
}
