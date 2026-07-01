-- AlterEnum
-- New terminal-ish state set by an admin. A STOPPED run is never auto-resumed
-- on worker restart; the admin can explicitly continue it (back to QUEUED).
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'STOPPED';

-- AlterTable
-- Per-run cap on videos downloaded per source site. NULL = download ALL results
-- for the query (worker paginates the source API until exhausted).
ALTER TABLE "ScrapeRun" ADD COLUMN "maxPerSite" INTEGER;
