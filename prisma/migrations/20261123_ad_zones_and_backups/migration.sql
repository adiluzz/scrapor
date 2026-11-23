-- AlterTable
ALTER TABLE "Site" ADD COLUMN "exoZoneMobileFullscreen" TEXT;
ALTER TABLE "Site" ADD COLUMN "juicyAdsZoneMid" TEXT;

-- Pisster is suspended at Juicy. Leave the zones saved, but stop requesting them.
UPDATE "Site"
SET "adsJuicyEnabled" = false
WHERE "domain" = 'pisster.com';

-- Replace the declined TwinRed/Hilltop pre-roll backup. FBB Tube keeps TwinRed.
UPDATE "Site"
SET "vastTagUrlBackup" = 'https://s.magsrv.com/v1/vast.php?idz=6102936'
WHERE "domain" = 'pisster.com'
  AND (
    "vastTagUrlBackup" IS NULL
    OR "vastTagUrlBackup" ILIKE '%twinrdengine%'
  );

UPDATE "Site"
SET "stripchatAffiliateUrl" = replace("stripchatAffiliateUrl", 'tag=girls', 'tag=watersports')
WHERE "domain" = 'pisster.com'
  AND "stripchatAffiliateUrl" LIKE '%tag=girls%';

UPDATE "Site"
SET "stripchatAffiliateUrl" = replace("stripchatAffiliateUrl", 'tag=girls', 'tag=muscle')
WHERE "domain" = 'fbbtube.com'
  AND "stripchatAffiliateUrl" LIKE '%tag=girls%';

UPDATE "Site"
SET "vastTagUrlBackup" = replace("vastTagUrlBackup", 'kw=COMMA_SEPARATED_KEYWORDS', 'kw=fbb,muscle')
WHERE "domain" = 'fbbtube.com'
  AND "vastTagUrlBackup" LIKE '%COMMA_SEPARATED_KEYWORDS%';
