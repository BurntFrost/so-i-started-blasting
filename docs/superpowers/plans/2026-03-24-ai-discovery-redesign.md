# AI Discovery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AI Pick feature from a "shuffle known clips" button into a continuous discovery channel that finds clips not in the library, with buffer-based playback, hybrid free/BYOK rate limiting, and a promotion pipeline.

**Architecture:** Client-side buffer manager (`useAiDiscovery`) auto-refills from batch `/api/dial` requests. Server pipeline deduplicates against library + session, verifies via oEmbed, streams survivors as SSE. Rate limiting via Upstash Redis for free tier. Promotion queue via Vercel Blob + CLI review script.

**Tech Stack:** React 18, Vite 8, Vercel Serverless Functions, Upstash Redis (new), Vercel Blob (existing), Claude Haiku 4.5, SSE streaming

**Spec:** `docs/superpowers/specs/2026-03-24-ai-discovery-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `api/_lib/prompts.js` | Modify | New "video archaeologist" prompt, library fingerprint builder |
| `api/_lib/claude.js` | Modify | Add server-side key support (read from env when no BYOK key) |
| `api/_lib/ratelimit.js` | Create | Rate limit check/increment using Upstash Redis |
| `api/dial.js` | Modify | Auth gate, rate limiting, library dedup, session dedup, parallel oEmbed, meta events |
| `api/promote.js` | Create | Promotion queue endpoint (Vercel Blob) |
| `src/hooks/useAiDiscovery.js` | Rewrite | Buffer manager with auto-refill, rate meta tracking |
| `src/hooks/useBlastEngine.js` | Modify | Accept hearted AI discoveries into scoring pool |
| `src/hooks/useApiKey.js` | Modify | Handle INVALID_KEY clear flow, free-tier-first auth |
| `src/lib/streamClient.js` | Modify | Parse `meta` events, support optional auth (no key = no header) |
| `src/components/ScenePlayer.jsx` | Modify | New button states, promote button, rate badge, remove "Next AI Clip" |
| `src/App.jsx` | Modify | Wire new hook API, pass promote handler, merge AI favorites into pool |
| `scripts/review-promotions.mjs` | Create | CLI for reviewing promotion queue |
| `vercel.json` | Modify | Add `/api/promote` function config |
| `package.json` | Modify | Add `@upstash/redis` dependency, add `review-promotions` script |

---

## Task 1: Add Upstash Redis dependency and update vercel.json

**Files:**
- Modify: `package.json`
- Modify: `vercel.json`

- [ ] **Step 1: Install @upstash/redis**

```bash
cd /Users/steve/Code/so-i-started-blasting && npm install @upstash/redis
```

- [ ] **Step 2: Add review-promotions script to package.json**

In `package.json`, add to `"scripts"`:
```json
"review-promotions": "node scripts/review-promotions.mjs"
```

- [ ] **Step 3: Add /api/promote function config to vercel.json**

In `vercel.json`, add to `"functions"`:
```json
"api/promote.js": { "maxDuration": 10 }
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vercel.json
git commit -m "chore: add @upstash/redis dependency and promote endpoint config"
```

---

## Task 2: Rewrite prompt system (`api/_lib/prompts.js`)

**Files:**
- Modify: `api/_lib/prompts.js`
- Reference: `api/_lib/scenes-data.js` (for fingerprint shape)

- [ ] **Step 1: Add library fingerprint builder**

Add a function that imports `CLIPS` from `scenes-data.js` and returns a compact string of videoIds for the exclusion list:

```javascript
import { CLIPS } from "./scenes-data.js";

