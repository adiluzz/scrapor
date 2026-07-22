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
      <p className="mb-4 text-sm text-zinc-500">
        Zone setup checklist: see{" "}
        <code className="text-zinc-400">docs/ADS_PUBLISHER_SETUP.md</code> in the repo.
      </p>
      <WebsiteAdsForm
        siteId={site.id}
        initial={{
          vastTagUrl: site.vastTagUrl,
          vastTagUrlBackup: site.vastTagUrlBackup,
          hilltopAdsSiteVerification: site.hilltopAdsSiteVerification,
          adSkipSeconds: site.adSkipSeconds,
          adMinViewSeconds: site.adMinViewSeconds,
          adTimeoutMs: site.adTimeoutMs,
          exoInsClass: site.exoInsClass,
          exoZoneHome: site.exoZoneHome,
          exoZoneUnderPlayer: site.exoZoneUnderPlayer,
          exoZoneVideoFullscreen: site.exoZoneVideoFullscreen,
          exoZoneGridNative: site.exoZoneGridNative,
          exoZoneMobileSticky: site.exoZoneMobileSticky,
          exoZonePopunder: site.exoZonePopunder,
          exoZoneMidList: site.exoZoneMidList,
          exoZoneInvideo: site.exoZoneInvideo,
          juicyAdsSiteId: site.juicyAdsSiteId,
          juicyAdsZoneBanner: site.juicyAdsZoneBanner,
          juicyAdsZoneNative: site.juicyAdsZoneNative,
          juicyAdsZoneVidfloat: site.juicyAdsZoneVidfloat,
          juicyAdsZoneInvideo: site.juicyAdsZoneInvideo,
          stripchatWidgetId: site.stripchatWidgetId,
          stripchatAffiliateUrl: site.stripchatAffiliateUrl,
          adsPopunderEnabled: site.adsPopunderEnabled,
          adsJuicyEnabled: site.adsJuicyEnabled,
          adsCamWidgetEnabled: site.adsCamWidgetEnabled,
        }}
      />
    </div>
  );
}
