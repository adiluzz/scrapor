/** Routes where the header search bar should reset (taxonomy / entity detail browsing). */
export function headerSearchClearsOnPath(pathname: string): boolean {
  return (
    pathname === "/pornstars" ||
    pathname.startsWith("/pornstars/") ||
    pathname === "/tags" ||
    pathname.startsWith("/tags/") ||
    pathname === "/creators" ||
    pathname.startsWith("/creators/") ||
    pathname.startsWith("/videos/") ||
    pathname.startsWith("/watch/") ||
    pathname === "/dashboard"
  );
}

/** Header search input value derived from the current route. */
export function headerSearchFromUrl(pathname: string, urlQuery: string): string {
  if (headerSearchClearsOnPath(pathname)) return "";
  if (pathname === "/" || pathname === "/search") return urlQuery.trim();
  return "";
}
