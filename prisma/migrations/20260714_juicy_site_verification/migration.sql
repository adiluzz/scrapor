-- Per-site JuicyAds ownership verification meta content.
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "juicyAdsSiteVerification" TEXT;
