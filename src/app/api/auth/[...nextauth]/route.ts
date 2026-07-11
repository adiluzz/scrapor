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
  const forwardedHost =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host");
  if (!forwardedHost || forwardedHost.startsWith("0.0.0.0")) return req;

  const proto = (
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    req.nextUrl.protocol.replace(":", "") ||
    "https"
  );
  // Prefer reconstructing the origin — mutating protocol on a :3000 URL keeps
  // the listen port (https://host:3000), which breaks public redirects.
  const publicOrigin = `${proto}://${forwardedHost}`;
  const url = new URL(req.url);
  if (url.origin === publicOrigin) return req;

  return new NextRequest(new URL(`${url.pathname}${url.search}`, publicOrigin), req);
}

export function GET(req: NextRequest) {
  return handlers.GET(withPublicUrl(req));
}

export function POST(req: NextRequest) {
  return handlers.POST(withPublicUrl(req));
}
