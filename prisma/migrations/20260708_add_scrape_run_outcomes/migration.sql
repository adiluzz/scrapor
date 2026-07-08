-- Per-video skipped/failed outcomes for scrape runs (reason + stage for admin UI).

CREATE TYPE "ScrapeRunVideoOutcome" AS ENUM ('SKIPPED', 'FAILED');

CREATE TABLE "ScrapeRunOutcome" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "sourceSite" TEXT,
    "outcome" "ScrapeRunVideoOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "stage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapeRunOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrapeRunOutcome_runId_url_key" ON "ScrapeRunOutcome"("runId", "url");
CREATE INDEX "ScrapeRunOutcome_runId_idx" ON "ScrapeRunOutcome"("runId");
CREATE INDEX "ScrapeRunOutcome_runId_outcome_idx" ON "ScrapeRunOutcome"("runId", "outcome");

ALTER TABLE "ScrapeRunOutcome" ADD CONSTRAINT "ScrapeRunOutcome_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
