import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { pornstarImageUrl } from "@/lib/pornstar-image";
import { isTpdbConfigured } from "@/lib/theporndb";
import { pornstarSiteVideoCounts } from "@/lib/pornstar-sites";
import AdminPornstars from "@/components/admin/AdminPornstars";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminPornstarsPage() {
  await requireAdmin();

  const [stars, total] = await Promise.all([
    prisma.pornstar.findMany({
      orderBy: [{ videos: { _count: "desc" } }, { name: "asc" }],
      include: {
        _count: { select: { videos: true } },
        site: { select: { id: true, name: true, slug: true } },
      },
      take: PAGE_SIZE,
    }),
    prisma.pornstar.count(),
  ]);

  const siteCounts = await pornstarSiteVideoCounts(stars.map((s) => s.id));

  const initialPornstars = stars.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    videoCount: s._count.videos,
    siteCounts: siteCounts.get(s.id) ?? [],
    storageSite: s.site,
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
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          Pornstars <span className="text-base font-normal text-zinc-500">({total})</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          All pornstars across the network. Per-site counts reflect videos published on each
          website. Upload portraits or fetch profile data from{" "}
          <a
            href="https://theporndb.net"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 hover:underline"
          >
            ThePornDB
          </a>
          .
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
        initialTotal={total}
        pageSize={PAGE_SIZE}
        tpdbConfigured={isTpdbConfigured()}
      />
    </div>
  );
}
