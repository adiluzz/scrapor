-- Per-site verified-tags SEO blurb (shown on /tags)
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "verifiedTagsIntroHtml" TEXT;

-- FBB verified badge tags (fbbtube.com only)
INSERT INTO "Tag" ("id", "siteId", "slug", "name", "icon")
SELECT
  'c' || substr(md5(s.id || ':fbb-fuck'), 1, 24),
  s.id,
  'fbb-fuck',
  'fbb fuck',
  'fbb-mark'
FROM "Site" s
WHERE s.domain = 'fbbtube.com'
  AND NOT EXISTS (
    SELECT 1 FROM "Tag" t WHERE t."siteId" = s.id AND t.slug = 'fbb-fuck'
  );

INSERT INTO "Tag" ("id", "siteId", "slug", "name", "icon")
SELECT
  'c' || substr(md5(s.id || ':fbb-gangbang'), 1, 24),
  s.id,
  'fbb-gangbang',
  'fbb gangbang',
  'fbb-mark'
FROM "Site" s
WHERE s.domain = 'fbbtube.com'
  AND NOT EXISTS (
    SELECT 1 FROM "Tag" t WHERE t."siteId" = s.id AND t.slug = 'fbb-gangbang'
  );

-- Default verified-tags copy (admin can override per site)
UPDATE "Site"
SET "verifiedTagsIntroHtml" = '<p><strong>Verified tags</strong> mark scenes our team has reviewed for specific content. Tags with the golden drop badge indicate confirmed piss swallow; look for the badge on video pages and in search suggestions.</p>'
WHERE domain = 'pisster.com' AND ("verifiedTagsIntroHtml" IS NULL OR "verifiedTagsIntroHtml" = '');

UPDATE "Site"
SET "verifiedTagsIntroHtml" = '<p><strong>Verified tags</strong> highlight FBB scenes we have reviewed for specific themes. Tags with the FBB badge (fbb fuck, fbb gangbang, and others) mean the clip matches that verified category — use the filter below to browse verified tags only.</p>'
WHERE domain = 'fbbtube.com' AND ("verifiedTagsIntroHtml" IS NULL OR "verifiedTagsIntroHtml" = '');
