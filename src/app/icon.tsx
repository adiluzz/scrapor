import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { getSiteByDomain, isAdminHost, PRIMARY_DOMAIN, ADMIN_BASE_DOMAIN } from "@/lib/site";

export const size = { width: 48, height: 48 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

async function resolveLogoKey(): Promise<{ logoKey: string; color: string }> {
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

/** Browser tab favicon — site mark on dark background. */
export default async function Icon() {
  const { logoKey, color } = await resolveLogoKey();

  if (logoKey === "fbb-mark") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#09090b",
            borderRadius: 6,
          }}
        >
          <svg width="34" height="40" viewBox="0 0 40 48" fill="none">
            <ellipse cx="12" cy="14" rx="7.5" ry="6.5" fill={color} />
            <ellipse cx="28" cy="14" rx="7.5" ry="6.5" fill={color} />
            <path
              d="M8 16 C8 16 10 44 20 46 C30 44 32 16 32 16 C28 22 12 22 8 16Z"
              fill={color}
            />
            <rect x="14" y="22" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.35" />
            <rect x="21" y="22" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.35" />
            <rect x="14" y="28" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.35" />
            <rect x="21" y="28" width="5" height="4.5" rx="1" fill="#0F172A" fillOpacity="0.35" />
          </svg>
        </div>
      ),
      { ...size },
    );
  }

  if (logoKey === "sharlila-mark") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#09090b",
            borderRadius: 6,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="12" stroke={color} strokeWidth="2" />
            <circle cx="16" cy="12" r="2.5" fill={color} />
          </svg>
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          borderRadius: 6,
        }}
      >
        <svg width="30" height="36" viewBox="0 0 32 40" fill="none">
          <defs>
            <linearGradient id="g" x1="16" y1="2" x2="16" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F5E6A3" />
              <stop offset="45%" stopColor="#E8C547" />
              <stop offset="100%" stopColor="#C9A227" />
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