export function buildLibraryFingerprint() {
  return CLIPS.map((c) => c.videoId).filter(Boolean).join(", ");
}
```

- [ ] **Step 2: Add `buildDiscoveryPrompt` function**

Keep the existing `buildDialPrompt` for now (don't break current behavior). Add a new function:

```javascript
export function buildDiscoveryPrompt(watchHistory, currentVibes, sessionPlayed) {
  const fingerprint = buildLibraryFingerprint();

  const historyBlock = watchHistory.map((s) =>
    `- "${s.source?.title}" (${s.era}) [${s.vibes.join(", ")}] — "${s.quote}"`
  ).join("\n");

  const filterBlock = currentVibes.length > 0
    ? `The viewer has these vibe filters active: ${currentVibes.join(", ")}. Lean toward these vibes, but don't limit yourself exclusively to them.`
    : "No filters active. Suggest a diverse mix across vibes and eras.";

  const sessionBlock = sessionPlayed.length > 0
    ? `Already shown this session (also avoid): ${sessionPlayed.join(", ")}`
    : "";

  return `You are a deep-internet video archaeologist. Your job is to unearth YouTube clips that a pirate TV station doesn't already have.

The station already has these videos in its library (do NOT suggest any of these video IDs):
${fingerprint}

${sessionBlock}

Here is what the viewer has been watching recently (use this to understand their taste):
${historyBlock}

${filterBlock}

Dig deep. Find obscure, surprising, weird, or forgotten clips that fit this viewer's taste but are NOT in the library above. Think beyond the obvious viral hits — find the deep cuts, the cult favorites, the clips that got 500K views but never became mainstream memes.

You can suggest clips that don't fit existing categories. If a clip needs a new vibe tag that doesn't exist in the vocabulary below, include a "suggestedVibe" field with your proposed name. Otherwise set suggestedVibe to null.

${VOCABULARY_BLOCK}

Return ONLY a JSON array of exactly 5 objects (no markdown, no explanation):
{
  "videoId": "11-char YouTube video ID (you must be confident this exists)",
  "start": number (seconds — best estimate of an iconic 15-45 second segment),
  "end": number (seconds — must be > start, max 45 seconds after start),
  "quote": "memorable line, moment description, or lyric from this segment",
  "description": "1-2 sentences of context about what makes this clip notable",
  "vibes": ["vibe1"],
  "era": "era-key",
  "source": { "title": "Video or Show Title", "year": number },
  "suggestedVibe": null
}`;
}
```

- [ ] **Step 3: Verify file runs without errors**

```bash
node -e "import('./api/_lib/prompts.js').then(m => { console.log('fingerprint length:', m.buildLibraryFingerprint().length); console.log('prompt length:', m.buildDiscoveryPrompt([], [], []).length) })"
```

Expected: fingerprint length ~5000-6000, prompt length ~6000-7000

- [ ] **Step 4: Commit**

```bash
git add api/_lib/prompts.js
git commit -m "feat: add discovery prompt and library fingerprint builder"
```

---

## Task 3: Create rate limiting module (`api/_lib/ratelimit.js`)

**Files:**
- Create: `api/_lib/ratelimit.js`

- [ ] **Step 1: Create the rate limit module**

```javascript
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const FREE_TIER_LIMIT = 10; // batch requests per day per IP

/**
 * Check and increment rate limit for an IP.
 * Returns { allowed, remaining, resetsAt }
 */
