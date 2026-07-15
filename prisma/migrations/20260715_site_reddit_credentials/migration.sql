-- Per-site Reddit API / Devvit credentials (kept off the public Site row).
CREATE TABLE IF NOT EXISTS "SiteRedditCredentials" (
    "siteId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "refreshToken" TEXT,
    "username" TEXT,
    "password" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteRedditCredentials_pkey" PRIMARY KEY ("siteId")
);

ALTER TABLE "SiteRedditCredentials"
  ADD CONSTRAINT "SiteRedditCredentials_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
