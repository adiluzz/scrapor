-- CreateEnum
CREATE TYPE "PromoAdStatus" AS ENUM ('DRAFT', 'GENERATING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "PromoAdGenerationMode" AS ENUM ('CLIP_COMPOSE', 'GENERATIVE');

-- CreateEnum
CREATE TYPE "PromoAdIterationStatus" AS ENUM ('PENDING', 'GENERATING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "PromoAd" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT,
    "status" "PromoAdStatus" NOT NULL DEFAULT 'DRAFT',
    "generationMode" "PromoAdGenerationMode" NOT NULL DEFAULT 'CLIP_COMPOSE',
    "generativeModelId" TEXT,
    "showcaseVideoId" TEXT,
    "prompt" TEXT,
    "modelParams" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoAdClip" (
    "id" TEXT NOT NULL,
    "promoAdId" TEXT NOT NULL,
    "detectionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PromoAdClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoAdIteration" (
    "id" TEXT NOT NULL,
    "promoAdId" TEXT NOT NULL,
    "iterationNumber" INTEGER NOT NULL,
    "userPrompt" TEXT,
    "modelParams" TEXT,
    "status" "PromoAdIterationStatus" NOT NULL DEFAULT 'PENDING',
    "s3Key" TEXT,
    "providerJobId" TEXT,
    "parentIterationId" TEXT,
    "userFeedback" TEXT,
    "estimatedCostUsd" DOUBLE PRECISION,
    "actualCostUsd" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoAdIteration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoAd_siteId_createdAt_idx" ON "PromoAd"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "PromoAd_status_idx" ON "PromoAd"("status");

-- CreateIndex
CREATE INDEX "PromoAdClip_promoAdId_idx" ON "PromoAdClip"("promoAdId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoAdClip_promoAdId_detectionId_key" ON "PromoAdClip"("promoAdId", "detectionId");

-- CreateIndex
CREATE INDEX "PromoAdIteration_promoAdId_idx" ON "PromoAdIteration"("promoAdId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoAdIteration_promoAdId_iterationNumber_key" ON "PromoAdIteration"("promoAdId", "iterationNumber");

-- AddForeignKey
ALTER TABLE "PromoAdClip" ADD CONSTRAINT "PromoAdClip_promoAdId_fkey" FOREIGN KEY ("promoAdId") REFERENCES "PromoAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoAdClip" ADD CONSTRAINT "PromoAdClip_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "VideoAgentDetection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoAdIteration" ADD CONSTRAINT "PromoAdIteration_promoAdId_fkey" FOREIGN KEY ("promoAdId") REFERENCES "PromoAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;
