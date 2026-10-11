import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import AdminTalentCreate from "@/components/admin/AdminTalentCreate";

export const dynamic = "force-dynamic";

export default async function AdminNewTalentPage() {
  await requireAdmin();
  const studioSites = await prisma.site.findMany({
    where: { kind: "STUDIO" },
    select: { id: true, name: true, domain: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white sm:text-2xl">Add talent</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Create a roster entry, then upload a main image, gallery stills, and videos.
        </p>
      </div>
      <AdminTalentCreate studioSites={studioSites} />
    </div>
  );
}
