"use client";

import AdZone from "@/components/ads/AdZone";
import VideoGrid from "@/components/site/VideoGrid";
import type { VideoCardData } from "@/lib/queries";

type SiteAds = {
  exoInsClass?: string | null;
  exoZoneGridNative?: string | null;
  exoZoneMidList?: string | null;
  exoZoneUnderPlayer?: string | null;
  juicyAdsZoneNative?: string | null;
  juicyAdsZoneBanner?: string | null;
  juicyAdsZoneMid?: string | null;
  adsJuicyEnabled?: boolean;
};

/** One mid-feed banner. A dedicated zone is required so the in-grid tile is not requested again. */
function MidBannerRow({
  midZone,
  juicyBanner,
  juicyOn,
  insClass,
}: {
  midZone: string;
  juicyBanner?: string | null;
  juicyOn: boolean;
  insClass?: string | null;
}) {
  return (
    <div className="my-1 flex w-full justify-center">
      <AdZone
        zoneId={midZone}
        insClass={insClass}
        minHeight={90}
        label
        juicyFallbackZoneId={juicyBanner}
        juicyEnabled={juicyOn && Boolean(juicyBanner)}
        placement="mid_feed"
      />
    </div>
  );
}

/**
 * Video grid with one optional mid-feed banner and card-sized Exo/Juicy tiles.
 */
export default function VideoGridWithNativeAd({
  videos,
  site,
  showMid = true,
}: {
  videos: VideoCardData[];
  site: SiteAds;
  /** Related grids already sit beside a sidebar, so they keep the tile only. */
  showMid?: boolean;
}) {
  const midZone = showMid ? site.exoZoneMidList : null;
  const showMidRow = Boolean(midZone) && videos.length >= 6;
  const juicyOn = site.adsJuicyEnabled !== false;
  const juicyTileZone = site.juicyAdsZoneNative;
  const tileZone = site.exoZoneGridNative;

  const midBanner =
    showMidRow && midZone ? (
      <MidBannerRow
        midZone={midZone}
        juicyBanner={site.juicyAdsZoneMid}
        juicyOn={juicyOn}
        insClass={site.exoInsClass}
      />
    ) : null;

  return (
    <VideoGrid
      videos={videos}
      adTileZoneId={tileZone}
      adTileInsClass={site.exoInsClass}
      juicyTileZoneId={juicyTileZone}
      juicyTileEnabled={juicyOn}
      midBanner={midBanner}
      midAfterRows={2}
    />
  );
}
