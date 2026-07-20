import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { readFile } from "fs/promises";
import { join } from "path";
import { getSiteByDomain, isAdminHost, PRIMARY_DOMAIN, ADMIN_BASE_DOMAIN } from "@/lib/site";
import { faviconCanvasStyle, GoldenDropFavicon } from "@/lib/favicon-mark";

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
    const buf = await readFile(join(process.cwd(), "public/brand/fbbtube-mark.png"));
    const src = `data:image/png;base64,${buf.toString("base64")}`;
    return new ImageResponse(
      (
        <div style={faviconCanvasStyle()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} width={48} height={48} alt="" style={{ objectFit: "cover" }} />
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
      <div style={faviconCanvasStyle()}>
        <GoldenDropFavicon width={42} height={52} gradId="pisster-favicon" />
      </div>
    ),
    { ...size },
  );
}
