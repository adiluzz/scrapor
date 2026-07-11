import type { Config } from "tailwindcss";

/**
 * Brand scale reads CSS variables set by BrandStyle (per-site primaryColor).
 * Defaults in globals.css keep Pisster gold until BrandStyle hydrates.
 */
const brandStop = (stop: string | "DEFAULT") =>
  stop === "DEFAULT"
    ? "rgb(var(--brand-rgb) / <alpha-value>)"
    : `rgb(var(--brand-${stop}-rgb) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: brandStop("DEFAULT"),
          50: brandStop("50"),
          100: brandStop("100"),
          200: brandStop("200"),
          300: brandStop("300"),
          400: brandStop("400"),
          500: brandStop("500"),
          600: brandStop("600"),
          700: brandStop("700"),
          800: brandStop("800"),
          900: brandStop("900"),
          950: brandStop("950"),
        },
      },
    },
  },
  plugins: [],
};
export default config;
