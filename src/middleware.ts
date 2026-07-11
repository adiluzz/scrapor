import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const ADMIN_SUBDOMAIN = process.env.ADMIN_SUBDOMAIN || "admin";
const ADMIN_BASE_DOMAIN = process.env.ADMIN_BASE_DOMAIN || "sharlila.com";

/**
 * Resolves the request host and:
 *  - forwards it as `x-forwarded-host` so server components/routes can scope
 *    every query to the right Site;
 *  - gates admin.${ADMIN_BASE_DOMAIN} to authenticated ADMIN users, routing them
 *    into the `/admin` section and redirecting everyone else to login.
 */
export default auth((req) => {
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
  const isAdminHost = host === `${ADMIN_SUBDOMAIN}.${ADMIN_BASE_DOMAIN}`;
  const { pathname } = req.nextUrl;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-forwarded-host", host);

  // Skip static assets, API auth, and Next internals.
  const isInternal =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".");

  // Dev/assistant tooling — admin console only (not on the public site).
  const adminOnlyPaths = [
    "/assistant",
    "/settings",
    "/tools",
    "/chats",
    "/contexts",
    "/skills",
  ];
  if (
    !isAdminHost &&
    !isInternal &&
    adminOnlyPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Public media routes (thumbnails, pornstar portraits, etc.) — same handlers on both hosts.
  const isMediaRoute = pathname.startsWith("/media/");

  if (isAdminHost && !isInternal) {
    const role = req.auth?.user?.role;
    const isAdmin = role === "ADMIN";
    const onLogin = pathname === "/login" || pathname.startsWith("/api/");

    if (!isAdmin && !onLogin && !isMediaRoute) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    // Rewrite admin-host root paths into the /admin section.
    if (
      isAdmin &&
      !pathname.startsWith("/admin") &&
      !pathname.startsWith("/api") &&
      !isMediaRoute &&
      pathname !== "/login"
    ) {
      const url = req.nextUrl.clone();
      url.pathname = `/admin${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
