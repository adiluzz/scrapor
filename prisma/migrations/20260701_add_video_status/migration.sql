-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
-- Existing rows default to READY so they stay publicly listable. New creator
-- uploads are inserted as PENDING and flipped to READY by the worker once
-- thumbnail/preview/storyboard are generated and uploaded to S3.
ALTER TABLE "Video" ADD COLUMN "status" "VideoStatus" NOT NULL DEFAULT 'READY';
