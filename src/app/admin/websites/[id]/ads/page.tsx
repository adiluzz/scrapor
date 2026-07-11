import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import WebsiteAdsForm from "@/components/admin/WebsiteAdsForm";
import WebsiteSubnav from "@/components/admin/WebsiteSubnav";

export const dynamic = "force-dynamic";

export default async function WebsiteAdsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/websites" className="text-sm text-zinc-500 hover:text-white">
        ← Websites
      </Link>
      <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">Ads · {site.name}</h1>
      <WebsiteSubnav siteId={site.id} active="ads" />
      <WebsiteAdsForm
        siteId={site.id}
        initial={{
          vastTagUrl: site.vastTagUrl,
          adSkipSeconds: site.adSkipSeconds,
          adMinViewSeconds: site.adMinViewSeconds,
          adTimeoutMs: site.adTimeoutMs,
          exoInsClass: site.exoInsClass,
          exoZoneHome: site.exoZoneHome,
          exoZoneUnderPlayer: site.exoZoneUnderPlayer,
          exoZoneVideoFullscreen: site.exoZoneVideoFullscreen,
        }}
      />
    </div>
  );
}
