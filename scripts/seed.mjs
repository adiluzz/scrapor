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
  "peeing porn",
  "pissing porn",
  "golden shower",
  "pee desperation",
  "human toilet",
  "toilet slave",
  "femdom piss",
  "self pissing",
  "piss on jeans",
  "outdoor pissing",
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
  "fbb erotica",
  "female muscle worship",
  "amazonian women",
  "muscle milf",
  "flex porn",
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
    seoTitle: "Peeing & Piss Drinking Porn Videos | Pisster",
    seoDescription:
      "Watch free HD piss drinking porn on Pisster. Golden shower, pee drinking, piss swallowing, lesbian peeing & watersports videos updated daily. Stream full-length urine fetish scenes in 720p and 1080p.",
    seoKeywords: PISSTER_SEO_KEYWORDS,
    ogImagePath: "/brand/pisster-lockup.svg",
    exoSiteVerification: "b4df9ea4db568763f1b9f8188c253ac9",
    homeH1: "Pissing & Piss Drinking Porn Videos",
    homeIntroHtml:
      "<p>Pisster is a free HD tube for piss drinking, golden shower, and watersports porn. Stream pee drinking, piss swallowing, and urine fetish scenes updated daily.</p><p>Browse tags like <a href=\"/tags/piss-swallow\">piss swallow</a> and explore pornstars who love pissing porn.</p><p>All videos stream free in HD. New pissing and watersports clips added regularly.</p>",
    exoInsClass: "eas6a97888e2",
    seoVideoTitleTpl: "{title} | Pisster",
    seoVideoDescTpl:
      "Watch {title} on Pisster — free HD piss drinking, golden shower & watersports porn.",
    seoPornstarTitleTpl: "{name} Piss Drinking & Golden Shower Videos | Pisster",
    seoPornstarDescTpl:
      "{name} pissing and piss drinking videos on Pisster. Watch {name} in golden shower & watersports scenes.",
    seoTagTitleTpl: "{name} Pissing & Piss Drinking Videos | Pisster",
    seoTagDescTpl:
      "Watch free {name} pissing and watersports videos on Pisster. Golden shower, pee drinking & HD urine fetish scenes.",
    seoTagsIndexTitle: "Pissing & Watersports Video Tags | Pisster",
    seoTagsIndexDesc:
      "Browse pissing, golden shower, and piss drinking tags on Pisster. Narrow by fetish — pee drinking, outdoor pissing, femdom piss, and more.",
    seoPornstarsIndexTitle: "Pornstars That Love Piss | Pisster",
    seoPornstarsIndexDesc:
      "Pornstars in piss drinking, golden shower, and watersports videos. Browse performers who film pissing porn on Pisster.",
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
    primaryColor: "#FF2D7A",
    isNetworkMember: true,
    mailFromName: "FBB Tube",
    networkOrder: 1,
    seoTitle: "Female Bodybuilder Porn & Muscle Worship Videos | FBB Tube",
    seoDescription:
      "Free HD female bodybuilder porn on FBB Tube. Muscle worship, ripped women, fbb erotica, fitness fetish & female muscle videos — stream scenes featuring strong women.",
    seoKeywords: FBB_SEO_KEYWORDS,
    ogImagePath: "/brand/fbbtube-lockup.svg",
    homeH1: "Female Bodybuilder Porn Videos",
    homeIntroHtml:
      "<p>FBB Tube is the home of free HD female bodybuilder porn and muscle worship. Stream fbb erotica, fitness fetish, and female muscle scenes featuring ripped women.</p><p>Browse tags and pornstars for muscle girls, flex clips, and amazonian performers.</p><p>Updated regularly — all videos stream free in HD.</p>",
    seoVideoTitleTpl: "{title} | FBB Tube",
    seoVideoDescTpl:
      "Watch {title} on FBB Tube — free HD female bodybuilder & muscle worship porn.",
    seoPornstarTitleTpl: "{name} Female Bodybuilder Videos | FBB Tube",
    seoPornstarDescTpl:
      "{name} FBB and muscle worship videos on FBB Tube. Watch {name} in female bodybuilder scenes.",
    seoTagTitleTpl: "{name} Female Bodybuilder & Muscle Videos | FBB Tube",
    seoTagDescTpl:
      "Watch free {name} female bodybuilder and muscle worship videos on FBB Tube.",
    seoTagsIndexTitle: "FBB & Muscle Fetish Video Tags | FBB Tube",
    seoTagsIndexDesc:
      "Browse female bodybuilder and muscle worship tags on FBB Tube — fbb, fitness fetish, female muscle, and more.",
    seoPornstarsIndexTitle: "Female Bodybuilders & Muscle Pornstars | FBB Tube",
    seoPornstarsIndexDesc:
      "Browse FBB pornstars and muscular women. Watch female bodybuilders in muscle worship videos on FBB Tube.",
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
    seoTitle: "Sharlila Productions — Adult Film Studio",
    seoDescription:
      "Sharlila is an adult film production company. Contact the studio and explore our specialty tubes across the Sharlila network.",
    seoKeywords: JSON.stringify([
      "sharlila",
      "adult studio",
      "porn production",
      "adult film production",
      "adult network",
    ]),
    ogImagePath: "/brand/sharlila-lockup.svg",
    homeH1: "Sharlila Productions",
    homeIntroHtml:
      "<p>Sharlila is an adult film production company. Contact us for collaborations, or explore our network of specialty tubes.</p><p><a href=\"/contact\">Contact</a> · <a href=\"/our-network\">Our Network</a></p>",
    seoCreatorTitleTpl: "{name} · Sharlila Productions",
    seoCreatorDescTpl: "{name} videos and productions from Sharlila.",
    seoCreatorsIndexTitle: "Creators · Sharlila Productions",
    seoCreatorsIndexDesc: "Independent creators and productions on Sharlila.",
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
      siteId: sharlila.id,
      email,
      passwordHash,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin ready: ${admin.email} on ${sharlila.domain}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
