-- HilltopAds site ownership verification (meta name+content are the same token).
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "hilltopAdsSiteVerification" TEXT;
