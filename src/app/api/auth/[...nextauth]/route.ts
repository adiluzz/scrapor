import { NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Next standalone may expose request.url as http://0.0.0.0:3000/... (listen
 * address). Auth.js uses that origin for callback cookies and provider URLs,
 * which sends the browser to an unusable host after login.
 *
 * Rewrite the request URL to the public origin from proxy headers so multi-site
 * hosts (admin / pisster / fbb / sharlila) keep working without a single AUTH_URL.
 */
function withPublicUrl(req: NextRequest): NextRequest {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host");
  if (!host || host.startsWith("0.0.0.0")) return req;

  const proto = (
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    req.nextUrl.protocol.replace(":", "") ||
    "https"
  );
  const url = new URL(req.url);
  if (url.host === host && url.protocol === `${proto}:`) return req;

  url.protocol = `${proto}:`;
  url.host = host;
  return new NextRequest(url, req);
}

export function GET(req: NextRequest) {
  return handlers.GET(withPublicUrl(req));
}

export function POST(req: NextRequest) {
  return handlers.POST(withPublicUrl(req));
}
