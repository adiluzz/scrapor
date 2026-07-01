# Monetization — how to actually make money from ads

> Figures/network standings below are from mid-2026 research and shift over time.
> Verify current CPMs, minimums, and formats on each network before committing.

## Model

As a tube publisher your highest-value inventory is **video pre-roll (VAST/CPM)**,
supplemented by **popunders**, **banners**, and **in-page push**. Income is mostly
**CPM** (paid per 1000 impressions). Adult tube CPMs are typically low single
digits and vary heavily by GEO and traffic quality.

## Where to sign up (as a PUBLISHER, not advertiser)

Adult networks that provide VAST video zones:

| Network        | Why | Notes |
|----------------|-----|-------|
| **ExoClick**   | Largest, full format suite incl. in-stream VAST | Low payout minimum; good default |
| **TrafficStars** | Strong pre-roll video CPMs | Performance-focused |
| **JuicyAds**   | Easy onboarding | Video + popunders/banners |
| **HilltopAds** | Good format diversity incl. video | Low minimum |
| **EroAdvertising** | Solid European fill | |

(TrafficJunky is mostly advertiser-side for MindGeek/Pornhub inventory — less
relevant for a new independent publisher.) **Sign up with more than one** and let
them compete / act as fallback (our player already treats "no ad" gracefully).

## Integration steps (per network, all similar)

1. Create a **Publisher** account; complete KYC + payment details.
2. **Add & verify your domain** (`pisster.com`) — they review for compliance.
3. Create an ad zone of type **"Video Pre-roll (VAST)"** → you get a **VAST tag URL**.
4. Put that URL in `.env` as `VAST_TAG_URL` (per-site config; the player reads it
   via `/api/videos/{id}/ad-session`). Create extra zones for banner/popunder as
   desired and place them in the layout.
5. Set CORS / allowed domains on the zone; test that the tag returns an ad.
6. Get paid once you reach the **minimum payout** (wire, Paxum, crypto, etc.),
   usually net-15/30.

### How our player uses the tag

- On play intent the app opens an **ad session** and hands the VAST tag to the
  player, which fetches + parses it (native, **non-IMA** — Google IMA/AdSense ban
  adult content).
- Valid ad → preroll with a **Skip in N** button (skippable after the configured
  minimum). On `complete`/`skip` the client requests a stream grant.
- Empty/errored/timed-out VAST → **no ad shown**, auto-grant, content plays.
- The stream URL is only minted **after** the ad session is satisfied, so ads
  can't be bypassed to reach the video (see `docs`/section 4 of the plan).

Tune per site via `.env`: `AD_SKIP_SECONDS`, `AD_MIN_VIEW_SECONDS`, `AD_TIMEOUT_MS`.

## Compliance to launch legally

- **RTA meta tag** (already emitted site-wide) so filters can detect adult content.
- **18 U.S.C. 2257** record-keeping statement page.
- **Terms**, **Privacy**, **DMCA** pages, cookie/age-gate consent.
- Keep ad zones within each network's content rules. Networks can suspend payouts
  for policy or invalid-traffic violations — avoid incentivized clicks/bots.
