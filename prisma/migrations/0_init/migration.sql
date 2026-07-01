-- Enable fuzzy full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER', 'CREATOR');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "CodePurpose" AS ENUM ('SIGNUP', 'LOGIN');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "siteId" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceSite" TEXT,
    "description" TEXT,
    "durationSec" INTEGER,
    "s3VideoKey" TEXT,
    "s3ThumbKey" TEXT,
    "s3PreviewKey" TEXT,
    "s3StoryboardKey" TEXT,
    "s3StoryboardVttKey" TEXT,
    "sourceUploadDate" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "creatorId" TEXT,
    "scrapeRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pornstar" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "s3Image" TEXT,

    CONSTRAINT "Pornstar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoPornstar" (
    "videoId" TEXT NOT NULL,
    "pornstarId" TEXT NOT NULL,

    CONSTRAINT "VideoPornstar_pkey" PRIMARY KEY ("videoId","pornstarId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTag" (
    "videoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "VideoTag_pkey" PRIMARY KEY ("videoId","tagId")
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "s3Avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "desiredSlug" TEXT NOT NULL,
    "bio" TEXT,
    "status" "AppStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "selectedSites" TEXT NOT NULL,
    "minDurationSec" INTEGER NOT NULL DEFAULT 600,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "newVideos" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRunSite" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceSite" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "found" INTEGER NOT NULL DEFAULT 0,
    "newVideos" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeRunSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "sample" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "purpose" "CodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoHeatmap" (
    "videoId" TEXT NOT NULL,
    "buckets" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoHeatmap_pkey" PRIMARY KEY ("videoId")
);

-- CreateTable
CREATE TABLE "WatchProgress" (
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "positionSec" INTEGER NOT NULL,
    "buckets" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchProgress_pkey" PRIMARY KEY ("userId","videoId")
);

-- CreateTable
CREATE TABLE "Context" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "selectedToolKeys" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkill" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentScript" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSkill" (
    "contextId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "ContextSkill_pkey" PRIMARY KEY ("contextId","skillId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_domain_key" ON "Site"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "User_siteId_email_key" ON "User"("siteId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Video_sourceUrl_key" ON "Video"("sourceUrl");

-- CreateIndex
CREATE INDEX "Video_siteId_isDeleted_createdAt_idx" ON "Video"("siteId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "Video_siteId_isDeleted_viewCount_idx" ON "Video"("siteId", "isDeleted", "viewCount");

-- CreateIndex
CREATE UNIQUE INDEX "Video_siteId_slug_key" ON "Video"("siteId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Pornstar_siteId_slug_key" ON "Pornstar"("siteId", "slug");

-- CreateIndex
CREATE INDEX "VideoPornstar_pornstarId_idx" ON "VideoPornstar"("pornstarId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_siteId_slug_key" ON "Tag"("siteId", "slug");

-- CreateIndex
CREATE INDEX "VideoTag_tagId_idx" ON "VideoTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_siteId_slug_key" ON "CreatorProfile"("siteId", "slug");

-- CreateIndex
CREATE INDEX "CreatorApplication_siteId_status_idx" ON "CreatorApplication"("siteId", "status");

-- CreateIndex
CREATE INDEX "ScrapeRun_siteId_createdAt_idx" ON "ScrapeRun"("siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapeRunSite_runId_sourceSite_key" ON "ScrapeRunSite"("runId", "sourceSite");

-- CreateIndex
CREATE INDEX "SearchQuery_siteId_count_idx" ON "SearchQuery"("siteId", "count");

-- CreateIndex
CREATE UNIQUE INDEX "SearchQuery_siteId_normalized_key" ON "SearchQuery"("siteId", "normalized");

-- CreateIndex
CREATE INDEX "EmailCode_email_siteId_purpose_idx" ON "EmailCode"("email", "siteId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Context_name_key" ON "Context"("name");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAttachment_messageId_idx" ON "ChatAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkill_key_key" ON "AgentSkill"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AgentScript_name_key" ON "AgentScript"("name");

-- CreateIndex
CREATE INDEX "ContextSkill_skillId_idx" ON "ContextSkill"("skillId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pornstar" ADD CONSTRAINT "Pornstar_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoPornstar" ADD CONSTRAINT "VideoPornstar_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoPornstar" ADD CONSTRAINT "VideoPornstar_pornstarId_fkey" FOREIGN KEY ("pornstarId") REFERENCES "Pornstar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeRun" ADD CONSTRAINT "ScrapeRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeRunSite" ADD CONSTRAINT "ScrapeRunSite_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoHeatmap" ADD CONSTRAINT "VideoHeatmap_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextSkill" ADD CONSTRAINT "ContextSkill_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextSkill" ADD CONSTRAINT "ContextSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "AgentSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Trigram indexes for fuzzy full-text search
CREATE INDEX "Video_title_trgm_idx" ON "Video" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Pornstar_name_trgm_idx" ON "Pornstar" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Tag_name_trgm_idx" ON "Tag" USING gin ("name" gin_trgm_ops);
