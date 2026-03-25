# AI Discovery Redesign — "Discovery Channel"

**Date:** 2026-03-24
**Status:** Draft
**Scope:** Rethink the AI Pick feature from "shuffling known clips" to "discovering new clips not in the library"

---

## Problem

The current AI Pick feature asks Claude to suggest YouTube clips based on watch history. In practice, Claude suggests the same well-known internet clips that are already in the curated 416-clip library. The result feels indistinguishable from the normal "Blast Me" button — it's a fancier random selector, not a discovery engine.

## Goal

Transform AI Pick into a **continuous discovery channel** that surfaces clips the library doesn't already have. Discoveries can be saved personally (heart → localStorage, joins Blast Me rotation) or promoted into the permanent curated library via a review pipeline.

---

## Architecture Overview

### Buffer Model

The core change: `useAiDiscovery` becomes a **buffer manager** that keeps a queue of verified clips ahead of playback. The user sees a seamless stream; batch request boundaries are invisible.

```
[played] ← playhead → [current] → [buffered 3-5] → [fetching]
```

| Zone | Purpose |
|------|---------|
| **Played** | Clips watched this AI session. Sent as context to avoid re-suggesting. |
| **Current** | The clip on screen. |
| **Buffered** | 3-5 verified clips queued for playback. |
| **Fetching** | In-flight `/api/dial` request filling the buffer. |

**Refill trigger:** When `buffer.length < 2` and no request is in-flight and no error state, automatically fire a new batch request.

### Buffer States

| State | Condition | UI |
|-------|-----------|-----|
| Scanning | First request in-flight, buffer empty | Static overlay + "SCANNING..." |
| Playing | Current clip loaded | Normal playback + AI badge |
| Buffering | Clip ended, buffer empty, request in-flight | Brief "tuning signal..." overlay |
| Dried up | Buffer empty, no request in-flight (rate limited or error) | "Signal lost" + exit option |

---

## Server Pipeline (`/api/dial`)

### Request Flow

```
1. Auth gate
   ├─ Authorization header present → BYOK (unlimited)
   └─ No header → check free-tier rate limit (IP-based)
       ├─ Under limit → proceed
       └─ Over limit → 429 + X-RateLimit-Reset

2. Build prompt
   ├─ Load library fingerprint from scenes-data.js (videoIds only, ~5KB)
   ├─ Merge session-played clip IDs from request body
   ├─ Include last 20 watch history (vibes, eras, quotes — for taste)
   ├─ Include active filters (guide discovery direction)
   └─ Assemble "video archaeologist" prompt

3. Call Claude (Haiku 4.5, non-streaming, batch response)
   Note: Claude returns full JSON array, then pipeline below runs.
   Total time budget: Claude call (~2-3s) + parallel oEmbed checks (~3s).
   Well within Vercel's function timeout (300s default, 60s on Hobby).

4. Filter pipeline (per suggestion):
   → JSON parse + schema validation
   → Set type: "youtube" (all AI discoveries are YouTube-only)
   → Dedup against library (videoId in scenes-data.js → drop)
   → Dedup against session-played list (from request body → drop)
   → YouTube oEmbed verification in parallel (Promise.allSettled on all candidates)
     Note: oEmbed only checks existence, not embeddability. Some clips may
     have embedding disabled and fail at playback. The existing error-code
     auto-advance in ScenePlayer (codes 101/150) handles this gracefully —
     the clip auto-skips and the next buffered clip plays.
   → Stream each survivor as SSE event

5. Final event includes rate limit metadata
```

### Request Body

```json
{
  "watchHistory": [
    { "id": "techno-viking", "quote": "...", "vibes": [...], "era": "..." }
  ],
  "sessionPlayed": ["videoId1", "videoId2"],
  "currentVibes": ["chaotic-energy", "weird-flex"]
}
```

### Response (SSE)

```
data: {"scene": {"id": "ai-disc-1711324800-0", "videoId": "...", "start": 0, "end": 30, "quote": "...", "description": "...", "vibes": ["chaotic-energy"], "era": "viral-classics", "source": {"title": "...", "year": 2005}, "suggestedVibe": null, "_ai": true, "_verified": true, "_discoveredAt": 1711324800}}
data: {"scene": { ... }}
data: {"meta": {"remaining": 7, "resetsAt": "2026-03-25T00:00:00Z", "tier": "free"}}
data: [DONE]
```

