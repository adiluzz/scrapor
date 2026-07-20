/** Shared favicon canvas + marks for ImageResponse (Google-safe opaque black). */

export const FAVICON_BG = "#000000";

export const GOLDEN_DROP_PATH =
  "M16 3.5C16 3.5 6.5 18.5 6.5 26.5C6.5 32.47 10.75 37 16 37C21.25 37 25.5 32.47 25.5 26.5C25.5 18.5 16 3.5 16 3.5Z";

export function faviconCanvasStyle(): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: FAVICON_BG,
  };
}

export function GoldenDropFavicon({
  width,
  height,
  gradId = "g",
}: {
  width: number;
  height: number;
  gradId?: string;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 32 40" fill="none">
      <defs>
        <linearGradient id={gradId} x1="16" y1="2" x2="16" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5E6A3" />
          <stop offset="45%" stopColor="#E8C547" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
      </defs>
      <path d={GOLDEN_DROP_PATH} fill={`url(#${gradId})`} />
    </svg>
  );
}
