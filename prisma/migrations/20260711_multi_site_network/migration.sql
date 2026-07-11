-- Multi-site network: Site config, VideoSite M2M, scrape targets, seed three sites

CREATE TYPE "SiteKind" AS ENUM ('TUBE', 'STUDIO');

ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "kind" "SiteKind" NOT NULL DEFAULT 'TUBE';
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "logoPath" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "logoKey" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#D4AF37';
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "isNetworkMember" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "mailFromName" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "networkOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoKeywords" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "ogImagePath" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoSiteVerification" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "homeH1" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "homeIntroHtml" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "vastTagUrl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "adSkipSeconds" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "adMinViewSeconds" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "adTimeoutMs" INTEGER NOT NULL DEFAULT 12000;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoInsClass" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoZoneHome" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoZoneUnderPlayer" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoZoneVideoFullscreen" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Site"
SET "slug" = split_part("domain", '.', 1)
WHERE "slug" IS NULL;

INSERT INTO "Site" (
  "id", "domain", "name", "kind", "slug", "tagline", "logoPath", "logoKey", "primaryColor",
  "isNetworkMember", "mailFromName", "networkOrder",
  "seoTitle", "seoDescription", "seoKeywords", "ogImagePath", "exoSiteVerification",
  "homeH1", "homeIntroHtml", "exoInsClass", "createdAt", "updatedAt"
)
VALUES (
  'site_pisster_seed',
  'pisster.com',
  'Pisster',
  'TUBE',
  'pisster',
  'Free HD piss drinking, golden shower & watersports porn tube',
  '/brand/pisster-lockup.png',
  'golden-drop',
  '#D4AF37',
  true,
  'Pisster',
  0,
  'Pisster — Piss Drinking Porn & Golden Shower Videos',
  'Watch free HD piss drinking porn on Pisster. Golden shower, pee drinking, piss swallowing & watersports videos updated daily. Stream full-length urine fetish scenes in 720p and 1080p.',
  '["piss drinking porn","piss drinking videos","pee drinking porn","golden shower videos","watersports porn","urine fetish","piss swallowing","piss in mouth","piss drinking tube","free piss drinking porn","HD piss drinking","lesbian piss drinking","piss drinking compilation","omorashi","pee fetish"]',
  '/apple-icon',
  'b4df9ea4db568763f1b9f8188c253ac9',
  'Piss Drinking Porn Videos',
  '<p>Free HD piss drinking, golden shower, and watersports videos. Updated daily.</p>',
  'eas6a97888e2',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("domain") DO UPDATE SET
  "name" = EXCLUDED."name",
  "kind" = EXCLUDED."kind",
  "slug" = EXCLUDED."slug",
  "tagline" = COALESCE("Site"."tagline", EXCLUDED."tagline"),
  "logoPath" = COALESCE("Site"."logoPath", EXCLUDED."logoPath"),
  "logoKey" = COALESCE("Site"."logoKey", EXCLUDED."logoKey"),
  "primaryColor" = EXCLUDED."primaryColor",
  "isNetworkMember" = true,
  "mailFromName" = COALESCE("Site"."mailFromName", EXCLUDED."mailFromName"),
  "networkOrder" = 0,
  "seoTitle" = COALESCE("Site"."seoTitle", EXCLUDED."seoTitle"),
  "seoDescription" = COALESCE("Site"."seoDescription", EXCLUDED."seoDescription"),
  "seoKeywords" = COALESCE("Site"."seoKeywords", EXCLUDED."seoKeywords"),
  "ogImagePath" = COALESCE("Site"."ogImagePath", EXCLUDED."ogImagePath"),
  "exoSiteVerification" = COALESCE("Site"."exoSiteVerification", EXCLUDED."exoSiteVerification"),
  "homeH1" = COALESCE("Site"."homeH1", EXCLUDED."homeH1"),
  "homeIntroHtml" = COALESCE("Site"."homeIntroHtml", EXCLUDED."homeIntroHtml"),
  "exoInsClass" = COALESCE("Site"."exoInsClass", EXCLUDED."exoInsClass"),
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Site"
SET
  "slug" = COALESCE("slug", split_part("domain", '.', 1)),
  "logoKey" = COALESCE("logoKey", 'golden-drop'),
  "logoPath" = COALESCE("logoPath", '/brand/pisster-lockup.png'),
  "tagline" = COALESCE("tagline", 'Free HD piss drinking, golden shower & watersports porn tube'),
  "mailFromName" = COALESCE("mailFromName", "name"),
  "seoTitle" = COALESCE("seoTitle", "name" || ' — Piss Drinking Porn & Golden Shower Videos'),
  "seoDescription" = COALESCE("seoDescription", 'Watch free HD piss drinking porn on ' || "name" || '.'),
  "seoKeywords" = COALESCE("seoKeywords", '["piss drinking porn","golden shower videos","watersports porn"]'),
  "homeH1" = COALESCE("homeH1", 'Piss Drinking Porn Videos'),
  "exoInsClass" = COALESCE("exoInsClass", 'eas6a97888e2'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "domain" = 'pisster.com';

INSERT INTO "Site" (
  "id", "domain", "name", "kind", "slug", "tagline", "logoPath", "logoKey", "primaryColor",
  "isNetworkMember", "mailFromName", "networkOrder",
  "seoTitle", "seoDescription", "seoKeywords", "ogImagePath",
  "homeH1", "homeIntroHtml", "createdAt", "updatedAt"
)
VALUES (
  'site_fbbtube_seed',
  'fbbtube.com',
  'FBB Tube',
  'TUBE',
  'fbbtube',
  'Free HD female bodybuilder & muscle worship porn',
  '/brand/fbbtube-lockup.png',
  'fbb-mark',
  '#FF2D7A',
  true,
  'FBB Tube',
  1,
  'FBB Tube — Female Bodybuilder Porn Videos',
  'Free HD female bodybuilder porn, muscle worship, fbb erotica & fitness fetish videos. Stream ripped women and female muscle scenes.',
  '["female bodybuilder porn","fbb porn","muscle worship","female muscle","fitness fetish","bodybuilder women","fbb tube","female bodybuilder videos","ripped women porn","muscle girl porn"]',
  '/apple-icon',
  'Female Bodybuilder Porn Videos',
  '<p>Free HD female bodybuilder porn, muscle worship, and fitness fetish videos. Updated regularly.</p>',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("domain") DO UPDATE SET
  "name" = EXCLUDED."name",
  "kind" = EXCLUDED."kind",
  "slug" = EXCLUDED."slug",
  "tagline" = EXCLUDED."tagline",
  "logoPath" = EXCLUDED."logoPath",
  "logoKey" = EXCLUDED."logoKey",
  "primaryColor" = EXCLUDED."primaryColor",
  "seoTitle" = EXCLUDED."seoTitle",
  "seoDescription" = EXCLUDED."seoDescription",
  "seoKeywords" = EXCLUDED."seoKeywords",
  "homeH1" = EXCLUDED."homeH1",
  "homeIntroHtml" = EXCLUDED."homeIntroHtml",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Site" (
  "id", "domain", "name", "kind", "slug", "tagline", "logoPath", "logoKey", "primaryColor",
  "isNetworkMember", "mailFromName", "networkOrder",
  "seoTitle", "seoDescription", "seoKeywords", "ogImagePath",
  "homeH1", "homeIntroHtml", "createdAt", "updatedAt"
)
VALUES (
  'site_sharlila_seed',
  'sharlila.com',
  'Sharlila',
  'STUDIO',
  'sharlila',
  'Adult film productions',
  '/brand/sharlila-lockup.png',
  'sharlila-mark',
  '#C4A574',
  true,
  'Sharlila',
  2,
  'Sharlila Productions — Adult Studio',
  'Sharlila is an adult film production company. Contact us and explore our network of specialty tubes.',
  '["sharlila","adult studio","porn production","adult film production"]',
  '/apple-icon',
  'Sharlila Productions',
  '<p>Adult film production. Explore our network and get in touch.</p>',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("domain") DO UPDATE SET
  "name" = EXCLUDED."name",
  "kind" = EXCLUDED."kind",
  "slug" = EXCLUDED."slug",
  "tagline" = EXCLUDED."tagline",
  "logoPath" = EXCLUDED."logoPath",
  "logoKey" = EXCLUDED."logoKey",
  "primaryColor" = EXCLUDED."primaryColor",
  "seoTitle" = EXCLUDED."seoTitle",
  "seoDescription" = EXCLUDED."seoDescription",
  "seoKeywords" = EXCLUDED."seoKeywords",
  "homeH1" = EXCLUDED."homeH1",
  "homeIntroHtml" = EXCLUDED."homeIntroHtml",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Ensure any leftover rows have a unique slug before NOT NULL
UPDATE "Site" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "Site" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Site_slug_key" ON "Site"("slug");

CREATE TABLE IF NOT EXISTS "VideoSite" (
  "videoId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoSite_pkey" PRIMARY KEY ("videoId", "siteId")
);
CREATE INDEX IF NOT EXISTS "VideoSite_siteId_idx" ON "VideoSite"("siteId");
ALTER TABLE "VideoSite" DROP CONSTRAINT IF EXISTS "VideoSite_videoId_fkey";
ALTER TABLE "VideoSite" ADD CONSTRAINT "VideoSite_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoSite" DROP CONSTRAINT IF EXISTS "VideoSite_siteId_fkey";
ALTER TABLE "VideoSite" ADD CONSTRAINT "VideoSite_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ScrapeRunTargetSite" (
  "runId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  CONSTRAINT "ScrapeRunTargetSite_pkey" PRIMARY KEY ("runId", "siteId")
);
CREATE INDEX IF NOT EXISTS "ScrapeRunTargetSite_siteId_idx" ON "ScrapeRunTargetSite"("siteId");
ALTER TABLE "ScrapeRunTargetSite" DROP CONSTRAINT IF EXISTS "ScrapeRunTargetSite_runId_fkey";
ALTER TABLE "ScrapeRunTargetSite" ADD CONSTRAINT "ScrapeRunTargetSite_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrapeRunTargetSite" DROP CONSTRAINT IF EXISTS "ScrapeRunTargetSite_siteId_fkey";
ALTER TABLE "ScrapeRunTargetSite" ADD CONSTRAINT "ScrapeRunTargetSite_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1) Publish currently non-deleted videos to Pisster
INSERT INTO "VideoSite" ("videoId", "siteId", "createdAt")
SELECT v."id", s."id", CURRENT_TIMESTAMP
FROM "Video" v
CROSS JOIN "Site" s
WHERE s."domain" = 'pisster.com'
  AND v."isDeleted" = false
  AND NOT EXISTS (
    SELECT 1 FROM "VideoSite" vs WHERE vs."videoId" = v."id" AND vs."siteId" = s."id"
  )
ON CONFLICT DO NOTHING;

-- 2) Un-delete soft-deleted videos; leave without VideoSite (orphans)
UPDATE "Video"
SET "isDeleted" = false, "deletedAt" = NULL
WHERE "isDeleted" = true;

-- Existing scrape runs: default target = owner site
INSERT INTO "ScrapeRunTargetSite" ("runId", "siteId")
SELECT r."id", r."siteId"
FROM "ScrapeRun" r
WHERE NOT EXISTS (
  SELECT 1 FROM "ScrapeRunTargetSite" t WHERE t."runId" = r."id"
)
ON CONFLICT DO NOTHING;

-- Move ADMIN users to Sharlila when no email conflict
DO $$
DECLARE
  sharlila_id TEXT;
  pisster_id TEXT;
BEGIN
  SELECT "id" INTO sharlila_id FROM "Site" WHERE "domain" = 'sharlila.com' LIMIT 1;
  SELECT "id" INTO pisster_id FROM "Site" WHERE "domain" = 'pisster.com' LIMIT 1;
  IF sharlila_id IS NULL OR pisster_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE "User" u
  SET "siteId" = sharlila_id
  WHERE u."role" = 'ADMIN'
    AND u."siteId" = pisster_id
    AND NOT EXISTS (
      SELECT 1 FROM "User" u2
      WHERE u2."siteId" = sharlila_id AND u2."email" = u."email"
    );
END $$;

CREATE INDEX IF NOT EXISTS "Video_slug_idx" ON "Video"("slug");
CREATE INDEX IF NOT EXISTS "Video_isDeleted_createdAt_idx" ON "Video"("isDeleted", "createdAt");
CREATE INDEX IF NOT EXISTS "Video_isDeleted_viewCount_idx" ON "Video"("isDeleted", "viewCount");
