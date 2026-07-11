import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { getSiteByDomain, isAdminHost, PRIMARY_DOMAIN, ADMIN_BASE_DOMAIN } from "@/lib/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

async function resolveBrand(): Promise<{ logoKey: string; color: string }> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || PRIMARY_DOMAIN;
    if (isAdminHost(host)) {
      const site = await getSiteByDomain(ADMIN_BASE_DOMAIN);
      return { logoKey: site.logoKey || "sharlila-mark", color: site.primaryColor };
    }
    const site = await getSiteByDomain(host);
    return { logoKey: site.logoKey || "golden-drop", color: site.primaryColor };
  } catch {
    return { logoKey: "golden-drop", color: "#D4AF37" };
  }
}

export default async function AppleIcon() {
  const { logoKey, color } = await resolveBrand();

  const inner =
    logoKey === "fbb-mark" ? (
      <svg width="100" height="120" viewBox="0 0 40 48" fill="none">
        <ellipse cx="12" cy="14" rx="7.5" ry="6.5" fill={color} />
        <ellipse cx="28" cy="14" rx="7.5" ry="6.5" fill={color} />
        <path
          d="M8 16 C8 16 10 44 20 46 C30 44 32 16 32 16 C28 22 12 22 8 16Z"
          fill={color}
        />
      </svg>
    ) : logoKey === "sharlila-mark" ? (
      <svg width="100" height="100" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="12" stroke={color} strokeWidth="2" />
        <circle cx="16" cy="12" r="2.5" fill={color} />
      </svg>
    ) : (
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
    );

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
        {inner}
      </div>
    ),
    { ...size },
  );
}
