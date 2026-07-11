import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import WebsiteIdentityForm from "@/components/admin/WebsiteIdentityForm";
import WebsiteSubnav from "@/components/admin/WebsiteSubnav";

export const dynamic = "force-dynamic";

export default async function EditWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/websites" className="text-sm text-zinc-500 hover:text-white">
        ← Websites
      </Link>
      <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">{site.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">{site.domain}</p>
      <WebsiteSubnav siteId={site.id} active="identity" />
      <WebsiteIdentityForm site={site} />
    </div>
  );
}
