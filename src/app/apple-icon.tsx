import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { readFile } from "fs/promises";
import { join } from "path";
import { getSiteByDomain, isAdminHost, PRIMARY_DOMAIN, ADMIN_BASE_DOMAIN } from "@/lib/site";
import { faviconCanvasStyle, FAVICON_BG, GoldenDropFavicon } from "@/lib/favicon-mark";

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

  let inner: React.ReactNode;
  if (logoKey === "fbb-mark") {
    const buf = await readFile(join(process.cwd(), "public/brand/fbbtube-mark.png"));
    const src = `data:image/png;base64,${buf.toString("base64")}`;
    inner = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={168} height={168} alt="" style={{ objectFit: "cover" }} />
    );
  } else if (logoKey === "sharlila-mark") {
    inner = (
      <svg width="100" height="100" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="12" stroke={color} strokeWidth="2" />
        <circle cx="16" cy="12" r="2.5" fill={color} />
      </svg>
    );
  } else {
    inner = <GoldenDropFavicon width={142} height={178} gradId="pisster-apple" />;
  }

  return new ImageResponse(
    (
      <div
        style={{
          ...faviconCanvasStyle(),
          background:
            logoKey === "fbb-mark" || logoKey === "golden-drop"
              ? FAVICON_BG
              : "linear-gradient(145deg, #18181b 0%, #09090b 100%)",
          borderRadius: logoKey === "sharlila-mark" ? 36 : 0,
        }}
      >
        {inner}
      </div>
    ),
    { ...size },
  );
}
