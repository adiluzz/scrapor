-- Pornstar names are unique per site. Matching ignores case and surrounding spaces.
-- Slugs stay an independent public URL and are not part of this key.
CREATE UNIQUE INDEX "Pornstar_siteId_name_ci_key"
ON "Pornstar" ("siteId", lower(trim("name")));
