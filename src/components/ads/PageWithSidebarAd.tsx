import type { ReactNode } from "react";
import AdZone from "@/components/ads/AdZone";

type SidebarSite = {
  exoInsClass?: string | null;
  exoZoneHome?: string | null;
  juicyAdsZoneBanner?: string | null;
  adsJuicyEnabled?: boolean;
};

/**
 * Home-style sidebar on pages that are a separate view from the homepage,
 * so the home zone can be requested again without colliding on one page.
 */
export default function PageWithSidebarAd({
  site,
  children,
}: {
  site: SidebarSite;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
      <aside className="lg:order-2 lg:w-[300px] lg:shrink-0">
        <div className="lg:sticky lg:top-20">
          <AdZone
            zoneId={site.exoZoneHome ?? undefined}
            insClass={site.exoInsClass}
            juicyFallbackZoneId={site.juicyAdsZoneBanner}
            juicyEnabled={site.adsJuicyEnabled}
            placement="landing_sidebar"
          />
        </div>
      </aside>
      <div className="min-w-0 flex-1 lg:order-1">{children}</div>
    </div>
  );
}
