import AdZone from "@/components/ads/AdZone";
import JuicyAdZone from "@/components/ads/JuicyAdZone";
import VideoGrid from "@/components/site/VideoGrid";
import type { VideoCardData } from "@/lib/queries";

type SiteAds = {
  exoInsClass?: string | null;
  exoZoneGridNative?: string | null;
  exoZoneMidList?: string | null;
  juicyAdsZoneNative?: string | null;
  adsJuicyEnabled?: boolean;
};

/**
 * Video grid with an in-feed native ad after ~half the list (Exo + optional Juicy fill).
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
  const splitAt = showMid ? Math.min(8, Math.floor(videos.length / 2)) : videos.length;
  const first = videos.slice(0, splitAt);
  const rest = videos.slice(splitAt);
  const juicyOn = site.adsJuicyEnabled !== false;

  // Card-sized ad tiles at overall positions ~4 and ~12 (split across the two grids).
  const tileZone = site.exoZoneGridNative;
  const firstTilePositions = [4].filter((p) => p <= first.length);
  const secondTilePositions = [12 - splitAt].filter((p) => p >= 1 && p <= rest.length);

  return (
    <>
      <VideoGrid
        videos={first}
        adTileZoneId={tileZone}
        adTileInsClass={site.exoInsClass}
        adTilePositions={firstTilePositions}
      />
      {showMid && (
        <div className="ad-slot my-5 space-y-3">
          <AdZone zoneId={midZone} insClass={site.exoInsClass} minHeight={90} />
          {juicyOn && <JuicyAdZone zoneId={site.juicyAdsZoneNative} enabled />}
        </div>
      )}
      {rest.length > 0 && (
        <VideoGrid
          videos={rest}
          adTileZoneId={tileZone}
          adTileInsClass={site.exoInsClass}
          adTilePositions={secondTilePositions}
        />
      )}
      {!showMid && site.exoZoneGridNative && videos.length > 0 && (
        <div className="ad-slot mt-5">
          <AdZone zoneId={site.exoZoneGridNative} insClass={site.exoInsClass} minHeight={90} />
        </div>
      )}
    </>
  );
}
