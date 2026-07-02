import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import AdminCreators from "@/components/admin/AdminCreators";

export const dynamic = "force-dynamic";

export default async function AdminCreatorsPage() {
  const user = await requireAdmin();
  const creators = await prisma.creatorProfile.findMany({
    where: { siteId: user.siteId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } }, _count: { select: { videos: true } } },
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-white sm:text-2xl">Creators</h1>
      <AdminCreators creators={creators} />
    </div>
  );
}
