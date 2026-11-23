-- Suspend a video on a site without dropping the publication row or slug.
ALTER TABLE "VideoSite" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VideoSite" ADD COLUMN "suspendedAt" TIMESTAMP(3);

CREATE INDEX "VideoSite_siteId_suspended_idx" ON "VideoSite"("siteId", "suspended");
