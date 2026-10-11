import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { serializeAdminTalent } from "@/lib/studio-talent-admin";
import AdminTalentEditor from "@/components/admin/AdminTalentEditor";

export const dynamic = "force-dynamic";

export default async function AdminTalentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const talent = await prisma.studioTalent.findUnique({
    where: { id },
    include: {
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      site: { select: { id: true, name: true, domain: true } },
    },
  });
  if (!talent) notFound();

  return <AdminTalentEditor initialTalent={serializeAdminTalent(talent)} />;
}
