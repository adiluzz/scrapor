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
| `exoZoneHome` | ExoClick | Banner or Native — home (desktop sidebar + mobile top) |
| `exoZoneUnderPlayer` | ExoClick | Banner — under player (desktop beside Juicy) |
| `exoZoneVideoFullscreen` | ExoClick | Fullpage Interstitial (1/session in code) |
| `exoZoneGridNative` | ExoClick | Native — mid-list + in-grid card-sized tiles |
| `exoZoneMidList` | ExoClick | Native mid-list (optional; falls back to grid) |
| `exoZoneMobileSticky` | ExoClick | Mobile Banner 320x50 |
| `exoZonePopunder` | ExoClick | Popunder (1/session after creativeDisplayed) |
| `vastTagUrl` | ExoClick | Video VAST tag URL (primary pre-roll) |
| `vastTagUrlBackup` | TrafficStars | Backup VAST tag (waterfall when primary has no fill) |
| `adsPopunderEnabled` | — | Toggle popunder |
| `juicyAdsSiteId` | JuicyAds | Publisher site ID |
| `juicyAdsZoneBanner` | JuicyAds | Banner zone (under-player / sticky fallback) |
| `juicyAdsZoneNative` | JuicyAds | **In-grid card** — use a **300×250 Banner** zone (not Native text) |
| `juicyAdsZoneVidfloat` | JuicyAds | 300×250 floating corner (desktop video pages) |
| `juicyAdsZoneInvideo` | JuicyAds | In-video overlay inside the player |
| `adsJuicyEnabled` | — | Toggle Juicy fill |
| `stripchatWidgetId` | Stripchat | Widget ID (optional) |
| `stripchatAffiliateUrl` | Stripchat | Affiliate URL fallback |
| `adsCamWidgetEnabled` | — | Toggle cam widget |

## A) ExoClick — https://www.exoclick.com

1. Publisher → **Sites** → add `https://pisster.com` and `https://fbbtube.com` (Adult).
2. Paste verification into Admin → SEO → **Exo site verification**; set **Exo ins class**.
3. Create zones per site (name them `{site}-home`, etc.) and paste zone IDs into Ads.
4. For VAST: create a Video zone → copy the VAST URL into `vastTagUrl`.
5. Fullpage Interstitial zones must be assigned to the matching Site / domain or Exo marks them `domain-restricted`.
6. Do **not** enable Instant Message or homepage-entry popunders for Medium.

## B) JuicyAds — https://www.juicyads.com

1. Publisher signup → add both domains (each site gets its own verification token).
2. Paste the meta **content** into Admin → SEO → **JuicyAds site verification** per site
   (emitted as `<meta name="juicyads-site-verification" content="…">`).
3. Per site create banner + **in-grid 300×250 Banner** + **vidfloat** (`300x250:vidfloat`) + **invideo** zones →
   paste into `juicyAdsZoneBanner` / `juicyAdsZoneNative` / `juicyAdsZoneVidfloat` /
   `juicyAdsZoneInvideo`. Do **not** use Juicy “Native text” for the grid — it renders as a
   small centered widget. Create a separate Banner spot sized **300×250** for in-grid.
4. Paste site ID into `juicyAdsSiteId`; enable `adsJuicyEnabled`.
5. Embed uses Juicy v3 (`poweredby.jads.co/js/jads.js` + `<ins id="{zone}">`).

## C) TrafficStars (VAST backup) — https://trafficstars.com

1. Register as a publisher; create one In-Stream (VAST) spot per tube domain.
2. Paste each tag URL into Admin → Ads → **VAST backup tag**.
3. Pre-roll waterfall: primary Exo → backup TrafficStars → one Exo retry.
   TrafficStars is fetched **server-side** inside `/api/videos/{id}/vast` (the
   browser only sees that API call, not `tsyndicate.com`). If the VAST URL
   returns `Undefined or not active spot`, activate/approve the spot in
   TrafficStars — our code cannot invent fill for a dead spot.

## D) Stripchat affiliate (StripCash)

1. Affiliate signup at https://stripcash.com.
2. Create a campaign per domain; copy widget ID and/or affiliate URL.
3. Paste into `stripchatWidgetId` and/or `stripchatAffiliateUrl`; enable `adsCamWidgetEnabled`.

## E) Verify

1. Hard-refresh a tube homepage and a video page (ad blockers hide slots).
2. Confirm Exo/Juicy dashboards show impressions within ~24h.
3. Popunder and fullscreen should each fire at most once per browser session
   (only after Exo fires `creativeDisplayed-{zoneId}`).
4. **Exo `<ins>` class** must be identical on every site that shares the same
   ExoClick publisher account (typically `eas6a97888e2`). A typo here leaves
   empty “Advertisement” gaps with no creative.
5. **Desktop Fullpage Interstitial** only fires after a real user click (Exo
   zone Trigger Method). Mobile Fullpage Interstitial is a separate Exo format —
   if mobile fullscreen is needed, create that zone and paste its ID into
   `exoZoneVideoFullscreen` (or keep desktop-only). Our embed uses the Exo
   zone-type class suffix (`…35` for desktop FPI, `…3` for popunder) and loads
   `magsrv` + `orbsrv` + `pemsrv` ad-provider scripts. Using only `magsrv` with
   the banner class (`…2`) makes FPI/popunder return `allowed_domains` errors.
6. **Mobile sticky** zones should be Exo format **Mobile Banner 320x50** (not
   Native). Wrong format still fills but looks broken / misaligned on mobile.
   If Exo leaves the sticky empty, the Juicy banner zone is used as fallback.
7. Home desktop: full-width video grid (min card width 250px); Exo sticky
   right sidebar; Juicy sits in the grid as a card-sized tile (cover-scaled
   300×250 Banner). Mobile: Exo banner above the grid.
8. Video desktop: Exo + Juicy side-by-side under the player; floating corner +
   in-video overlay activate when their Juicy zone IDs are set.