---

## Prompt Design

### Role

"You are a deep-internet video archaeologist. Your job is to unearth YouTube clips that a pirate TV station doesn't already have."

### Context Sections

1. **Library fingerprint** — compact exclusion list of existing videoIds only (~5KB for 416 clips). Purpose: "Do NOT suggest any of these." Titles are omitted from the exclusion list to save tokens; they appear in the taste signal section where they add value.
2. **Session played** — videoIds already shown this session. Purpose: "Also avoid these."
3. **Taste signal** — last 20 watched clips with vibes/eras/quotes. Purpose: "The viewer gravitates toward this."
4. **Filter guidance** — if active filters, lean toward those vibes. If none, go wide.
5. **Freedom clause** — "You can suggest clips that don't fit existing categories. If a clip needs a new vibe, include a `suggestedVibe` field with your proposed name."

### Output Format

JSON array of 5 objects:

```json
{
  "videoId": "string (11 chars)",
  "start": 0,
  "end": 30,
  "quote": "Memorable line or moment description",
  "description": "Brief context",
  "vibes": ["existing-vibe"],
  "era": "viral-classics",
  "source": { "title": "Video/show title", "year": 2005 },
  "suggestedVibe": null
}
```

**Timestamp handling:** Claude's `start`/`end` values are best-effort — it's recalling from training data and may hallucinate timestamps. The client enforces a **max clip duration of 45 seconds**. If `end - start > 45`, clamp to `start + 45`. If `end <= start` or either value seems wrong (e.g., beyond video length), fall back to `start: 0, end: 30`. The player's existing end-time enforcement polling handles the rest.

**Type field:** All AI discoveries are `type: "youtube"` — set server-side in the sanitization step, not by Claude.

### Key Prompt Shift

Old: "Suggest well-known YouTube videos."
New: "Dig deep — find obscure, surprising, weird clips that fit this taste profile but aren't in our library."

---

## Rate Limiting

### Tiers

| Tier | Limit | Auth |
|------|-------|------|
| **Free** | 10 batch requests/day/IP (~20-30 discoveries) | No key needed |
| **BYOK** | Unlimited | User's Claude API key in Authorization header |

### Implementation

- Counter stored in Upstash Redis (via Vercel Marketplace): key `ratelimit:{ip}:{YYYY-MM-DD}`, TTL 24h
- IP sourced from Vercel's `x-real-ip` header (set at the edge, not spoofable by clients)
- Increment on each request, return remaining in response `meta`
- BYOK requests skip rate limit check entirely

### Cost Estimate (Free Tier)

- Haiku 4.5: ~$0.25/MTok input, $1.25/MTok output
- Per batch: ~2K input tokens, ~1K output tokens → ~$0.002/request
- At 10 requests/day, 50 users → ~$1/day worst case

### UI States

| Situation | UI |
|-----------|----|
| Free, remaining | "Discovery" button active, "N left today" badge |
| Free, exhausted | "Add API key for unlimited" prompt |
| BYOK active | "Discovery" button active, no limit badge |
| BYOK invalid | Inline error + "clear key" option, falls back to free tier check. On `INVALID_KEY`, stop sending the stored key on subsequent requests until user re-enters or clears it. |

---

## Client-Side Hook (`useAiDiscovery`)

### State

```js
{
  aiMode: boolean,
  buffer: Scene[],
  played: Scene[],
  current: Scene | null,
  fetching: boolean,
  rateMeta: { remaining: number, resetsAt: string, tier: string } | null,
  error: "RATE_LIMITED" | "SIGNAL_LOST" | "INVALID_KEY" | null
}
```

### Functions

| Function | Purpose |
|----------|---------|
| `enterDiscovery()` | Set `aiMode=true`, trigger first `refill()` |
| `advance()` | Move current → played, shift next from buffer, trigger refill if buffer < 2 |
| `exitDiscovery()` | Cancel in-flight request, reset state, return to normal mode |
| `refill()` | POST `/api/dial` with session context, append results to buffer, update rateMeta |

