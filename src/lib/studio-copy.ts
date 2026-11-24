/** Sharlila studio marketing copy. Hardcoded so the public site does not depend on CMS fields. */

export const STUDIO_HEADLINE = "Built like a feature. Produced for independent creators.";

export const STUDIO_SUBCOPY =
  "Sharlila Productions is an independent adult production house and digital network. We shoot intimate, cinematic scenes—champagne light, long takes, and genuine chemistry—and distribute creator-owned content across our high-traffic specialty platforms.";

export const STUDIO_TUBES = [
  { name: "FBB Tube", domain: "fbbtube.com", href: "https://fbbtube.com" },
  { name: "Pisster", domain: "pisster.com", href: "https://pisster.com" },
] as const;

export const STUDIO_INQUIRY_INTENTS = ["collab", "storefront", "general"] as const;

export type StudioInquiryIntent = (typeof STUDIO_INQUIRY_INTENTS)[number];

export const STUDIO_INQUIRY_LABELS: Record<StudioInquiryIntent, string> = {
  collab: "In-Person Collaborations",
  storefront: "Creator Storefronts (85% Payout)",
  general: "General",
};

export function parseStudioInquiryIntent(value: string | undefined): StudioInquiryIntent {
  if (value === "storefront" || value === "general" || value === "collab") return value;
  return "collab";
}
