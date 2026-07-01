# Scrapor

A Next.js video scraper for penetration testing. Scrapes video metadata from xhamster.com (title, tags, description, pornstars) and stores it in SQLite for search.

## Setup

```bash
nvm use node   # or: nvm use (uses .nvmrc)
npm install
npm run db:push   # create SQLite DB
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

- **Scrape Homepage** — Fetches all videos from the homepage, visits each video page, and saves title, tags, description, pornstars to the database
- **Search** — Search by video title, tags, or pornstar name
- Click a video card to open the original page in a new tab

## Download Videos

**Option 1: Fetch (preview clips only)** — No browser, fast. Full videos blocked (520); gets short previews.

```bash
npm run download-videos:fetch
```

**Option 2: Screen recording (full videos)** — Opens a real browser, plays each video in fullscreen at max quality, records the screen. Produces full-length videos.

```bash
npx playwright install chromium
npm run download-videos:record
LIMIT=2 npm run download-videos:record   # test with 2 videos
```

Videos saved to `downloads/{id}.webm`. The watch page plays both .mp4 and .webm.

## API

- `GET /api/scrape?page=1` — Quick scrape (homepage only, no DB)
- `GET /api/scrape?page=1&full=1` — Full scrape (homepage + each video page, saves to DB)
- `GET /api/videos?q=...&page=1` — List/search videos from DB

## Note

For authorized penetration testing only. Ensure you have proper authorization before running against any target.
