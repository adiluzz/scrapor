type Gtag = (
  command: "event",
  name: string,
  params?: Record<string, string | number>
) => void;

/** GA4 event. `gtag` exists from the consent snippet; the hit is stored only after analytics consent. */
export function trackAdEvent(
  name: string,
  params: Record<string, string | number | null | undefined> = {}
) {
  if (typeof window === "undefined") return;
  const w = window as Window & { gtag?: Gtag };
  if (typeof w.gtag !== "function") return;
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") clean[key] = value;
  }
  w.gtag("event", name, clean);
}
