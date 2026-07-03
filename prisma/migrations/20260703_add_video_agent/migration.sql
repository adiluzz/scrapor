-- CreateEnum
CREATE TYPE "VideoAgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "VideoAgent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAgentRun" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "extractTargets" TEXT NOT NULL,
    "status" "VideoAgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAgentDetection" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "videoTitle" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "screenX" DOUBLE PRECISION,
    "screenY" DOUBLE PRECISION,
    "screenW" DOUBLE PRECISION,
    "screenH" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "frameSec" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAgentDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAgentFeedback" (
    "id" TEXT NOT NULL,
    "detectionId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAgentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAgentTrainingExample" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "screenX" DOUBLE PRECISION,
    "screenY" DOUBLE PRECISION,
    "screenW" DOUBLE PRECISION,
    "screenH" DOUBLE PRECISION,
    "contextPrompt" TEXT,
    "videoId" TEXT,
    "sourceDetectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAgentTrainingExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoAgent_key_key" ON "VideoAgent"("key");

-- CreateIndex
CREATE INDEX "VideoAgentRun_siteId_createdAt_idx" ON "VideoAgentRun"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoAgentRun_status_idx" ON "VideoAgentRun"("status");

-- CreateIndex
CREATE INDEX "VideoAgentDetection_runId_idx" ON "VideoAgentDetection"("runId");

-- CreateIndex
CREATE INDEX "VideoAgentDetection_videoId_idx" ON "VideoAgentDetection"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAgentFeedback_detectionId_key" ON "VideoAgentFeedback"("detectionId");

-- CreateIndex
CREATE INDEX "VideoAgentTrainingExample_siteId_label_approved_idx" ON "VideoAgentTrainingExample"("siteId", "label", "approved");

-- AddForeignKey
ALTER TABLE "VideoAgentRun" ADD CONSTRAINT "VideoAgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VideoAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAgentDetection" ADD CONSTRAINT "VideoAgentDetection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "VideoAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAgentFeedback" ADD CONSTRAINT "VideoAgentFeedback_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "VideoAgentDetection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default content-detector agent
INSERT INTO "VideoAgent" ("id", "key", "name", "description", "defaultPrompt", "createdAt", "updatedAt")
VALUES (
    'agent_content_detector',
    'content-detector',
    'Content Detector',
    'Searches videos and detects specific on-screen events with timestamps and screen regions.',
    'Search for videos related to golden shower content. Detect exactly where piss drinking happens and where piss swallowing happens. Return the time range and screen location for each occurrence.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
