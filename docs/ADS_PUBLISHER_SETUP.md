# Publisher ad setup (Monetization Plan 2 — Medium)

After deploying, create zones on each network and paste IDs into
**Admin → Websites → {site} → Ads** (and verification metas into **SEO**).

Do this for **pisster.com** and **fbbtube.com**. Skip Sharlila unless you want studio ads.

Admin field names must match exactly:

| Admin field | Network | What to create |
|-------------|---------|----------------|
| `exoInsClass` | ExoClick | Account `<ins>` class (e.g. `eas6a97888e2`) |
| `exoSiteVerification` | ExoClick | Site verification meta (SEO form) |
| `juicyAdsSiteVerification` | JuicyAds | Site verification meta content (SEO form) |
| `exoZoneHome` | ExoClick | Banner or Native — home |
| `exoZoneUnderPlayer` | ExoClick | Banner or Native — under player |
| `exoZoneVideoFullscreen` | ExoClick | Fullpage Interstitial (1/session in code) |
| `exoZoneGridNative` | ExoClick | Native / multi-format — in-feed |
| `exoZoneMidList` | ExoClick | Native mid-list (optional; falls back to grid) |
| `exoZoneMobileSticky` | ExoClick | Mobile Banner 320x50 |
| `exoZonePopunder` | ExoClick | Popunder (1/session on first video page) |
| `vastTagUrl` | ExoClick | Video VAST tag URL |
| `adsPopunderEnabled` | — | Toggle popunder |
| `juicyAdsSiteId` | JuicyAds | Publisher site ID |
| `juicyAdsZoneBanner` | JuicyAds | Banner zone ID |
| `juicyAdsZoneNative` | JuicyAds | Native zone ID |
| `adsJuicyEnabled` | — | Toggle Juicy fill |
| `stripchatWidgetId` | Stripchat | Widget ID (optional) |
| `stripchatAffiliateUrl` | Stripchat | Affiliate URL fallback |
| `adsCamWidgetEnabled` | — | Toggle cam widget |

## A) ExoClick — https://www.exoclick.com

1. Publisher → **Sites** → add `https://pisster.com` and `https://fbbtube.com` (Adult).
2. Paste verification into Admin → SEO → **Exo site verification**; set **Exo ins class**.
3. Create zones per site (name them `{site}-home`, etc.) and paste zone IDs into Ads.
4. For VAST: create a Video zone → copy the VAST URL into `vastTagUrl`.
5. Do **not** enable Instant Message or homepage-entry popunders for Medium.

## B) JuicyAds — https://www.juicyads.com

1. Publisher signup → add both domains (each site gets its own verification token).
2. Paste the meta **content** into Admin → SEO → **JuicyAds site verification** per site
   (emitted as `<meta name="juicyads-site-verification" content="…">`).
3. Per site: banner zone + native zone → paste into `juicyAdsZoneBanner` / `juicyAdsZoneNative`.
4. Paste site ID into `juicyAdsSiteId`; enable `adsJuicyEnabled`.

## C) Stripchat affiliate

1. Affiliate/partner signup.
2. Create a campaign per domain; copy widget ID and/or affiliate URL.
3. Paste into `stripchatWidgetId` and/or `stripchatAffiliateUrl`; enable `adsCamWidgetEnabled`.

## D) Verify

1. Hard-refresh a tube homepage and a video page (ad blockers hide slots).
2. Confirm Exo/Juicy dashboards show impressions within ~24h.
3. Popunder and fullscreen should each fire at most once per browser session.
4. **Exo `<ins>` class** must be identical on every site that shares the same
   ExoClick publisher account (typically `eas6a97888e2`). A typo here leaves
   empty “Advertisement” gaps with no creative.
5. **Desktop Fullpage Interstitial** only fires after a real user click (Exo
   zone Trigger Method). Mobile Fullpage Interstitial is a separate Exo format —
   if mobile fullscreen is needed, create that zone and paste its ID into
   `exoZoneVideoFullscreen` (or keep desktop-only).
6. **Mobile sticky** zones should be Exo format **Mobile Banner 320x50** (not
   Native). Wrong format still fills but looks broken / misaligned on mobile.
7. Banner slots center whatever creative size Exo returns; prefer matching
   zone formats (Leaderboard / Multi-format) for full-width look.
