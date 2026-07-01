-- AlterTable
-- Canonical per-video dedup key: the site's own video id when the URL host is
-- recognized, otherwise a normalized URL (https, no www/m, no tracking params,
-- no trailing slash). Nullable so creator uploads / legacy rows can stay NULL.
-- Intentionally NOT unique: pre-existing rows may already contain duplicates,
-- and dedup is enforced by the worker before insert. The index keeps lookups fast.
ALTER TABLE "Video" ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE INDEX "Video_dedupeKey_idx" ON "Video"("dedupeKey");
