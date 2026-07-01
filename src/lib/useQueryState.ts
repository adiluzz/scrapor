"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Centralized get/set of URL query params so the URL is the single source of
 * truth for search/filter/sort/pagination. Setting any param (other than page)
 * resets `page` to 1.
 */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  const setParams = useCallback(
    (updates: Record<string, string | number | null | undefined>, opts?: { replace?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      let touchedNonPage = false;
      for (const [key, value] of Object.entries(updates)) {
        if (key !== "page") touchedNonPage = true;
        if (value === null || value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      if (touchedNonPage && !("page" in updates)) params.delete("page");
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace) router.replace(url);
      else router.push(url);
    },
    [pathname, router, searchParams]
  );

  return { get, setParams, searchParams };
}