export async function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `ratelimit:${ip}:${today}`;

  // Calculate reset time (midnight UTC)
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const resetsAt = tomorrow.toISOString();

  try {
    const count = await redis.incr(key);

    // Set TTL on first increment (48h buffer past midnight)
    if (count === 1) {
      await redis.expire(key, 60 * 60 * 48);
    }

    const remaining = Math.max(0, FREE_TIER_LIMIT - count);
    return {
      allowed: count <= FREE_TIER_LIMIT,
      remaining,
      resetsAt,
      tier: "free",
    };
  } catch (err) {
    // If Redis is unavailable, allow the request (fail open)
    console.error("Rate limit check failed:", err.message);
    return { allowed: true, remaining: FREE_TIER_LIMIT, resetsAt, tier: "free" };
  }
}
```

- [ ] **Step 2: Verify import works**

```bash
node -e "import('./api/_lib/ratelimit.js').then(() => console.log('OK'))"
```

Expected: OK (module loads, KV won't connect locally but that's fine)

- [ ] **Step 3: Commit**

```bash
git add api/_lib/ratelimit.js
git commit -m "feat: add rate limiting module using Upstash Redis"
```

---

## Task 4: Update Claude client for server-side key support (`api/_lib/claude.js`)

**Files:**
- Modify: `api/_lib/claude.js`

- [ ] **Step 1: Add server-side key fallback**

Update `callClaude` to accept an optional key and fall back to `process.env.ANTHROPIC_API_KEY`:

```javascript
export async function callClaude(apiKey, prompt) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("NO_API_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    // ... rest unchanged
```

The only change is the first two lines — resolve key from param or env. This supports both BYOK (key passed) and free tier (env var).

- [ ] **Step 2: Commit**

```bash
git add api/_lib/claude.js
git commit -m "feat: support server-side API key fallback in Claude client"
```

---

## Task 5: Rewrite `/api/dial.js` with auth gate, dedup, parallel verify, and meta events

**Files:**
- Modify: `api/dial.js`

- [ ] **Step 1: Rewrite the full handler**

Replace the entire file:

```javascript
import { callClaude } from "./_lib/claude.js";
import { buildDiscoveryPrompt, VALID_VIBES, VALID_ERAS } from "./_lib/prompts.js";
import { verifyVideo } from "./_lib/verify.js";
import { checkRateLimit } from "./_lib/ratelimit.js";
import { CLIPS } from "./_lib/scenes-data.js";

// Build a Set of existing library videoIds for fast dedup
const LIBRARY_IDS = new Set(CLIPS.map((c) => c.videoId).filter(Boolean));

function sanitizeScene(raw, index, batchTs) {
  if (!raw.videoId || typeof raw.videoId !== "string") return null;
  if (typeof raw.start !== "number" || typeof raw.end !== "number") return null;

  let start = Math.max(0, Math.floor(raw.start));
  let end = Math.floor(raw.end);

  // Clamp: max 45s duration, fallback if invalid
  if (end <= start || end - start > 45) {
    start = Math.max(0, start);
    end = start + 30;
  }

  const vibes = (raw.vibes || []).filter((v) => VALID_VIBES.includes(v));
  const era = VALID_ERAS.includes(raw.era) ? raw.era : "viral-classics";

  return {
    id: `ai-disc-${batchTs}-${index}`,
    type: "youtube",
    videoId: raw.videoId,
    start,
    end,
    quote: String(raw.quote || "").slice(0, 200),
    description: String(raw.description || "").slice(0, 300),
    vibes: vibes.length > 0 ? vibes : ["chaotic-energy"],
    era,
    source: {
      title: String(raw.source?.title || "Unknown").slice(0, 100),
      year: Number(raw.source?.year) || 2020,
    },
    suggestedVibe: raw.suggestedVibe && typeof raw.suggestedVibe === "string"
      ? raw.suggestedVibe.slice(0, 50)
      : null,
    _ai: true,
    _verified: true,
    _discoveredAt: batchTs,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ─── Auth gate ───
  const byokKey = req.headers.authorization?.replace("Bearer ", "") || null;
  let rateMeta = null;

  if (!byokKey) {
    // Free tier: check rate limit
    const ip = req.headers["x-real-ip"] || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
    rateMeta = await checkRateLimit(ip);

    if (!rateMeta.allowed) {
      res.setHeader("X-RateLimit-Reset", rateMeta.resetsAt);
      return res.status(429).json({
        error: "RATE_LIMITED",
        remaining: 0,
        resetsAt: rateMeta.resetsAt,
      });
    }

    // Free tier must have server-side key configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "Discovery unavailable" });
    }
  }

  const { watchHistory = [], sessionPlayed = [], currentVibes = [] } = req.body || {};

  // ─── SSE setup ───
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const prompt = buildDiscoveryPrompt(watchHistory, currentVibes, sessionPlayed);
    const text = await callClaude(byokKey, prompt);

    // Parse Claude's JSON response
    let suggestions;
    try {
      suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) throw new Error("Not an array");
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      suggestions = match ? JSON.parse(match[0]) : [];
    }

    const batchTs = Date.now();
    const sessionSet = new Set(sessionPlayed);

    // Sanitize and dedup
    const candidates = suggestions
      .map((raw, i) => sanitizeScene(raw, i, batchTs))
      .filter(Boolean)
      .filter((s) => !LIBRARY_IDS.has(s.videoId))      // dedup vs library
      .filter((s) => !sessionSet.has(s.videoId));        // dedup vs session

    // Verify all candidates in parallel
    const verifyResults = await Promise.allSettled(
      candidates.map(async (scene) => {
        const valid = await verifyVideo(scene.videoId);
        return { scene, valid };
      })
    );

    // Stream verified scenes
    for (const result of verifyResults) {
      if (result.status === "fulfilled" && result.value.valid) {
        res.write(`data: ${JSON.stringify({ scene: result.value.scene })}\n\n`);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  // Send rate limit metadata (for free tier)
  if (rateMeta) {
    res.write(`data: ${JSON.stringify({ meta: rateMeta })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ meta: { tier: "byok", remaining: null, resetsAt: null } })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
```

- [ ] **Step 2: Verify the file parses cleanly**

```bash
node -e "import('./api/dial.js').then(() => console.log('OK'))"
```

- [ ] **Step 3: Commit**

```bash
git add api/dial.js
git commit -m "feat: rewrite dial endpoint with auth gate, dedup, parallel verify, and meta events"
```

---

## Task 6: Create promotion endpoint (`api/promote.js`)

**Files:**
- Create: `api/promote.js`

- [ ] **Step 1: Create the promotion endpoint**

```javascript
import { put, list } from "@vercel/blob";

const QUEUE_FILE = "promotion-queue.json";

async function loadQueue() {
  try {
    const { blobs } = await list({ prefix: QUEUE_FILE });
    if (blobs.length === 0) return [];
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await put(QUEUE_FILE, JSON.stringify(queue, null, 2), {
    access: "public",
    addRandomSuffix: false,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check
  const secret = req.headers["x-promote-secret"];
  if (!secret || secret !== process.env.PROMOTE_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const scene = req.body;
  if (!scene?.videoId) {
    return res.status(400).json({ error: "Missing scene data" });
  }

  const queue = await loadQueue();

  // Dedup by videoId
  if (queue.some((s) => s.videoId === scene.videoId)) {
    return res.json({ queued: false, reason: "already_in_queue", queueSize: queue.length });
  }

  queue.push({
    ...scene,
    _promotedAt: Date.now(),
  });

  await saveQueue(queue);
  return res.json({ queued: true, queueSize: queue.length });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/promote.js
git commit -m "feat: add promotion queue endpoint backed by Vercel Blob"
```

---

## Task 7: Update stream client to parse meta events (`src/lib/streamClient.js`)

**Files:**
- Modify: `src/lib/streamClient.js`

- [ ] **Step 1: Add `onMeta` callback support**

The current `streamRequest` function signature is:
```javascript
export function streamRequest(url, apiKey, body, { onEvent, onDone, onError })
```

Update it to also accept `onMeta` and support optional auth (no apiKey = no Authorization header):

In the headers section (~line 24), change:
```javascript
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
},
```
to:
```javascript
headers: {
  "Content-Type": "application/json",
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
},
```

In the SSE parsing section (~line 58), after the error check, add meta handling:
```javascript
if (data.error) {
  onError?.(data.error);
} else if (data.meta) {
  onMeta?.(data.meta);
} else {
  onEvent?.(data);
}
```

Update the function signature to include `onMeta`:
```javascript
export function streamRequest(url, apiKey, body, { onEvent, onMeta, onDone, onError })
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/streamClient.js
git commit -m "feat: add meta event parsing and optional auth to stream client"
```

---

## Task 8: Rewrite `useAiDiscovery` as buffer manager

**Files:**
- Rewrite: `src/hooks/useAiDiscovery.js`

- [ ] **Step 1: Rewrite the full hook**

```javascript
import { useState, useCallback, useRef, useEffect, useReducer } from "react";
import { streamRequest } from "../lib/streamClient.js";
import { SCENES } from "../data/scenes.js";

const DISCOVERIES_KEY = "sisb-ai-discoveries";
const MAX_DISCOVERIES = 50;
const BUFFER_LOW = 2; // trigger refill when buffer drops below this

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function addDiscoveries(scenes) {
  const existing = loadJSON(DISCOVERIES_KEY, []);
  const merged = [...scenes, ...existing].slice(0, MAX_DISCOVERIES);
  saveJSON(DISCOVERIES_KEY, merged);
  return merged;
}

/**
 * Resolve favorite IDs that might be AI-discovered clips.
 * Merges curated SCENES with the AI discoveries log.
 */
export function getAllScenesForLookup() {
  const discoveries = loadJSON(DISCOVERIES_KEY, []);
  return [...SCENES, ...discoveries];
}

/**
 * Get hearted AI discoveries (for merging into blast pool).
 */
export function getHeartedDiscoveries(favoriteIds) {
  const favSet = new Set(favoriteIds);
  const discoveries = loadJSON(DISCOVERIES_KEY, []);
  return discoveries.filter((s) => favSet.has(s.id));
}

// ─── Reducer for atomic current/buffer/played transitions ───
const initialPlaybackState = { current: null, buffer: [], played: [] };

function playbackReducer(state, action) {
  switch (action.type) {
    case "RESET":
      return initialPlaybackState;
    case "ADD_TO_BUFFER": {
      // If nothing is playing, immediately set as current instead of buffering
      if (!state.current) {
        return { ...state, current: action.scene };
      }
      return { ...state, buffer: [...state.buffer, action.scene] };
    }
    case "ADVANCE": {
      const [next, ...rest] = state.buffer;
      return {
        current: next || null,
        buffer: rest,
        played: state.current ? [...state.played, state.current] : state.played,
      };
    }
    default:
      return state;
  }
}

export function useAiDiscovery(apiKey, history, favorites, activeFilters) {
  const [aiMode, setAiMode] = useState(false);
  const [playback, dispatch] = useReducer(playbackReducer, initialPlaybackState);
  const [fetching, setFetching] = useState(false);
  const [rateMeta, setRateMeta] = useState(null);
  const [error, setError] = useState(null); // "RATE_LIMITED" | "SIGNAL_LOST" | "INVALID_KEY" | null

  const abortRef = useRef(null);
  const fetchingRef = useRef(false); // ref mirror to avoid stale closures
  const playedRef = useRef([]); // ref mirror for played (used in callbacks)

  // Keep refs in sync
  useEffect(() => { playedRef.current = playback.played; }, [playback.played]);
  useEffect(() => { fetchingRef.current = fetching; }, [fetching]);

  // ─── Cancel any in-flight request ───
  function cancelStream() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  // ─── Exit discovery mode ───
  const exitDiscovery = useCallback(() => {
    cancelStream();
    // Save any played + buffered clips as discoveries before exiting
    const allDiscovered = [...playedRef.current, ...playback.buffer];
    if (allDiscovered.length > 0) addDiscoveries(allDiscovered);

    setAiMode(false);
    dispatch({ type: "RESET" });
    setFetching(false);
    setError(null);
  }, [playback.buffer]);

  // ─── Fetch a batch of discoveries ───
  const refill = useCallback(() => {
    // Use ref to avoid stale closure over fetching state
    if (fetchingRef.current) return;
    setFetching(true);

    // Resolve last 20 watch history IDs to full scene objects
    const recentIds = (history || []).slice(0, 20).map((h) => h.id || h);
    const watchHistory = recentIds
      .map((id) => SCENES.find((s) => s.id === id))
      .filter(Boolean);

    // Session-played videoIds (capped at 50 for request size)
    const sessionPlayed = playedRef.current
      .map((s) => s.videoId)
      .slice(0, 50);

    const accumulated = [];

    abortRef.current = streamRequest(
      "/api/dial",
      apiKey || null, // null = free tier (no auth header)
      { watchHistory, sessionPlayed, currentVibes: activeFilters || [] },
      {
        onEvent(data) {
          if (data.scene) {
            accumulated.push(data.scene);
            dispatch({ type: "ADD_TO_BUFFER", scene: data.scene });
          }
        },
        onMeta(meta) {
          setRateMeta(meta);
        },
        onDone() {
          setFetching(false);
          if (accumulated.length > 0) {
            addDiscoveries(accumulated);
          }
        },
        onError(err) {
          setFetching(false);
          if (err.includes("INVALID_KEY")) {
            setError("INVALID_KEY");
          } else if (err.includes("RATE_LIMITED") || err.includes("429")) {
            setError("RATE_LIMITED");
          } else {
            setError("SIGNAL_LOST");
          }
        },
      },
    );
  }, [apiKey, history, activeFilters]); // no `fetching` dep — uses fetchingRef instead

  // ─── Enter discovery mode ───
  const enterDiscovery = useCallback(() => {
    cancelStream();
    setAiMode(true);
    dispatch({ type: "RESET" });
    setFetching(false);
    setError(null);
    setRateMeta(null);
    // First refill triggered by the auto-refill useEffect below
  }, []);

  // ─── Advance to next clip ───
  const advance = useCallback(() => {
    dispatch({ type: "ADVANCE" });
  }, []);

  // ─── Auto-refill when buffer is low (also handles first refill on mode entry) ───
  useEffect(() => {
    if (!aiMode) return;
    if (playback.buffer.length < BUFFER_LOW && !fetching && !error) {
      refill();
    }
  }, [aiMode, playback.buffer.length, fetching, error, refill]);

  // ─── Error auto-clear after 3 seconds (for transient errors) ───
  useEffect(() => {
    if (error && error !== "RATE_LIMITED" && error !== "INVALID_KEY") {
      const timer = setTimeout(() => {
        setError(null);
        // Clearing error will trigger auto-refill via the useEffect above
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // ─── Derived state ───
  const isScanning = aiMode && fetching && !playback.current;
  const isBuffering = aiMode && !playback.current && !fetching && playback.buffer.length === 0 && !error;
  const isDriedUp = aiMode && !playback.current && playback.buffer.length === 0 && !fetching && !!error;

  return {
    // State
    aiMode,
    current: playback.current,
    buffer: playback.buffer,
    played: playback.played,
    fetching,
    rateMeta,
    error,
    isScanning,
    isBuffering,
    isDriedUp,
    // Actions
    enterDiscovery,
    advance,
    exitDiscovery,
  };
}
```

- [ ] **Step 2: Verify the module loads**

```bash
node -e "import('./src/hooks/useAiDiscovery.js').catch(e => console.log('Expected: React not available in Node, but module parsed'))"
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAiDiscovery.js
git commit -m "feat: rewrite useAiDiscovery as buffer manager with auto-refill"
```

---

## Task 9: Update `useBlastEngine` to include hearted AI discoveries

**Files:**
- Modify: `src/hooks/useBlastEngine.js`

- [ ] **Step 1: Import `getHeartedDiscoveries` and merge into pool**

At top of file, add import:
```javascript
import { getHeartedDiscoveries } from "./useAiDiscovery.js";
```

Change the `useBlastEngine` function signature to accept `favoriteIds`:
```javascript
export function useBlastEngine(scenes, favoriteIds = [])
```

Inside `getNext`, before the pool filtering, merge hearted discoveries:
```javascript
const getNext = useCallback(
  (filters = []) => {
    // Merge hearted AI discoveries into the pool
    const aiFaves = getHeartedDiscoveries(favoriteIds);
    const fullPool = [...scenes, ...aiFaves];

    const pool =
      !filters || filters.length === 0
        ? fullPool
        : fullPool.filter((s) => matchesFilters(s, filters));
    // ... rest unchanged, but replace `scenes` references in pickNext calls with `fullPool`
```

Also update the `pickNext` calls to use `fullPool` as the `allScenes` argument:
```javascript
const pick = preComputed && pool.some((s) => s.id === preComputed.id)
  ? preComputed
  : pickNext(pool, historyRef.current, fullPool);
// ...
const peeked = pickNext(pool, historyRef.current, fullPool);
```

**Important:** Add `favoriteIds` to the `useCallback` dependency array so `getNext` recomputes when favorites change:
```javascript
  }, [scenes, favoriteIds]);
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBlastEngine.js
git commit -m "feat: include hearted AI discoveries in blast engine pool"
```

---

## Task 10: Update `useApiKey` for INVALID_KEY clear flow

**Files:**
- Modify: `src/hooks/useApiKey.js`

- [ ] **Step 1: Add `markInvalid` function**

Add a new callback that marks the stored key as invalid without removing it (gives the user a chance to re-enter):

```javascript
const markInvalid = useCallback(() => {
  setKeyStatus("invalid");
}, []);
```

Return it from the hook:
```javascript
return { apiKey, keyStatus, hasKey, setApiKey, clearApiKey, markInvalid };
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useApiKey.js
git commit -m "feat: add markInvalid to useApiKey for INVALID_KEY handling"
```

---

## Task 11: Update `ScenePlayer.jsx` for new discovery UI

**Files:**
- Modify: `src/components/ScenePlayer.jsx`

This is the largest UI change. Key modifications:

- [ ] **Step 1: Update props interface**

Change the props the component accepts. Replace the old AI props:
```javascript
// Old props to remove/rename:
// aiMode, aiLoading, aiWaiting, aiError, onAiPick, onAiNext

// New props:
// discoveryMode (boolean), isScanning, isBuffering, isDriedUp, discoveryError,
// rateMeta, onEnterDiscovery, onAdvanceDiscovery, onExitDiscovery, onPromote,
// promoteEnabled (boolean)
```

Update the destructured props at the top of the component.

- [ ] **Step 2: Replace AI mode buttons**

Replace the AI mode button block (old lines ~438-486) with:

```jsx
{discoveryMode ? (
  <>
    {isScanning ? (
      <button className="ai-pick-btn ai-pick-btn-loading" disabled>
        ⟳ Scanning...
      </button>
    ) : isBuffering ? (
      <button className="ai-pick-btn ai-pick-btn-loading" disabled>
        ⟳ Tuning...
      </button>
    ) : null}
    <button className="ai-exit-btn" onClick={onExitDiscovery}>
      ✕ Exit
    </button>
  </>
) : (
  <>
    <button className="tv-blast-btn" onClick={onBlast}>
      ⚡ Blast Me
    </button>
    {aiEnabled && (
      <button className="ai-pick-btn" onClick={handleDiscoveryClick}>
        📡 Discovery
      </button>
    )}
    {aiEnabled && hasKey && !showKeyInput && (
      <button
        className="ai-key-btn"
        onClick={(e) => { e.stopPropagation(); setShowKeyPopover((p) => !p); }}
        title="Manage API key"
      >
        🔑
      </button>
    )}
  </>
)}
```

- [ ] **Step 3: Add promote button next to heart**

Near the favorite toggle button, add a promote button (visible only when `promoteEnabled` and in discovery mode):

```jsx
{discoveryMode && promoteEnabled && (
  <button
    className="promote-btn"
    onClick={() => onPromote?.(scene)}
    title="Submit for promotion"
  >
    ⬆️
  </button>
)}
```

- [ ] **Step 4: Add rate limit badge**

Below the buttons area, when in discovery mode and free tier:

```jsx
{discoveryMode && rateMeta?.tier === "free" && rateMeta.remaining != null && (
  <div className="rate-limit-badge">
    {rateMeta.remaining} discoveries left today
  </div>
)}
```

- [ ] **Step 5: Update overlay states**

Replace old AI overlays with new buffer states:

```jsx
{discoveryMode && isScanning && (
  <div className="ai-static-overlay">
    <div className="ai-static-snow" />
    <div className="ai-static-text">SCANNING...</div>
  </div>
)}
{discoveryMode && isBuffering && (
  <div className="ai-static-overlay">
    <div className="ai-static-snow" />
    <div className="ai-static-text">TUNING...</div>
  </div>
)}
{discoveryMode && isDriedUp && discoveryError === "RATE_LIMITED" && (
  <div className="ai-error-overlay">
    <div className="ai-static-snow" />
    <div className="ai-error-text">
      {hasKey ? "RATE LIMITED — TRY LATER" : "SIGNAL EXHAUSTED — ADD API KEY FOR UNLIMITED"}
    </div>
  </div>
)}
{discoveryMode && discoveryError === "SIGNAL_LOST" && (
  <div className="ai-error-overlay">
    <div className="ai-static-snow" />
    <div className="ai-error-text">SIGNAL LOST — RETRYING...</div>
  </div>
)}
{discoveryMode && discoveryError === "INVALID_KEY" && (
  <div className="ai-error-overlay">
    <div className="ai-static-snow" />
    <div className="ai-error-text">API KEY INVALID — RECONNECT</div>
  </div>
)}
```

- [ ] **Step 6: Rename all `onAiNext` references to `onAdvanceDiscovery`**

The existing ScenePlayer has `onAiNext`/`onAiNextRef` referenced in three locations that handle clip-ended events. All must be updated:
1. The `useRef` declaration: `const onAiNextRef = useRef(onAiNext)` → rename to `onAdvanceDiscoveryRef`
2. The ref sync `useEffect`: `onAiNextRef.current = onAiNext` → update accordingly
3. All `onEnded` handlers inside the player pool that call `onAiNextRef.current?.()` → use `onAdvanceDiscoveryRef.current?.()`

Search for all occurrences of `onAiNext` in the file and rename to `onAdvanceDiscovery`.

- [ ] **Step 7: Update AI badge text**

Change "AI PICK" to "DISCOVERY":
```jsx
{discoveryMode && <span className="ai-badge">DISCOVERY</span>}
```

- [ ] **Step 7: Update the `handleDiscoveryClick` function**

Replace `handleAiPickClick` with a simple pass-through — free tier doesn't require a key, so discovery always starts immediately. The BYOK upsell only appears after the free tier is exhausted (handled by the error/rate-limit UI states):

```javascript
function handleDiscoveryClick() {
  onEnterDiscovery?.();
}
```

- [ ] **Step 8: Add CSS for new elements**

In `App.jsx`'s CSS template literal, add styles for the promote button and rate limit badge:

```css
.promote-btn {
  background: none;
  border: 1px solid rgba(57, 255, 20, 0.3);
  color: #39ff14;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.2s;
}
.promote-btn:hover {
  border-color: #39ff14;
}
.rate-limit-badge {
  font-family: 'Special Elite', monospace;
  font-size: 11px;
  color: rgba(57, 255, 20, 0.5);
  text-align: center;
  margin-top: 4px;
}
```

- [ ] **Step 9: Commit**

```bash
git add src/components/ScenePlayer.jsx src/App.jsx
git commit -m "feat: update ScenePlayer UI for discovery mode with promote button and rate badge"
```

---

## Task 12: Wire everything together in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update imports**

Replace `useAiDiscovery, getAllScenesForLookup` import:
```javascript
import { useAiDiscovery, getAllScenesForLookup, getHeartedDiscoveries } from "./hooks/useAiDiscovery.js";
```

- [ ] **Step 2: Update hook initialization**

Replace the old `useAiDiscovery` destructuring (~line 1317) with:
```javascript
const {
  aiMode: discoveryMode,
  current: discoveryScene,
  isScanning, isBuffering, isDriedUp,
  rateMeta, error: discoveryError,
  enterDiscovery, advance: advanceDiscovery, exitDiscovery,
} = useAiDiscovery(apiKey, history, favoriteIds, activeFilters);
```

Update `useBlastEngine` to pass `favoriteIds`:
```javascript
const { current, nextUp, getNext, setCurrent } = useBlastEngine(SCENES, favoriteIds);
```

- [ ] **Step 3: Update handler callbacks**

Replace `handleAiEnd` and `handleExitAi`:

```javascript
// When a clip ends in discovery mode
const handleDiscoveryEnd = useCallback(() => {
  advanceDiscovery();
  // If discovery scene is now null (buffer empty + not fetching), exit
  // This is handled by the hook's derived state — isDriedUp will trigger UI
}, [advanceDiscovery]);

// Manual exit from discovery mode
const handleExitDiscovery = useCallback(() => {
  exitDiscovery();
  const next = getNext(activeFilters);
  if (next) addToHistory(next.id);
}, [exitDiscovery, getNext, activeFilters, addToHistory]);

// Promote a clip
const handlePromote = useCallback(async (scene) => {
  const secret = localStorage.getItem("sisb-promote-secret");
  if (!secret) return;

  try {
    const res = await fetch("/api/promote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Promote-Secret": secret,
      },
      body: JSON.stringify(scene),
    });
    const data = await res.json();
    if (data.queued) {
      setToastMessage("Clip submitted for promotion ⬆️");
    } else if (data.reason === "already_in_queue") {
      setToastMessage("Already in promotion queue");
    }
  } catch {
    setToastMessage("Promotion failed — try again");
  }
}, []);
```

- [ ] **Step 4: Add admin secret URL handler**

Add `promoteEnabled` state and a `useEffect` that reads `?admin=SECRET` from the URL:

```javascript
const [promoteEnabled, setPromoteEnabled] = useState(!!localStorage.getItem("sisb-promote-secret"));

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const adminSecret = params.get("admin");
  if (adminSecret) {
    localStorage.setItem("sisb-promote-secret", adminSecret);
    setPromoteEnabled(true);
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
  }
}, []);
```

- [ ] **Step 5: Update ScenePlayer props**

Replace the old ScenePlayer props block with:

```jsx
<ScenePlayer
  scene={discoveryMode ? discoveryScene : current}
  nextScene={discoveryMode ? null : nextUp}
  isFavorite={
    (discoveryMode ? discoveryScene : current)
      ? isFavorite((discoveryMode ? discoveryScene : current).id)
      : false
  }
  onToggleFavorite={handleToggleFavorite}
  hasInteracted={hasInteracted}
  onBlast={handleBlast}
  onEnterDiscovery={enterDiscovery}
  onAdvanceDiscovery={handleDiscoveryEnd}
  onExitDiscovery={handleExitDiscovery}
  onPromote={handlePromote}
  promoteEnabled={promoteEnabled}
  discoveryMode={discoveryMode}
  isScanning={isScanning}
  isBuffering={isBuffering}
  isDriedUp={isDriedUp}
  discoveryError={discoveryError}
  rateMeta={rateMeta}
  hasKey={hasKey}
  keyStatus={keyStatus}
  onSubmitKey={setApiKey}
  onClearKey={clearApiKey}
  aiEnabled={siteConfig?.aiEnabled ?? true}
/>
```

- [ ] **Step 6: Update the onEnded handler in ScenePlayer**

Make sure the `onEnded` callback in ScenePlayer calls `onAdvanceDiscovery` when in discovery mode instead of `onAiNext`.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire discovery mode, promote handler, and admin secret in App.jsx"
```

---

## Task 13: Create promotion review CLI script

**Files:**
- Create: `scripts/review-promotions.mjs`

- [ ] **Step 1: Create the review script**

```javascript
import { list } from "@vercel/blob";
import { readFileSync, writeFileSync, appendFileSync } from "fs";
import { createInterface } from "readline";

const QUEUE_FILE = "promotion-queue.json";

async function loadQueue() {
  const { blobs } = await list({ prefix: QUEUE_FILE });
  if (blobs.length === 0) {
    console.log("No promotion queue found.");
    return [];
  }
  const res = await fetch(blobs[0].url);
  return await res.json();
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function toKebab(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function main() {
  const queue = await loadQueue();
  if (queue.length === 0) {
    console.log("Queue is empty. Nothing to review.");
    process.exit(0);
  }

  console.log(`\n📋 ${queue.length} clips in promotion queue\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const approved = [];
  const remaining = [];

  for (const clip of queue) {
    console.log("─".repeat(60));
    console.log(`📺 ${clip.source?.title || "Unknown"} (${clip.source?.year || "?"})`);
    console.log(`   "${clip.quote}"`);
    console.log(`   Vibes: ${clip.vibes?.join(", ")}`);
    console.log(`   Era: ${clip.era}`);
    console.log(`   https://youtube.com/watch?v=${clip.videoId}&t=${clip.start}`);
    if (clip.suggestedVibe) {
      console.log(`   ⚡ Suggested new vibe: ${clip.suggestedVibe}`);
    }
    console.log();

    const answer = await prompt(rl, "  [a]pprove / [r]eject / [s]kip? ");

    if (answer.toLowerCase() === "a") {
      const id = toKebab(clip.source?.title || clip.videoId);
      approved.push({ ...clip, id, _promotedAt: undefined, _ai: undefined, _verified: undefined, _discoveredAt: undefined });
      console.log(`  ✅ Approved as "${id}"`);
    } else if (answer.toLowerCase() === "r") {
      console.log("  ❌ Rejected");
    } else {
      remaining.push(clip);
      console.log("  ⏭️  Skipped (stays in queue)");
    }
  }

  rl.close();

  console.log(`\n📊 Results: ${approved.length} approved, ${queue.length - approved.length - remaining.length} rejected, ${remaining.length} skipped`);

  if (approved.length > 0) {
    // Append to scenes.js
    const scenesPath = "src/data/scenes.js";
    const scenesContent = readFileSync(scenesPath, "utf-8");
    const insertPoint = scenesContent.lastIndexOf("];");

    const newEntries = approved.map((clip) => {
      const entry = {
        id: clip.id,
        videoId: clip.videoId,
        start: clip.start,
        end: clip.end,
        quote: clip.quote,
        description: clip.description,
        vibes: clip.vibes,
        era: clip.era,
        source: clip.source,
      };
      return `  ${JSON.stringify(entry, null, 2).replace(/\n/g, "\n  ")}`;
    }).join(",\n");

    const updated = scenesContent.slice(0, insertPoint) + ",\n" + newEntries + "\n" + scenesContent.slice(insertPoint);
    writeFileSync(scenesPath, updated);
    console.log(`\n📝 Added ${approved.length} clips to ${scenesPath}`);
    console.log("   Run: npm run sync-clips && git add -A && git commit");
  }

  // Save remaining items back to Blob (overwrites queue with only skipped items)
  const { put } = await import("@vercel/blob");
  await put("promotion-queue.json", JSON.stringify(remaining, null, 2), {
    access: "public",
    addRandomSuffix: false,
  });
  console.log(`\n📦 Queue updated: ${remaining.length} clips remain`);
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/review-promotions.mjs
git commit -m "feat: add CLI script for reviewing promotion queue"
```

---

## Task 14: Add PROMOTE_SECRET and KV environment variables

**Files:**
- Reference: Vercel dashboard / CLI

- [ ] **Step 1: Add Upstash Redis integration**

```bash
cd /Users/steve/Code/so-i-started-blasting && vercel integration add upstash
```

Follow the prompts to provision a Redis store. This auto-provisions `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (which `Redis.fromEnv()` reads automatically).

- [ ] **Step 2: Add PROMOTE_SECRET and ANTHROPIC_API_KEY env vars**

```bash
vercel env add PROMOTE_SECRET
vercel env add ANTHROPIC_API_KEY
```

- [ ] **Step 3: Pull env vars locally**

```bash
vercel env pull
```

- [ ] **Step 4: Verify .env.local has the new vars**

Check that `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PROMOTE_SECRET`, and `ANTHROPIC_API_KEY` are present.

---

## Task 15: Integration test — full flow locally

- [ ] **Step 1: Start the full-stack dev server**

```bash
vercel dev
```

- [ ] **Step 2: Test free tier discovery**

Open the app without a BYOK key. Click "📡 Discovery". Verify:
- Scanning overlay appears
- Clips start playing from the buffer
- Rate limit badge shows remaining count
- Clips auto-advance without a "Next" button

- [ ] **Step 3: Test BYOK discovery**

Add a Claude API key via the key input. Click "📡 Discovery". Verify:
- No rate limit badge
- Continuous playback works
- Hearting a clip saves it

- [ ] **Step 4: Test Blast Me integration**

Exit discovery mode. Heart an AI-discovered clip. Click "Blast Me" repeatedly. Verify the hearted discovery eventually appears in the normal rotation.

- [ ] **Step 5: Test promote flow**

Navigate to `?admin=YOUR_PROMOTE_SECRET`. Enter discovery mode. Click the ⬆️ promote button on a clip. Verify toast appears.

- [ ] **Step 6: Test edge cases**

- Let free tier exhaust → verify "add API key" prompt
- Test with invalid BYOK key → verify error + clear option
- Kill network mid-stream → verify "SIGNAL LOST" overlay + auto-retry

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for discovery mode"
```

---

## Task 16: Deploy and verify

- [ ] **Step 1: Deploy to preview**

```bash
vercel deploy
```

- [ ] **Step 2: Test on preview URL**

Run through the same flow from Task 15 on the preview deployment. Verify KV rate limiting works in production.

- [ ] **Step 3: Deploy to production**

```bash
vercel --prod
```
