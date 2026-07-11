-- Per-site Google Analytics 4 measurement id (e.g. G-XXXXXXXX).
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "gaMeasurementId" TEXT;
