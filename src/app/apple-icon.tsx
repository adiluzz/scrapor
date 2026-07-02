import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #18181b 0%, #09090b 100%)",
          borderRadius: 36,
        }}
      >
        <svg width="100" height="120" viewBox="0 0 32 40" fill="none">
          <defs>
            <linearGradient id="g" x1="16" y1="2" x2="16" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F5E6A3" />
              <stop offset="45%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#9A7209" />
            </linearGradient>
          </defs>
          <path
            d="M16 3.5C16 3.5 6.5 18.5 6.5 26.5C6.5 32.47 10.75 37 16 37C21.25 37 25.5 32.47 25.5 26.5C25.5 18.5 16 3.5 16 3.5Z"
            fill="url(#g)"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
