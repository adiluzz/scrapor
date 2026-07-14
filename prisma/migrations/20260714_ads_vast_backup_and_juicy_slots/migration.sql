-- Second VAST supplier + Juicy floating/in-video zones.
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "vastTagUrlBackup" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "juicyAdsZoneVidfloat" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "juicyAdsZoneInvideo" TEXT;
