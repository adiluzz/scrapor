/** Derive a Tailwind-like brand palette from a site primary hex. */

export type BrandRgb = { r: number; g: number; b: number };

export function parseHexColor(input: string): BrandRgb | null {
  const raw = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw) && !/^[0-9a-fA-F]{3}$/.test(raw)) return null;
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function mix(a: BrandRgb, b: BrandRgb, t: number): BrandRgb {
  return {
    r: clamp(a.r + (b.r - a.r) * t),
    g: clamp(a.g + (b.g - a.g) * t),
    b: clamp(a.b + (b.b - a.b) * t),
  };
}

function toHex({ r, g, b }: BrandRgb) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function toRgbChannels({ r, g, b }: BrandRgb) {
  return `${r} ${g} ${b}`;
}

const WHITE: BrandRgb = { r: 255, g: 255, b: 255 };
const BLACK: BrandRgb = { r: 0, g: 0, b: 0 };

/** Shade stops aligned with previous Tailwind brand scale (gold defaults). */
const SHADE_MIX: Record<number, { toward: "white" | "black"; t: number }> = {
  50: { toward: "white", t: 0.92 },
  100: { toward: "white", t: 0.8 },
  200: { toward: "white", t: 0.65 },
  300: { toward: "white", t: 0.45 },
  400: { toward: "white", t: 0.22 },
  500: { toward: "black", t: 0 },
  600: { toward: "black", t: 0.18 },
  700: { toward: "black", t: 0.35 },
  800: { toward: "black", t: 0.48 },
  900: { toward: "black", t: 0.62 },
  950: { toward: "black", t: 0.78 },
};

export const DEFAULT_BRAND_HEX = "#D4AF37";

/** Original Tailwind brand scale (Pisster) — keep pixel-identical when primary is gold. */
const PISSTER_SHADE_RGB: Record<string, string> = {
  "50": "255 251 235",
  "100": "254 243 199",
  "200": "253 230 138",
  "300": "252 211 77",
  "400": "232 197 71",
  "500": "212 175 55",
  "600": "184 134 11",
  "700": "146 104 10",
  "800": "120 89 10",
  "900": "99 61 13",
  "950": "60 36 8",
};

const PISSTER_SHADE_HEX: Record<string, string> = {
  "50": "#FFFBEB",
  "100": "#FEF3C7",
  "200": "#FDE68A",
  "300": "#FCD34D",
  "400": "#E8C547",
  "500": "#D4AF37",
  "600": "#B8860B",
  "700": "#92680A",
  "800": "#78590A",
  "900": "#633D0D",
  "950": "#3C2408",
};

export type BrandPalette = {
  hex: string;
  rgb: string;
  light: string;
  dark: string;
  /** Space-separated RGB channels per shade for Tailwind `rgb(var(--x) / <alpha>)`. */
  shadeRgb: Record<string, string>;
  shadeHex: Record<string, string>;
};

export function buildBrandPalette(primaryColor: string): BrandPalette {
  const normalized = primaryColor.trim().toLowerCase();
  if (normalized === "#d4af37" || normalized === "d4af37") {
    return {
      hex: DEFAULT_BRAND_HEX,
      rgb: "212 175 55",
      light: PISSTER_SHADE_HEX["400"],
      dark: PISSTER_SHADE_HEX["600"],
      shadeRgb: { ...PISSTER_SHADE_RGB },
      shadeHex: { ...PISSTER_SHADE_HEX },
    };
  }

  const base = parseHexColor(primaryColor) || parseHexColor(DEFAULT_BRAND_HEX)!;
  const shadeRgb: Record<string, string> = {};
  const shadeHex: Record<string, string> = {};

  for (const [stop, { toward, t }] of Object.entries(SHADE_MIX)) {
    const mixed = mix(base, toward === "white" ? WHITE : BLACK, t);
    shadeRgb[stop] = toRgbChannels(mixed);
    shadeHex[stop] = toHex(mixed);
  }

  return {
    hex: toHex(base),
    rgb: toRgbChannels(base),
    light: shadeHex["400"],
    dark: shadeHex["600"],
    shadeRgb,
    shadeHex,
  };
}
