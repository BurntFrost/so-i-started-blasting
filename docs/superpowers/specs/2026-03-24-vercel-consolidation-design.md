# Vercel Consolidation & Platform Enhancements

**Date**: 2026-03-24
**Status**: Approved
**Scope**: Consolidate hosting to Vercel, add dead link sweeper cron, add rate limiting

---

## 1. Consolidate Hosting to Vercel

### Current State

- DNS (soistartedblasting.com) points to GitHub Pages via A/CNAME records
- GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the Vite SPA and deploys to GitHub Pages on every push to `main`
- Vercel auto-deploys `/api/*` serverless functions separately
- Two deployment pipelines for one app

### Target State

- DNS points to Vercel
- Vercel builds the Vite SPA + deploys API functions together (already configured: `vercel.json` has `"framework": "vite"`)
- Single deployment pipeline
- GitHub Actions workflow deleted (recoverable from git history)
- GitHub Pages disabled in repo settings

### Steps

1. Lower existing DNS TTL to 300 seconds at your registrar (do this 24+ hours before migration if possible)
2. Add `soistartedblasting.com` as a domain in Vercel Dashboard → Settings → Domains
3. Update DNS records at registrar to point at Vercel (Vercel provides the required records)
4. Verify the site loads correctly on the Vercel preview URL before DNS propagation completes
5. Disable GitHub Actions workflow by deleting `.github/workflows/deploy.yml` (recoverable from git history)
6. Disable GitHub Pages in repo Settings → Pages

### Gains

- Preview deployments on every PR
- Instant rollbacks via `vercel rollback`
- Single deploy pipeline
- Unlocks Vercel Firewall and Cron Jobs

### Risks

- DNS propagation can take up to 24-48 hours depending on upstream resolver caching (lowering TTL in advance mitigates this)
- No data loss risk — repo content unchanged

---

## 2. Dead Link Sweeper

### Architecture

```
Weekly cron (Sunday 6am UTC)
    → /api/sweep (Vercel Function, maxDuration: 60s)
        → Reads SCENES from api/_lib/scenes-data.js (shared copy of clip metadata)
        → Checks all clips via oEmbed/HEAD (50 concurrent, 3s timeout each)
        → Writes results JSON to Vercel Blob
        → If dead links found → creates GitHub Issue

On-demand
    → /api/sweep-report
        → Reads latest results from Vercel Blob
        → Returns JSON report
```

### New Files

| File | Purpose |
|------|---------|
| `api/sweep.js` | Cron handler — validates all clips, writes report, creates GitHub Issue |
| `api/sweep-report.js` | Returns latest sweep results from Blob |
| `api/_lib/scenes-data.js` | Exports clip metadata (id, videoId, type, videoUrl, source) extracted from scenes.js — lightweight copy for server-side use |
| `scripts/sync-clips.js` | Reads `src/data/scenes.js`, extracts validation-relevant fields, writes `api/_lib/scenes-data.js` |

### New Dependencies

| Package | Purpose |
|---------|---------|
| `@vercel/blob` | Stores sweep result JSON (~1KB, overwritten each run) |

### Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `BLOB_READ_WRITE_TOKEN` | Auto-provisioned via Vercel Blob Marketplace integration | Read/write sweep results |
| `GITHUB_TOKEN` | Personal access token with `repo` scope | Create GitHub Issues for dead links |
| `CRON_SECRET` | Vercel-generated | Verify cron invocations aren't from random visitors |

### vercel.json Changes

Add cron schedule:
```json
{
  "crons": [{ "path": "/api/sweep", "schedule": "0 6 * * 0" }]
}
```

### Function Configuration

```json
// vercel.json — add maxDuration for sweep
{
  "functions": {
    "api/sweep.js": { "maxDuration": 60 }
  }
}
```

**Timeout math**: 416 clips ÷ 50 concurrent × 3s timeout = ~25s worst case. 60s `maxDuration` provides comfortable headroom.

### Data Access (`api/_lib/scenes-data.js`)