### Auto-Refill

`useEffect` watches `buffer.length` — when `< 2` and `!fetching` and `!error`, calls `refill()`.

Context sent with each refill:
- `watchHistory`: last 20 from normal mode (taste)
- `sessionPlayed`: last 50 videoIds played this AI session (capped to limit request size; full list tracked client-side for local dedup)
- `currentVibes`: active filter selections

---

## ScenePlayer UI Changes

### Button Changes

| Old | New |
|-----|-----|
| "AI Pick" | "Discovery" (📡) |
| "Next AI Clip" | Removed — clips auto-advance from buffer |
| "Exit AI" | "Exit" (✕) — unchanged |

### New Elements

- **Rate limit badge**: "N left today" when in free tier
- **Promote button**: appears alongside heart on AI clips. Sends scene to `/api/promote`. Gated by admin flag (`PROMOTE_SECRET` in localStorage — set via `?admin=SECRET` query param on first visit, or manually in DevTools).
- **BYOK upsell**: when free tier exhausted, inline prompt to add API key

### Playback Behavior

Clips auto-advance from the buffer — same as normal TV. No manual "next" button. The user watches, hearts what they like, exits when done.

---

## Blast Me Integration

Hearted AI discoveries join the normal Blast Me rotation:

- `useBlastEngine` currently receives only `SCENES` (curated array)
- Change: also include hearted favorites that have `_ai: true`
- These clips participate in the same weighted scoring (recency, vibe diversity, era diversity, jitter)
- Unhearted discoveries are ephemeral — they only exist during the AI session

---

## Promotion Pipeline

### `/api/promote` Endpoint

- **Method:** POST
- **Auth:** `X-Promote-Secret` header (shared secret)
- **Body:** Full scene object
- **Action:** Append to `promotion-queue.json` in Vercel Blob (dedup by videoId)
- **Response:** `{ queued: true, queueSize: N }`

### Review Flow (CLI Script)

`npm run review-promotions`:

1. Fetch `promotion-queue.json` from Vercel Blob
2. For each candidate:
   - Show title, quote, vibes, era, YouTube link
   - If `suggestedVibe` present, highlight it
   - Prompt: approve / reject / skip
3. Approved clips:
   - Generate proper kebab-case ID (replacing `ai-disc-*` temp ID)
   - Map or create vibes (review `suggestedVibe` — add to `filters.js` or map to existing)
   - Re-verify via oEmbed
   - Append to `scenes.js`
4. Remove processed clips from queue
5. Run `npm run sync-clips` to update `scenes-data.js`

### Future Enhancement

Admin page at `/review` (protected route) with inline YouTube previews and approve/reject buttons. Not in initial scope — CLI is sufficient.

---

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useAiDiscovery.js` | Rewrite as buffer manager with auto-refill |
| `api/dial.js` | Add auth gate, rate limiting, library dedup, session dedup, new prompt |
| `api/_lib/prompts.js` | New "video archaeologist" prompt, library fingerprint builder |
| `api/_lib/verify.js` | Unchanged |
| `api/_lib/claude.js` | Unchanged |
| `api/_lib/scenes-data.js` | Unchanged (already has library metadata) |
| `api/promote.js` | **New** — promotion queue endpoint |
| `src/components/ScenePlayer.jsx` | Update AI mode UI (remove "Next" button, add promote button, rate badge) |
| `src/hooks/useBlastEngine.js` | Accept hearted AI discoveries into scoring pool |
| `src/App.jsx` | Wire new hook API, pass promote handler to ScenePlayer |
| `scripts/review-promotions.mjs` | **New** — CLI for reviewing promotion queue |
| `src/hooks/useApiKey.js` | Unchanged |
| `src/lib/streamClient.js` | Minor — parse `meta` events in addition to `scene` events |

---

## Out of Scope

- Admin web UI for promotion review (CLI first)
- Non-YouTube discovery (Vimeo, Dailymotion — Claude's knowledge is YouTube-heavy)
- AI-generated vibes automatically added to `filters.js` (manual review on promotion)
- Persistent server-side discovery history (localStorage is sufficient)
- Multi-user discovery sharing
