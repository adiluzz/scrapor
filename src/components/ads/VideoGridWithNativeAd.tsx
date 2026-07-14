import AdZone from "@/components/ads/AdZone";
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
 * Video grid with in-feed Exo mid banner + card-sized Exo/Juicy tiles mixed
 * among video previews.
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
  // Prefer native for in-grid card footprint; banner zone works as fill fallback.
  const juicyTileZone = site.juicyAdsZoneNative || site.juicyAdsZoneBanner;

  // Card-sized ad tiles at overall positions ~4 (Exo) and ~6 (Juicy).
  const tileZone = site.exoZoneGridNative;
  const firstTilePositions = [4].filter((p) => p <= first.length);
  const secondTilePositions = [12 - splitAt].filter((p) => p >= 1 && p <= rest.length);
  const firstJuicyPositions = juicyOn && juicyTileZone ? [6].filter((p) => p <= first.length) : [];
  const secondJuicyPositions =
    juicyOn && juicyTileZone && firstJuicyPositions.length === 0
      ? [Math.min(2, rest.length)].filter((p) => p >= 1)
      : [];

  return (
    <>
      <VideoGrid
        videos={first}
        adTileZoneId={tileZone}
        adTileInsClass={site.exoInsClass}
        adTilePositions={firstTilePositions}
        juicyTileZoneId={juicyTileZone}
        juicyTileEnabled={juicyOn}
        juicyTilePositions={firstJuicyPositions}
      />
      {showMid && (
        <div className="ad-slot my-5">
          <AdZone zoneId={midZone} insClass={site.exoInsClass} minHeight={90} />
        </div>
      )}
      {rest.length > 0 && (
        <VideoGrid
          videos={rest}
          adTileZoneId={tileZone}
          adTileInsClass={site.exoInsClass}
          adTilePositions={secondTilePositions}
          juicyTileZoneId={juicyTileZone}
          juicyTileEnabled={juicyOn && firstJuicyPositions.length === 0}
          juicyTilePositions={secondJuicyPositions}
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
