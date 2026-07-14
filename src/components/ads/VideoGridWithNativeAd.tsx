"use client";

import AdZone from "@/components/ads/AdZone";
import JuicyAdZone from "@/components/ads/JuicyAdZone";
import VideoGrid from "@/components/site/VideoGrid";
import type { VideoCardData } from "@/lib/queries";

type SiteAds = {
  exoInsClass?: string | null;
  exoZoneGridNative?: string | null;
  exoZoneMidList?: string | null;
  juicyAdsZoneNative?: string | null;
  juicyAdsZoneBanner?: string | null;
  adsJuicyEnabled?: boolean;
};

/**
 * Mid-feed strip: three side-by-side banners (Exo mid / Exo grid / Juicy banner
 * when available; otherwise the mid zone is reused so the row stays full).
 */
function MidBannerRow({
  midZone,
  secondaryExo,
  juicyBanner,
  juicyOn,
  insClass,
}: {
  midZone: string;
  secondaryExo?: string | null;
  juicyBanner?: string | null;
  juicyOn: boolean;
  insClass?: string | null;
}) {
  const exoB = secondaryExo && secondaryExo !== midZone ? secondaryExo : midZone;
  const useJuicy = Boolean(juicyOn && juicyBanner);

  return (
    <div className="my-1 w-full">
      <p className="mb-2 text-center text-[10px] uppercase tracking-wide text-zinc-600">
        Advertisement
      </p>
      <div className="grid grid-cols-1 items-start justify-items-center gap-3 sm:grid-cols-3">
        <AdZone zoneId={midZone} insClass={insClass} minHeight={90} label={false} />
        <AdZone zoneId={exoB} insClass={insClass} minHeight={90} label={false} />
        {useJuicy ? (
          <JuicyAdZone
            zoneId={juicyBanner}
            enabled={juicyOn}
            label={false}
            width={300}
            height={250}
          />
        ) : (
          <AdZone zoneId={midZone} insClass={insClass} minHeight={90} label={false} />
        )}
      </div>
    </div>
  );
}

/**
 * Video grid with in-feed 3-banner mid row + card-sized Exo/Juicy tiles.
 * Mid banners insert only after a complete video row (measured client-side).
 */
export default function VideoGridWithNativeAd({
  videos,
  site,
}: {
  videos: VideoCardData[];
  site: SiteAds;
}) {
  const midZone = site.exoZoneMidList || site.exoZoneGridNative;
  const showMid = Boolean(midZone) && videos.length >= 6;
  const juicyOn = site.adsJuicyEnabled !== false;
  // Dedicated in-grid Juicy zone only (300×250 banner). Do not reuse the
  // sidebar/sticky banner ID — Juicy zone IDs must be unique on the page.
  const juicyTileZone = site.juicyAdsZoneNative;
  const tileZone = site.exoZoneGridNative;

  const midBanner =
    showMid && midZone ? (
      <MidBannerRow
        midZone={midZone}
        secondaryExo={
          site.exoZoneMidList && site.exoZoneGridNative
            ? site.exoZoneGridNative
            : null
        }
        juicyBanner={site.juicyAdsZoneBanner}
        juicyOn={juicyOn}
        insClass={site.exoInsClass}
      />
    ) : null;

  return (
    <VideoGrid
      videos={videos}
      adTileZoneId={tileZone}
      adTileInsClass={site.exoInsClass}
      adTilePositions={tileZone ? [4] : []}
      juicyTileZoneId={juicyTileZone}
      juicyTileEnabled={juicyOn}
      juicyTilePositions={juicyOn && juicyTileZone ? [6] : []}
      midBanner={midBanner}
      midAfterRows={2}
    />
  );
}