Vercel serverless functions bundle separately from the Vite SPA — they cannot import from `src/`. Instead, `api/_lib/scenes-data.js` exports a lightweight array of clip metadata needed for validation:

```js
// Only the fields needed for sweep — not the full scene schema
export const CLIPS = [
  { id: "clip-id", videoId: "abc123", type: "youtube", source: "Show Name" },
  // ...
];
```

This file is generated from `src/data/scenes.js` via a build script (`scripts/sync-clips.js`) that extracts `id`, `videoId`, `type`, `videoUrl`, and `source.title`. Run it manually after adding clips, or add it as a pre-commit check. Keeping it in `api/_lib/` means it's bundled with the serverless functions.

### Sweep Logic (`api/sweep.js`)

1. Verify cron auth: `req.headers.authorization === \`Bearer ${process.env.CRON_SECRET}\`` (Vercel sends cron secret via `Authorization: Bearer <secret>`)
2. Import `CLIPS` from `api/_lib/scenes-data.js`
3. Build check URL per clip type:
   - `youtube` → `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
   - `vimeo` → `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`
   - `dailymotion` → `https://www.dailymotion.com/services/oembed?url=https://www.dailymotion.com/video/${videoId}`
   - `streamable` → `https://api.streamable.com/oembed.json?url=https://streamable.com/${videoId}`
   - `video` (direct URL) → `HEAD` request to `videoUrl`
4. Run checks with concurrency pool of 50, 3s timeout per request (`AbortSignal.timeout(3000)`)
5. Classify results:
   - HTTP 200 → healthy
   - HTTP 404/403 → dead
   - Timeout/network error → unknown (avoids false positives from rate limiting)
6. Write result to Vercel Blob (key: `sweep-report.json`, overwritten each run):
   ```json
   {
     "timestamp": "2026-03-24T06:00:00Z",
     "total": 416,
     "healthyCount": 410,
     "deadCount": 4,
     "unknownCount": 2,
     "dead": [
       { "id": "clip-id", "videoId": "abc123", "type": "youtube", "source": "Show Name" }
     ],
     "unknown": [
       { "id": "clip-id", "videoId": "def456", "type": "vimeo", "source": "Other Show" }
     ]
   }
   ```
   If the Blob write fails, return 500 with the error — this is the primary output and should not be silently swallowed.
7. If `dead.length > 0`, create a GitHub Issue:
   - **Title**: `🔗 Dead links found: X clips (YYYY-MM-DD)`
   - **Body**: Markdown table of dead clip IDs, video IDs, types, and source titles
   - **Labels**: `dead-links` (create label if it doesn't exist)
   - Issue creation is fire-and-forget — if it fails, the blob report is still written and the function returns success

### Report Endpoint (`api/sweep-report.js`)

- Reads latest blob, returns the JSON
- No authentication — clip health data is not sensitive
- Returns the stored Blob JSON directly: `{ timestamp, total, healthyCount, deadCount, unknownCount, dead: [...], unknown: [...] }`
- Returns `{ error: "No sweep data yet" }` if no blob exists

---

## 3. Rate Limiting on `/api/dial`

### Approach

Vercel Firewall WAF rules — configured in the Vercel dashboard, zero code changes.

### Rule Configuration

| Setting | Value |
|---------|-------|
| Path | `/api/dial` |
| Method | `POST` |
| Limit | 5 requests per 60 seconds |
| Key | Source IP |
| Action | `429 Too Many Requests` |

### Optional

Also rate limit `/api/validate` at 10 requests per 60 seconds per IP.

### Rationale

- Dashboard config over code: no dependencies, no Redis, no token bucket
- Enforced at the edge before function cold-starts — saves invocations and cost
- Changeable without redeploying
- BYOK model means abuse mostly costs the caller, but function invocations still cost the project owner

---

## Implementation Order

1. **Consolidate to Vercel** — must be first, enables cron jobs and firewall
2. **Dead link sweeper** — new files + dependency + env vars
3. **Rate limiting** — dashboard config only, no code
