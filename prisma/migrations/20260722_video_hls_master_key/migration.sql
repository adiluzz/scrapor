-- VOD HLS master playlist key for segment-based playback.
ALTER TABLE "Video" ADD COLUMN "s3HlsMasterKey" TEXT;
