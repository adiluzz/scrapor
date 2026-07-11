/** Injects site brand CSS variables for the shared player + UI accents. */
export default function BrandStyle({ primaryColor }: { primaryColor: string }) {
  const color = primaryColor || "#D4AF37";
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
:root {
  --brand: ${color};
  --brand-gold: ${color};
  --brand-400: ${color};
  --brand-500: ${color};
}
.vjs-theme-pisster .vjs-play-progress,
.vjs-theme-pisster .vjs-volume-level {
  background-color: ${color} !important;
}
.text-brand-400 { color: ${color} !important; }
.bg-brand-500, .bg-brand { background-color: ${color} !important; }
.ring-brand-500\\/60:focus-visible { --tw-ring-color: ${color}99; }
.focus-visible\\:ring-brand-500\\/60:focus-visible { --tw-ring-color: ${color}99; }
`,
      }}
    />
  );
}
