import { buildBrandPalette, DEFAULT_BRAND_HEX } from "@/lib/brand-color";

/** Injects site brand CSS variables so Tailwind `brand-*` + player chrome follow Site.primaryColor. */
export default function BrandStyle({ primaryColor }: { primaryColor: string }) {
  const palette = buildBrandPalette(primaryColor || DEFAULT_BRAND_HEX);
  const shadeVars = Object.entries(palette.shadeRgb)
    .map(([stop, rgb]) => `  --brand-${stop}-rgb: ${rgb};`)
    .join("\n");
  const shadeHexVars = Object.entries(palette.shadeHex)
    .map(([stop, hex]) => `  --brand-${stop}: ${hex};`)
    .join("\n");

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
:root {
  --brand: ${palette.hex};
  --brand-rgb: ${palette.rgb};
  --brand-gold: ${palette.hex};
  --brand-gold-light: ${palette.light};
  --brand-gold-dark: ${palette.dark};
  --brand-400: ${palette.shadeHex["400"]};
  --brand-500: ${palette.shadeHex["500"]};
${shadeVars}
${shadeHexVars}
}
`,
      }}
    />
  );
}
