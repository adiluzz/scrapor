-- CreateEnum
CREATE TYPE "StudioTalentRegion" AS ENUM ('ISRAEL', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "StudioTalentMediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "StudioTalent" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Featured performer',
    "region" "StudioTalentRegion" NOT NULL DEFAULT 'INTERNATIONAL',
    "origin" TEXT NOT NULL DEFAULT '',
    "basedIn" TEXT NOT NULL DEFAULT '',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "signed" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tagline" TEXT,
    "bio" TEXT,
    "grade" TEXT,
    "photoKey" TEXT,
    "photoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioTalent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioTalentMedia" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "kind" "StudioTalentMediaKind" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioTalentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudioTalent_siteId_slug_key" ON "StudioTalent"("siteId", "slug");

-- CreateIndex
CREATE INDEX "StudioTalent_siteId_published_sortOrder_idx" ON "StudioTalent"("siteId", "published", "sortOrder");

-- CreateIndex
CREATE INDEX "StudioTalentMedia_talentId_kind_sortOrder_idx" ON "StudioTalentMedia"("talentId", "kind", "sortOrder");

-- AddForeignKey
ALTER TABLE "StudioTalent" ADD CONSTRAINT "StudioTalent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioTalentMedia" ADD CONSTRAINT "StudioTalentMedia_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "StudioTalent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
