const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

declare global {
  interface Window {
    adsbyjuicy?: Array<{ adzone: number | string }>;
  }
}

/** Load jads.js once and queue a zone render. Safe to call repeatedly. */
export function pushJuicyZone(zoneId: string | number) {
  if (typeof window === "undefined") return;

  let script = document.querySelector<HTMLScriptElement>(`script[src="${JADS_SRC}"]`);
  if (!script) {
    script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = JADS_SRC;
    document.body.appendChild(script);
  }

  window.adsbyjuicy = window.adsbyjuicy || [];
  window.adsbyjuicy.push({ adzone: Number(zoneId) || zoneId });
}

export { JADS_SRC };
