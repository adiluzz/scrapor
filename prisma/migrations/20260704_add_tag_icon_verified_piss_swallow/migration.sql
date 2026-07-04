-- AlterTable
ALTER TABLE "Tag" ADD COLUMN "icon" TEXT;

-- Ensure verified piss swallow tag for each site (idempotent per site slug)
INSERT INTO "Tag" ("id", "siteId", "slug", "name", "icon")
SELECT
  'c' || substr(md5(s.id || ':piss-swallow'), 1, 24),
  s.id,
  'piss-swallow',
  'piss swallow',
  'golden-drop'
FROM "Site" s
WHERE NOT EXISTS (
  SELECT 1 FROM "Tag" t WHERE t."siteId" = s.id AND t.slug = 'piss-swallow'
);
