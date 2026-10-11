import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { serializeAdminTalent } from "@/lib/studio-talent-admin";
import AdminTalentList from "@/components/admin/AdminTalentList";

export const dynamic = "force-dynamic";

export default async function AdminTalentPage() {
  await requireAdmin();

  const [talents, studioSites] = await Promise.all([
    prisma.studioTalent.findMany({
      include: {
        media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        site: { select: { id: true, name: true, domain: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.site.findMany({
      where: { kind: "STUDIO" },
      select: { id: true, name: true, domain: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Talent <span className="text-base font-normal text-zinc-500">({talents.length})</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Studio roster for Sharlila and other production sites. Set the main portrait, add
            gallery stills and videos, and edit every public field.
          </p>
        </div>
        <Link
          href="/admin/talent/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          Add talent
        </Link>
      </div>
      <AdminTalentList
        initialTalents={talents.map(serializeAdminTalent)}
        studioSites={studioSites}
      />
    </div>
  );
}
