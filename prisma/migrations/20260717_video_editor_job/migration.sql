-- Video editor jobs (OpenReel + Bedrock highlight / auto-render)
CREATE TYPE "VideoEditorJobStatus" AS ENUM ('PENDING', 'ANALYZING', 'READY', 'RENDERING', 'DONE', 'ERROR');
CREATE TYPE "VideoEditorJobMode" AS ENUM ('ANALYZE_OPEN', 'AUTO_RENDER');

CREATE TABLE "VideoEditorJob" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sourceVideoIds" TEXT NOT NULL,
    "title" TEXT,
    "mode" "VideoEditorJobMode" NOT NULL DEFAULT 'ANALYZE_OPEN',
    "status" "VideoEditorJobStatus" NOT NULL DEFAULT 'PENDING',
    "analysisModel" TEXT NOT NULL DEFAULT 'nova-2-lite',
    "targetDurationSec" INTEGER NOT NULL DEFAULT 30,
    "videoAgentRunId" TEXT,
    "promoAdId" TEXT,
    "resultVideoId" TEXT,
    "segmentsJson" TEXT,
    "estimatedCostUsd" DOUBLE PRECISION,
    "error" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoEditorJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VideoEditorJob_siteId_createdAt_idx" ON "VideoEditorJob"("siteId", "createdAt");
CREATE INDEX "VideoEditorJob_status_idx" ON "VideoEditorJob"("status");
