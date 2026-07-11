/**
 * Seed network sites + an ADMIN user on Sharlila.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret123 node scripts/seed.mjs
 *
 * In Docker:
 *   docker compose exec -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... web node scripts/seed.mjs
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = (process.env.ADMIN_EMAIL || "admin@sharlila.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "changeme123";

const PISSTER_SEO_KEYWORDS = JSON.stringify([
  "piss drinking porn",
  "piss drinking videos",
  "pee drinking porn",
  "golden shower videos",
  "watersports porn",
  "urine fetish",
  "piss swallowing",
  "piss in mouth",
  "piss drinking tube",
  "free piss drinking porn",
  "HD piss drinking",
  "lesbian piss drinking",
  "piss drinking compilation",
  "omorashi",
  "pee fetish",
]);

const FBB_SEO_KEYWORDS = JSON.stringify([
  "female bodybuilder porn",
  "fbb porn",
  "muscle worship",
  "female muscle",
  "fitness fetish",
  "bodybuilder women",
  "fbb tube",
  "female bodybuilder videos",
  "ripped women porn",
  "muscle girl porn",
]);

async function upsertSite(data) {
  return prisma.site.upsert({
    where: { domain: data.domain },
    update: data,
    create: data,
  });
}

async function main() {
  const pisster = await upsertSite({
    domain: "pisster.com",
    name: "Pisster",
    kind: "TUBE",
    slug: "pisster",
    tagline: "Free HD piss drinking, golden shower & watersports porn tube",
    logoPath: "/brand/pisster-lockup.png",
    logoKey: "golden-drop",
    primaryColor: "#D4AF37",
    isNetworkMember: true,
    mailFromName: "Pisster",
    networkOrder: 0,
    seoTitle: "Pisster — Piss Drinking Porn & Golden Shower Videos",
    seoDescription:
      "Watch free HD piss drinking porn on Pisster. Golden shower, pee drinking, piss swallowing & watersports videos updated daily. Stream full-length urine fetish scenes in 720p and 1080p.",
    seoKeywords: PISSTER_SEO_KEYWORDS,
    ogImagePath: "/apple-icon",
    exoSiteVerification: "b4df9ea4db568763f1b9f8188c253ac9",
    homeH1: "Piss Drinking Porn Videos",
    homeIntroHtml:
      "<p>Free HD piss drinking, golden shower, and watersports videos. Updated daily.</p>",
    exoInsClass: "eas6a97888e2",
  });
  console.log(`Site ready: ${pisster.domain} (${pisster.id})`);

  const fbb = await upsertSite({
    domain: "fbbtube.com",
    name: "FBB Tube",
    kind: "TUBE",
    slug: "fbbtube",
    tagline: "Free HD female bodybuilder & muscle worship porn",
    logoPath: "/brand/fbbtube-lockup.png",
    logoKey: "fbb-mark",
    primaryColor: "#3B82A0",
    isNetworkMember: true,
    mailFromName: "FBB Tube",
    networkOrder: 1,
    seoTitle: "FBB Tube — Female Bodybuilder Porn Videos",
    seoDescription:
      "Free HD female bodybuilder porn, muscle worship, fbb erotica & fitness fetish videos. Stream ripped women and female muscle scenes.",
    seoKeywords: FBB_SEO_KEYWORDS,
    ogImagePath: "/apple-icon",
    homeH1: "Female Bodybuilder Porn Videos",
    homeIntroHtml:
      "<p>Free HD female bodybuilder porn, muscle worship, and fitness fetish videos. Updated regularly.</p>",
  });
  console.log(`Site ready: ${fbb.domain} (${fbb.id})`);

  const sharlila = await upsertSite({
    domain: "sharlila.com",
    name: "Sharlila",
    kind: "STUDIO",
    slug: "sharlila",
    tagline: "Adult film productions",
    logoPath: "/brand/sharlila-lockup.png",
    logoKey: "sharlila-mark",
    primaryColor: "#C4A574",
    isNetworkMember: true,
    mailFromName: "Sharlila",
    networkOrder: 2,
    seoTitle: "Sharlila Productions — Adult Studio",
    seoDescription:
      "Sharlila is an adult film production company. Contact us and explore our network of specialty tubes.",
    seoKeywords: JSON.stringify([
      "sharlila",
      "adult studio",
      "porn production",
      "adult film production",
    ]),
    ogImagePath: "/apple-icon",
    homeH1: "Sharlila Productions",
    homeIntroHtml:
      "<p>Adult film production. Explore our network and get in touch.</p>",
  });
  console.log(`Site ready: ${sharlila.domain} (${sharlila.id})`);

  await prisma.tag.upsert({
    where: { siteId_slug: { siteId: pisster.id, slug: "piss-swallow" } },
    update: { name: "piss swallow", icon: "golden-drop" },
    create: {
      siteId: pisster.id,
      slug: "piss-swallow",
      name: "piss swallow",
      icon: "golden-drop",
    },
  });
  console.log("Verified tag ready: piss swallow (golden-drop icon)");

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { siteId_email: { siteId: sharlila.id, email } },
    update: { role: "ADMIN", passwordHash, emailVerifiedAt: new Date() },
    create: {
      email,
      passwordHash,
      role: "ADMIN",
      siteId: sharlila.id,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin ready: ${admin.email} (role=${admin.role})`);
  console.log("\nLog in at https://admin.sharlila.com with the credentials above.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
