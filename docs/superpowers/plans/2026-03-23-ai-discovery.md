# AI Discovery Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered video discovery via Channel Dial and VHS Tape interactions on the CRT TV, using the user's own Claude API key, streamed through Vercel serverless functions.

**Architecture:** Vite SPA stays as-is. Add Vercel serverless functions in `/api` that proxy Claude requests and verify YouTube videos via oEmbed. Client uses `fetch()` + `ReadableStream` to consume SSE-formatted streaming responses. Two new UI metaphors (dial knob + VHS slot) integrate into the existing CRT TV body. All AI state is managed by a single `useAiDiscovery` hook.

**Tech Stack:** Vite + React 18 (unchanged), Vercel Serverless Functions (Node.js), Anthropic Claude API (Haiku 4.5), YouTube oEmbed (verification), SSE over `fetch` + `ReadableStream`

**Spec:** `docs/superpowers/specs/2026-03-23-ai-discovery-design.md`

**Important context:**
- No test suite exists in this project. Validation = `node -c` syntax checks + dev server visual verification.
- All CSS lives in a template literal `const CSS` in `App.jsx` — new styles go there.
- The FILTERS array in `src/data/filters.js` is the canonical list of valid vibes/eras.
- `ScenePlayer.jsx` owns the CRT TV DOM structure. New hardware (dial, VHS slot) mounts adjacent to it, not inside it.
- The 3D flip for the Service Panel wraps the TV at the `App.jsx` level.
- The root `package.json` has `"type": "module"` — all files (including `api/`) use ESM (`import`/`export`).
- During AI loading, `ScenePlayer` may briefly show the last curated clip's info bar underneath the static overlay. This is expected — the overlay covers it.

---

### Task 1: Vercel Migration Setup

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json**

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

- [ ] **Step 2: Validate build still works**

Run: `npm run build`
Expected: Vite build completes, `dist/` directory created with no errors.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel.json for deployment migration"
```

---

### Task 2: API Utility Layer

**Files:**
- Create: `api/_lib/prompts.js`
- Create: `api/_lib/verify.js`
- Create: `api/_lib/claude.js`

These are shared utilities used by all three API endpoints.

- [ ] **Step 1: Create `api/_lib/prompts.js` — vocabulary + prompt templates**

This file defines the valid vibes/eras vocabulary and builds prompts for dial and tape modes. The vocabulary must match `src/data/filters.js` exactly.

```js
// The canonical vocabulary — must stay in sync with src/data/filters.js
export const VALID_VIBES = [
  "chaotic-energy", "dangerous", "epic-fight-scenes", "disturbing",
  "unhinged", "unhinged-wisdom", "unhinged-shorts", "cursed-content", "weird-flex",
  "wholesome-chaos", "chaotic-good", "pure-nostalgia", "awkward-gold", "epic-recovery",
  "iconic-cinema", "legendary-fails", "musical-mayhem", "synchronicity", "funny-revenge",
];

export const VALID_ERAS = ["early-internet", "viral-classics", "modern-chaos", "ancient-web"];

export const MODEL_ID = "claude-haiku-4-5-20251001";

const VOCABULARY_BLOCK = `
VALID VIBES (use ONLY these exact strings): ${VALID_VIBES.join(", ")}
VALID ERAS (use ONLY one of these): ${VALID_ERAS.join(", ")}
`;

export function buildDialPrompt(watchHistory, currentVibes) {
  const historyBlock = watchHistory.map((s) =>
    `- "${s.source?.title}" (${s.era}) [${s.vibes.join(", ")}] — "${s.quote}"`
  ).join("\n");

  const filterBlock = currentVibes.length > 0
    ? `The user currently has these vibe filters active: ${currentVibes.join(", ")}. Lean toward these vibes.`
    : "No filters active. Suggest a diverse mix.";

  return `You are a pirate TV signal decoder that finds YouTube clips people will love.

Here are the user's recent watches:
${historyBlock}

${filterBlock}

Suggest 5-8 YouTube video clips this person would enjoy. For each clip:
- Pick well-known, famous, or iconic YouTube videos (viral moments, movie scenes, TV clips, music videos, internet culture)
- Provide the real 11-character YouTube video ID (you must be confident it exists)
- Choose a specific 15-45 second segment with start and end timestamps in seconds
- Pick a memorable quote or moment description from that segment
- Tag with vibes and era from the vocabulary below

${VOCABULARY_BLOCK}

Return ONLY a JSON array (no markdown, no explanation). Each element:
{
  "videoId": "11-char YouTube ID",
  "start": number,
  "end": number,
  "quote": "memorable line or moment",
  "description": "brief context",
  "vibes": ["vibe1", "vibe2"],
  "era": "era-key",
  "source": { "title": "Video/Show Title", "year": number }
}`;
}

export function buildTapePrompt(watchHistory, favorites) {
  const historyBlock = watchHistory.map((s) =>
    `- "${s.source?.title}" (${s.era}) [${s.vibes.join(", ")}] — "${s.quote}"`
  ).join("\n");

  const favBlock = favorites.length > 0
    ? favorites.map((s) =>
        `- "${s.source?.title}" [${s.vibes.join(", ")}] — "${s.quote}"`
      ).join("\n")
    : "No favorites yet.";

  return `You are a pirate TV curator who assembles mystery VHS tapes based on someone's viewing tastes.

Study this person's watch history:
${historyBlock}

Their favorites:
${favBlock}

Create a themed VHS tape — a curated sequence of 4-6 YouTube clips that follow a mood arc (e.g., start weird, escalate to chaotic, end with something unexpectedly wholesome). The clips should tell a loose "story" through tone and vibe.

For each clip, pick well-known, famous, or iconic YouTube videos. You must be confident the video ID exists.

${VOCABULARY_BLOCK}

Return ONLY a JSON object (no markdown, no explanation):
{
  "name": "TAPE NAME IN ALL CAPS (creative, like a VHS label)",
  "theme": "One-sentence theme description",
  "clips": [
    {
      "videoId": "11-char YouTube ID",
      "start": number,
      "end": number,
      "quote": "memorable line or moment",
      "description": "brief context",
      "vibes": ["vibe1", "vibe2"],
      "era": "era-key",
      "source": { "title": "Video/Show Title", "year": number }
    }
  ]
}`;
}
```

- [ ] **Step 2: Create `api/_lib/verify.js` — oEmbed verification**

```js
const VALID_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Check if a YouTube video exists and is embeddable via oEmbed.
 * Returns true if the video is valid, false otherwise.
 */
export async function verifyVideo(videoId) {
  if (!VALID_ID_RE.test(videoId)) return false;

  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Create `api/_lib/claude.js` — Claude API client**

```js
import { MODEL_ID } from "./prompts.js";

/**
 * Call Claude API with the user's API key.
 * Returns the parsed text response.
 * Throws on API errors with a descriptive message.
 */
export async function callClaude(apiKey, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("INVALID_KEY");
    if (res.status === 429) throw new Error("RATE_LIMITED");
    throw new Error(`CLAUDE_ERROR: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}
```

- [ ] **Step 4: Validate syntax**

Run: `node -c api/_lib/prompts.js && node -c api/_lib/verify.js && node -c api/_lib/claude.js`
Expected: All three pass with no output.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/
git commit -m "feat: add API utility layer (claude client, oEmbed verify, prompts)"
```

---

### Task 3: API Endpoints

**Files:**
- Create: `api/validate.js`
- Create: `api/dial.js`
- Create: `api/tape.js`

- [ ] **Step 1: Create `api/validate.js` — key validation (non-streaming)**

```js
import { callClaude } from "./_lib/claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(400).json({ valid: false, error: "No API key provided" });
  }

  try {
    await callClaude(apiKey, "Respond with exactly: OK");
    return res.status(200).json({ valid: true });
  } catch (err) {
    return res.status(200).json({ valid: false, error: err.message });
  }
}
```

- [ ] **Step 2: Create `api/dial.js` — streaming channel dial endpoint**

```js
import { callClaude } from "./_lib/claude.js";
import { buildDialPrompt, VALID_VIBES, VALID_ERAS } from "./_lib/prompts.js";
import { verifyVideo } from "./_lib/verify.js";

function sanitizeScene(raw, index, batchTs) {
  // Validate and clean Claude's suggestions
  if (!raw.videoId || typeof raw.videoId !== "string") return null;
  if (typeof raw.start !== "number" || typeof raw.end !== "number") return null;
  if (raw.end <= raw.start) return null;

  const vibes = (raw.vibes || []).filter((v) => VALID_VIBES.includes(v));
  const era = VALID_ERAS.includes(raw.era) ? raw.era : "viral-classics";

  return {
    id: `ai-dial-${batchTs}-${index}`,
    videoId: raw.videoId,
    start: Math.max(0, Math.floor(raw.start)),
    end: Math.floor(raw.end),
    quote: String(raw.quote || "").slice(0, 200),
    description: String(raw.description || "").slice(0, 300),
    vibes: vibes.length > 0 ? vibes : ["chaotic-energy"],
    era,
    source: {
      title: String(raw.source?.title || "Unknown").slice(0, 100),
      year: Number(raw.source?.year) || 2020,
    },
    _ai: true,
    _verified: true,
    _discoveredAt: batchTs,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(400).json({ error: "No API key" });
  }

  const { watchHistory = [], currentVibes = [] } = req.body || {};

  // Set up SSE streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const prompt = buildDialPrompt(watchHistory, currentVibes);
    const text = await callClaude(apiKey, prompt);

    // Parse Claude's JSON response
    let suggestions;
    try {
      suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) throw new Error("Not an array");
    } catch {
      // Try extracting JSON array from response
      const match = text.match(/\[[\s\S]*\]/);
      suggestions = match ? JSON.parse(match[0]) : [];
    }

    // Verify and stream each suggestion (batchTs shared across all scenes in this request)
    const batchTs = Date.now();
    for (let i = 0; i < suggestions.length; i++) {
      const scene = sanitizeScene(suggestions[i], i, batchTs);
      if (!scene) continue;

      const valid = await verifyVideo(scene.videoId);
      if (!valid) continue;

      res.write(`data: ${JSON.stringify({ scene })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
```

- [ ] **Step 3: Create `api/tape.js` — streaming VHS tape endpoint**

```js
import { callClaude } from "./_lib/claude.js";
import { buildTapePrompt, VALID_VIBES, VALID_ERAS } from "./_lib/prompts.js";
import { verifyVideo } from "./_lib/verify.js";

function sanitizeScene(raw, index) {
  if (!raw.videoId || typeof raw.videoId !== "string") return null;
  if (typeof raw.start !== "number" || typeof raw.end !== "number") return null;
  if (raw.end <= raw.start) return null;

  const vibes = (raw.vibes || []).filter((v) => VALID_VIBES.includes(v));
  const era = VALID_ERAS.includes(raw.era) ? raw.era : "viral-classics";
  const ts = Date.now();

  return {
    id: `ai-tape-${ts}-${index}`,
    videoId: raw.videoId,
    start: Math.max(0, Math.floor(raw.start)),
    end: Math.floor(raw.end),
    quote: String(raw.quote || "").slice(0, 200),
    description: String(raw.description || "").slice(0, 300),
    vibes: vibes.length > 0 ? vibes : ["chaotic-energy"],
    era,
    source: {
      title: String(raw.source?.title || "Unknown").slice(0, 100),
      year: Number(raw.source?.year) || 2020,
    },
    _ai: true,
    _verified: true,
    _discoveredAt: batchTs,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(400).json({ error: "No API key" });
  }

  const { watchHistory = [], favorites = [] } = req.body || {};

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const prompt = buildTapePrompt(watchHistory, favorites);
    const text = await callClaude(apiKey, prompt);

    // Parse Claude's JSON response
    let tapeData;
    try {
      tapeData = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      tapeData = match ? JSON.parse(match[0]) : null;
    }

    if (!tapeData || !Array.isArray(tapeData.clips)) {
      throw new Error("Invalid tape format");
    }

    // Stream tape metadata first
    res.write(`data: ${JSON.stringify({
      tape: {
        name: String(tapeData.name || "MYSTERY TAPE").slice(0, 60),
        theme: String(tapeData.theme || "").slice(0, 200),
      }
    })}\n\n`);

    // Verify and stream each clip (batchTs shared across all scenes)
    const batchTs = Date.now();
    for (let i = 0; i < tapeData.clips.length; i++) {
      const scene = sanitizeScene(tapeData.clips[i], i, batchTs);
      if (!scene) continue;

      const valid = await verifyVideo(scene.videoId);
      if (!valid) continue;

      res.write(`data: ${JSON.stringify({ scene })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
```

- [ ] **Step 4: Validate syntax**

Run: `node -c api/validate.js && node -c api/dial.js && node -c api/tape.js`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add api/validate.js api/dial.js api/tape.js
git commit -m "feat: add streaming API endpoints for dial, tape, and key validation"
```

---

### Task 4: Client-Side Streaming & API Key Hook

**Files:**
- Create: `src/lib/streamClient.js`
- Create: `src/hooks/useApiKey.js`

- [ ] **Step 1: Create `src/lib/streamClient.js` — fetch + ReadableStream SSE parser**

```js
/**
 * Make a streaming POST request and call onEvent for each SSE "data:" line.
 * Returns an AbortController so the caller can cancel the stream.
 *
 * @param {string} url - API endpoint
 * @param {string} apiKey - Claude API key (sent as Bearer token)
 * @param {object} body - JSON request body
 * @param {(data: object) => void} onEvent - called for each parsed SSE event
 * @param {() => void} onDone - called when stream ends
 * @param {(error: string) => void} onError - called on errors
 * @returns {AbortController}
 */
export function streamRequest(url, apiKey, body, { onEvent, onDone, onError }) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onError?.(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            onDone?.();
            return;
          }

          try {
            const data = JSON.parse(payload);
            if (data.error) {
              onError?.(data.error);
            } else {
              onEvent?.(data);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // Stream ended without [DONE] — still notify
      onDone?.();
    } catch (err) {
      if (err.name !== "AbortError") {
        onError?.(err.message || "Network error");
      }
    }
  })();

  return controller;
}
```

- [ ] **Step 2: Create `src/hooks/useApiKey.js` — localStorage API key management**

```js
import { useState, useCallback } from "react";

const STORAGE_KEY = "sisb-api-key";

function loadKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState(loadKey);
  // Start as "connected" if a saved key exists — avoids a validation call on every page load.
  // Trade-off: if the key was revoked since last visit, UI shows green LED until next API call fails.
  // This is acceptable because the real validation happens on first dial/tape use.
  const [keyStatus, setKeyStatus] = useState(
    loadKey() ? "connected" : "empty",
  ); // "empty" | "validating" | "connected" | "invalid"

  const setApiKey = useCallback(async (key) => {
    if (!key) {
      setApiKeyState("");
      setKeyStatus("empty");
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return;
    }

    setApiKeyState(key);
    setKeyStatus("validating");

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
      });
      const data = await res.json();

      if (data.valid) {
        try { localStorage.setItem(STORAGE_KEY, key); } catch {}
        setKeyStatus("connected");
      } else {
        setKeyStatus("invalid");
      }
    } catch {
      setKeyStatus("invalid");
    }
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState("");
    setKeyStatus("empty");
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const hasKey = keyStatus === "connected";

  return { apiKey, keyStatus, hasKey, setApiKey, clearApiKey };
}
```

- [ ] **Step 3: Validate syntax**

Run: `node -c src/lib/streamClient.js && node -c src/hooks/useApiKey.js`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/streamClient.js src/hooks/useApiKey.js
git commit -m "feat: add SSE stream client and API key management hook"
```

---

### Task 5: AI Discovery Hook

**Files:**
- Create: `src/hooks/useAiDiscovery.js`

This is the central state manager for all AI features — dial results, tape data, tape shelf, discovery log.

- [ ] **Step 1: Create `src/hooks/useAiDiscovery.js`**

```js
import { useState, useCallback, useRef } from "react";
import { streamRequest } from "../lib/streamClient.js";
import { SCENES } from "../data/scenes.js";

const TAPES_KEY = "sisb-tapes";
const DISCOVERIES_KEY = "sisb-ai-discoveries";
const MAX_TAPES = 5;
const MAX_DISCOVERIES = 50;

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

export function useAiDiscovery(apiKey, history, favorites, activeFilters) {
  // AI mode: null | "dial" | "tape"
  const [aiMode, setAiMode] = useState(null);

  // Dial state
  const [dialResults, setDialResults] = useState([]);
  const [dialIndex, setDialIndex] = useState(0);
  const [dialLoading, setDialLoading] = useState(false);
  const [dialStreamDone, setDialStreamDone] = useState(false);

  // Tape state
  const [tapeData, setTapeData] = useState(null); // { name, theme, clips: [] }
  const [tapeIndex, setTapeIndex] = useState(0);
  const [tapeLoading, setTapeLoading] = useState(false);
  const [tapeStreamDone, setTapeStreamDone] = useState(false);

  // Tape shelf (persisted)
  const [tapeShelf, setTapeShelf] = useState(() => loadJSON(TAPES_KEY, []));

  // Error state
  const [aiError, setAiError] = useState(null);

  // Abort controller for cancelling streams
  const abortRef = useRef(null);

  // ─── Current scene being played in AI mode ───
  const currentAiScene =
    aiMode === "dial"
      ? dialResults[dialIndex] || null
      : aiMode === "tape"
        ? tapeData?.clips?.[tapeIndex] || null
        : null;

  // ─── Helpers ───
  function cancelStream() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  function exitAiMode() {
    cancelStream();
    setAiMode(null);
    setDialResults([]);
    setDialIndex(0);
    setDialLoading(false);
    setDialStreamDone(false);
    setTapeData(null);
    setTapeIndex(0);
    setTapeLoading(false);
    setTapeStreamDone(false);
    setAiError(null);
  }

  // ─── Channel Dial ───
  const spinDial = useCallback(() => {
    cancelStream();
    setAiMode("dial");
    setDialResults([]);
    setDialIndex(0);
    setDialLoading(true);
    setDialStreamDone(false);
    setAiError(null);

    // Resolve last 20 watch history IDs to full scene objects
    const recentIds = (history || []).slice(0, 20).map((h) => h.id || h);
    const watchHistory = recentIds
      .map((id) => SCENES.find((s) => s.id === id))
      .filter(Boolean);

    const accumulated = [];

    abortRef.current = streamRequest("/api/dial", apiKey, { watchHistory, currentVibes: activeFilters || [] }, {
      onEvent(data) {
        if (data.scene) {
          accumulated.push(data.scene);
          setDialResults([...accumulated]);
          if (accumulated.length === 1) setDialLoading(false);
        }
      },
      onDone() {
        setDialStreamDone(true);
        setDialLoading(false);
        if (accumulated.length > 0) {
          addDiscoveries(accumulated);
        } else {
          setAiError("DEAD_AIR");
        }
      },
      onError(err) {
        setDialLoading(false);
        setAiError(err.includes("INVALID_KEY") ? "INVALID_KEY" : "SIGNAL_LOST");
      },
    });
  }, [apiKey, history, activeFilters]);

  // ─── VHS Tape ───
  const insertTape = useCallback(() => {
    cancelStream();
    setAiMode("tape");
    setTapeData(null);
    setTapeIndex(0);
    setTapeLoading(true);
    setTapeStreamDone(false);
    setAiError(null);

    // Resolve last 50 history + favorites to full scene objects
    const recentIds = (history || []).slice(0, 50).map((h) => h.id || h);
    const watchHistory = recentIds
      .map((id) => SCENES.find((s) => s.id === id))
      .filter(Boolean);

    const allScenes = getAllScenesForLookup();
    const favIds = (favorites || []).slice(0, 20);
    const favScenes = favIds
      .map((id) => allScenes.find((s) => s.id === id))
      .filter(Boolean);

    let tapeMeta = null;
    const clips = [];

    abortRef.current = streamRequest("/api/tape", apiKey, {
      watchHistory,
      favorites: favScenes,
    }, {
      onEvent(data) {
        if (data.tape) {
          tapeMeta = data.tape;
          setTapeData({ ...tapeMeta, clips: [] });
        }
        if (data.scene) {
          clips.push(data.scene);
          setTapeData((prev) => ({
            ...(prev || tapeMeta || { name: "MYSTERY TAPE", theme: "" }),
            clips: [...clips],
          }));
          if (clips.length === 1) setTapeLoading(false);
        }
      },
      onDone() {
        setTapeStreamDone(true);
        setTapeLoading(false);
        if (clips.length > 0) {
          addDiscoveries(clips);
          // Auto-save tape to shelf
          const tape = {
            name: tapeMeta?.name || "MYSTERY TAPE",
            theme: tapeMeta?.theme || "",
            clips: [...clips],
            savedAt: Date.now(),
          };
          setTapeShelf((prev) => {
            const updated = [tape, ...prev].slice(0, MAX_TAPES);
            saveJSON(TAPES_KEY, updated);
            return updated;
          });
        } else {
          setAiError("BAD_TAPE");
        }
      },
      onError(err) {
        setTapeLoading(false);
        setAiError(err.includes("INVALID_KEY") ? "INVALID_KEY" : "SIGNAL_LOST");
      },
    });
  }, [apiKey, history, favorites]);

  // ─── Play saved tape from shelf ───
  const playSavedTape = useCallback((tape) => {
    cancelStream();
    setAiMode("tape");
    setTapeData(tape);
    setTapeIndex(0);
    setTapeLoading(false);
    setTapeStreamDone(true);
    setAiError(null);
  }, []);

  // ─── Advance to next clip (called by onBlast routing) ───
  // Returns true if AI mode just ended (so App.jsx can trigger a fresh curated scene)
  const advanceAi = useCallback(() => {
    if (aiMode === "dial") {
      const nextIdx = dialIndex + 1;
      if (nextIdx < dialResults.length) {
        setDialIndex(nextIdx);
        return false;
      } else if (dialStreamDone) {
        exitAiMode();
        return true; // signal: AI mode ended naturally
      }
      // else: buffer empty, waiting for more clips — stay on static
      return false;
    } else if (aiMode === "tape") {
      const nextIdx = tapeIndex + 1;
      if (nextIdx < (tapeData?.clips?.length || 0)) {
        setTapeIndex(nextIdx);
        return false;
      } else {
        exitAiMode();
        return true; // signal: AI mode ended naturally
      }
    }
    return false;
  }, [aiMode, dialIndex, dialResults.length, dialStreamDone, tapeIndex, tapeData?.clips?.length]);

  return {
    // State
    aiMode,
    currentAiScene,
    dialResults,
    dialIndex,
    dialLoading,
    dialStreamDone,
    tapeData,
    tapeIndex,
    tapeLoading,
    tapeStreamDone,
    tapeShelf,
    aiError,
    // Actions
    spinDial,
    insertTape,
    playSavedTape,
    advanceAi,
    exitAiMode,
  };
}
```

- [ ] **Step 2: Validate syntax**

Run: `node -c src/hooks/useAiDiscovery.js`
Expected: Passes.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAiDiscovery.js
git commit -m "feat: add useAiDiscovery hook (dial, tape, shelf state management)"
```

---

### Task 6: Service Panel Component

**Files:**
- Create: `src/components/ServicePanel.jsx`
- Modify: `src/App.jsx` (add CSS for service panel + 3D flip container)

The Service Panel is the "back of the TV" where users enter their API key.

- [ ] **Step 1: Create `src/components/ServicePanel.jsx`**

The component renders the back panel content: model sticker, signal decoder port (input), status LED, and a close/flip-back button.

Props:
- `apiKey` — current key value
- `keyStatus` — "empty" | "validating" | "connected" | "invalid"
- `onSubmitKey` — called with the pasted key string
- `onClearKey` — clears the saved key
- `onClose` — flips TV back to front

Key behaviors:
- Input field styled as a hardware port with monospace font
- On paste (`onPaste` event), extract text and call `onSubmitKey`
- LED: red dot (`keyStatus === "empty" || "invalid"`), yellow pulsing (`"validating"`), green solid (`"connected"`)
- Auto-close: when `keyStatus` transitions to `"connected"`, call `onClose` after 1 second timeout
- Error label under port: `"NO SIGNAL — CHECK DECODER"` when `keyStatus === "invalid"`
- First-time label: `"CONNECT DECODER TO RECEIVE PIRATE SIGNALS"` when `keyStatus === "empty"`

- [ ] **Step 2: Add CSS for Service Panel and 3D flip to `App.jsx`**

Add these styles to the `CSS` template literal in `App.jsx`. Key classes:

- `.tv-flip-container` — wraps the entire `.crt-tv`, sets `perspective: 1200px`
- `.tv-flip-inner` — the flipping element, `transform-style: preserve-3d`, `transition: transform 0.6s`
- `.tv-flip-inner.flipped` — `transform: rotateY(180deg)`
- `.tv-front` — `backface-visibility: hidden`
- `.tv-back` — `backface-visibility: hidden; transform: rotateY(180deg)`, styled as a dark textured surface
- `.service-panel` — the back panel layout with padding, dark background
- `.service-sticker` — faux product label with monospace, slightly rotated
- `.service-port` — input wrapper styled with inset shadow, metallic border
- `.service-port input` — monospace, transparent bg, green text
- `.service-led` — small circle with conditional colors (CSS classes: `.led-red`, `.led-yellow`, `.led-green`)
- `.service-label` — small helper text below port
- `.tv-flip-trigger` — the small screw/latch button on the TV bezel corner (absolute positioned)

- [ ] **Step 3: Validate syntax and visual check**

Run: `node -c src/components/ServicePanel.jsx && npm run build`
Expected: Both pass. Visual check comes after Task 9 integration.

- [ ] **Step 4: Commit**

```bash
git add src/components/ServicePanel.jsx src/App.jsx
git commit -m "feat: add Service Panel component and 3D flip CSS"
```

---

### Task 7: Channel Dial Component

**Files:**
- Create: `src/components/ChannelDial.jsx`
- Modify: `src/App.jsx` (add CSS for dial)

- [ ] **Step 1: Create `src/components/ChannelDial.jsx`**

Props:
- `powered` — boolean, whether the API key is connected
- `active` — boolean, whether dial mode is currently active
- `loading` — boolean, whether the stream is in progress
- `onSpin` — callback to activate the dial

Visual structure:
- Outer container positioned to the right of the TV bezel (absolute positioned within the TV body)
- Dial knob: circular div with radial gradient, metallic/bakelite look
- Position indicators: small tick marks around the knob (numbered 2-13 for normal channels)
- Pirate zone: a red/glitchy section past the numbers with `◀▮▮▶` or `📡` symbol
- When `!powered`: dim opacity (0.3), cursor: default, no glow
- When `powered`: subtle green glow, cursor: pointer
- When `active`: knob rotated to pirate zone position, red glow pulsing
- When `loading`: pirate zone pulses with animation

Click handler: if powered and not loading, call `onSpin`

- [ ] **Step 2: Add CSS for Channel Dial to `App.jsx`**

Key classes:
- `.channel-dial` — absolute positioning on right side of `.tv-body`
- `.dial-knob` — circular, radial gradient, `transition: transform 0.3s`
- `.dial-knob.active` — `transform: rotate(220deg)` (rotated to pirate zone)
- `.dial-tick` — small position indicator marks
- `.dial-pirate-zone` — red tinted area, `cursor: pointer`
- `.dial-unpowered` — `opacity: 0.3; pointer-events: none`
- `.dial-powered` — subtle glow animation
- `.dial-scanning` — pulsing red glow keyframes

- [ ] **Step 3: Validate syntax and build**

Run: `node -c src/components/ChannelDial.jsx && npm run build`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChannelDial.jsx src/App.jsx
git commit -m "feat: add Channel Dial component with pirate zone interaction"
```

---

### Task 8: VHS Slot + Tape Shelf Components

**Files:**
- Create: `src/components/VHSSlot.jsx`
- Create: `src/components/TapeShelf.jsx`
- Modify: `src/App.jsx` (add CSS for VHS slot and tape shelf)

- [ ] **Step 1: Create `src/components/VHSSlot.jsx`**

Props:
- `powered` — boolean, API key connected
- `active` — boolean, tape mode currently active
- `loading` — boolean, stream in progress
- `tapeName` — string or null, the current tape's generated name
- `onInsert` — callback to generate a new tape

Visual structure:
- Horizontal slit below the TV screen area
- Tape edge peeking out with a hand-written label (tapeName or "MYSTERY TAPE")
- When `!powered`: dim, no label
- When `powered`: subtle glow, tape label visible as "???" or "INSERT TAPE"
- When `active`: tape pushed in (translateY animation), blue VCR indicator
- When `loading`: tape partially inserted, pulsing

Click handler: if powered and not active and not loading, call `onInsert`

- [ ] **Step 2: Create `src/components/TapeShelf.jsx`**

Props:
- `tapes` — array of saved tape objects `[{ name, theme, clips, savedAt }]`
- `onPlay` — callback called with tape object when user clicks a cassette

Visual structure:
- Row of small cassette icons rendered near the VHS slot
- Each cassette is a small rectangular div styled like a VHS cassette
- Shows tape name on hover (title attribute or a tooltip)
- Max 5 visible
- Empty state: no cassettes rendered (shelf is invisible)

- [ ] **Step 3: Add CSS for VHS Slot and Tape Shelf to `App.jsx`**

Key classes:
- `.vhs-slot` — horizontal bar below `.tv-bezel`, styled as a dark slit with inset shadow
- `.vhs-tape` — the tape element, with slide-in animation
- `.vhs-tape-label` — handwritten font (Special Elite), slightly rotated
- `.vhs-unpowered` — dim
- `.vhs-active` — tape slid in, blue glow
- `.tape-shelf` — flex row of small cassettes, gap: 8px
- `.tape-cassette` — small 40x28px rectangles with VHS aesthetic
- `.tape-cassette:hover` — scale up slightly, show name

- [ ] **Step 4: Validate syntax and build**

Run: `node -c src/components/VHSSlot.jsx && node -c src/components/TapeShelf.jsx && npm run build`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/VHSSlot.jsx src/components/TapeShelf.jsx src/App.jsx
git commit -m "feat: add VHS Slot and Tape Shelf components"
```

---

### Task 9: AI Static/Loading Overlays

**Files:**
- Modify: `src/components/ScenePlayer.jsx` (add overlay states for AI modes)
- Modify: `src/App.jsx` (add CSS for AI overlays)

ScenePlayer already has a `.tv-transition` overlay for channel changes. We add new overlays for AI states.

- [ ] **Step 1: Add new props to ScenePlayer**

Add these props to `ScenePlayer`:
- `aiMode` — `null | "dial" | "tape"` — current AI mode
- `aiLoading` — boolean — whether we're waiting for the first clip
- `aiError` — `null | string` — error state to display

These are display-only props — they control what overlay shows on the screen.

- [ ] **Step 2: Add overlay rendering in ScenePlayer**

Inside the `.tv-screen` div, after the transition overlay, add:

```jsx
{/* AI scanning static — heavy persistent static */}
{aiMode === "dial" && aiLoading && (
  <div className="ai-static-overlay">
    <div className="ai-static-snow" />
    <div className="ai-static-text">SCANNING...</div>
  </div>
)}

{/* VCR loading — blue screen with tracking lines */}
{aiMode === "tape" && aiLoading && (
  <div className="ai-vcr-overlay">
    <div className="ai-vcr-tracking" />
    <div className="ai-vcr-text">LOADING TAPE...</div>
  </div>
)}

{/* Error overlays */}
{aiError === "SIGNAL_LOST" && (
  <div className="ai-error-overlay">
    <div className="ai-static-snow" />
    <div className="ai-error-text">SIGNAL LOST — TRY AGAIN</div>
  </div>
)}
{aiError === "DEAD_AIR" && (
  <div className="ai-error-overlay">
    <div className="ai-static-snow" />
    <div className="ai-error-text">DEAD AIR — SPIN AGAIN</div>
  </div>
)}
{aiError === "BAD_TAPE" && (
  <div className="ai-error-overlay">
    <div className="ai-vcr-tracking" />
    <div className="ai-error-text">BAD TAPE — EJECT AND TRY AGAIN</div>
  </div>
)}
```

- [ ] **Step 3: Add CSS for AI overlays to `App.jsx`**

Key classes:
- `.ai-static-overlay` — position absolute, inset 0, z-index 10, black bg
- `.ai-static-snow` — animated static noise (reuse existing `.tv-static` pattern but looping, not one-shot)
- `.ai-static-text` — centered text, monospace, green, flickering
- `.ai-vcr-overlay` — blue (#000033) background, inset 0
- `.ai-vcr-tracking` — horizontal white lines that roll vertically (CSS animation)
- `.ai-vcr-text` — white monospace text, bottom-left
- `.ai-error-overlay` — similar to static but with red-tinted text
- `.ai-error-text` — red, monospace, pulsing

Auto-clear for error overlays: errors auto-clear after 3 seconds (implemented in Task 11 Step 1, which adds a `useEffect` timer to `useAiDiscovery`).

- [ ] **Step 4: Validate syntax and build**

Run: `node -c src/components/ScenePlayer.jsx && npm run build`
Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ScenePlayer.jsx src/App.jsx
git commit -m "feat: add AI static, VCR, and error overlay states to ScenePlayer"
```

---

### Task 10: App.jsx Integration — Wire Everything Together

**Files:**
- Modify: `src/App.jsx`

This is the final wiring task. All components and hooks exist — now connect them.

- [ ] **Step 1: Add imports**

Add at the top of `App.jsx`:
```js
import { useApiKey } from "./hooks/useApiKey.js";
import { useAiDiscovery, getAllScenesForLookup } from "./hooks/useAiDiscovery.js";
import { ServicePanel } from "./components/ServicePanel.jsx";
import { ChannelDial } from "./components/ChannelDial.jsx";
import { VHSSlot } from "./components/VHSSlot.jsx";
import { TapeShelf } from "./components/TapeShelf.jsx";
```

- [ ] **Step 2: Add hooks in App component**

After the existing hooks:
```js
const { apiKey, keyStatus, hasKey, setApiKey, clearApiKey } = useApiKey();
const [showServicePanel, setShowServicePanel] = useState(false);

const {
  aiMode, currentAiScene,
  dialLoading, dialStreamDone,
  tapeData, tapeLoading, tapeStreamDone,
  tapeShelf, aiError,
  spinDial, insertTape, playSavedTape, advanceAi, exitAiMode,
} = useAiDiscovery(apiKey, history, favoriteIds, activeFilters);
```

- [ ] **Step 3: Update handleBlast to route based on aiMode**

The existing `handleBlast` stays unchanged — it only runs when `aiMode` is null (normal mode). In AI mode, `onBlast` is routed to `handleAiEnd` instead (see Step 6). No changes to `handleBlast` needed.

- [ ] **Step 4: Add AI advance handler**

```js
const handleAiEnd = useCallback(() => {
  const ended = advanceAi();
  if (ended) {
    // AI mode ended naturally — load a fresh curated scene
    const next = getNext(activeFilters);
    if (next) addToHistory(next.id);
  }
}, [advanceAi, getNext, activeFilters, addToHistory]);
```

Add a manual exit handler for when the user clicks the Blast Me button during AI mode:
```js
const handleExitAi = useCallback(() => {
  exitAiMode();
  const next = getNext(activeFilters);
  if (next) addToHistory(next.id);
}, [exitAiMode, getNext, activeFilters, addToHistory]);
```

- [ ] **Step 5: Add dial/tape handlers with key gate**

```js
const handleDialSpin = useCallback(() => {
  if (!hasKey) {
    setShowServicePanel(true);
    return;
  }
  spinDial();
}, [hasKey, spinDial]);

const handleTapeInsert = useCallback(() => {
  if (!hasKey) {
    setShowServicePanel(true);
    return;
  }
  insertTape();
}, [hasKey, insertTape]);
```

- [ ] **Step 6: Update ScenePlayer scene + onBlast props**

The scene passed to ScenePlayer depends on aiMode:
```jsx
<ScenePlayer
  scene={aiMode ? currentAiScene : current}
  nextScene={aiMode ? null : nextUp}
  isFavorite={
    (aiMode ? currentAiScene : current)
      ? isFavorite((aiMode ? currentAiScene : current).id)
      : false
  }
  onToggleFavorite={handleToggleFavorite}
  hasInteracted={hasInteracted}
  onBlast={aiMode ? handleAiEnd : handleBlast}
  aiMode={aiMode}
  aiLoading={aiMode === "dial" ? dialLoading : tapeLoading}
  aiError={aiError}
/>
```

- [ ] **Step 7: Wrap TV in 3D flip container and add new components**

Restructure the ScenePlayer area in the JSX:

```jsx
<div className="tv-flip-container">
  <div className={`tv-flip-inner ${showServicePanel ? "flipped" : ""}`}>
    {/* Front: normal TV */}
    <div className="tv-front">
      <ScenePlayer ... />
      <ChannelDial
        powered={hasKey}
        active={aiMode === "dial"}
        loading={dialLoading}
        onSpin={handleDialSpin}
      />
      <VHSSlot
        powered={hasKey}
        active={aiMode === "tape"}
        loading={tapeLoading}
        tapeName={tapeData?.name}
        onInsert={handleTapeInsert}
      />
      <TapeShelf
        tapes={tapeShelf}
        onPlay={playSavedTape}
      />
    </div>
    {/* Back: service panel */}
    <div className="tv-back">
      <ServicePanel
        apiKey={apiKey}
        keyStatus={keyStatus}
        onSubmitKey={setApiKey}
        onClearKey={clearApiKey}
        onClose={() => setShowServicePanel(false)}
      />
    </div>
  </div>
</div>
```

- [ ] **Step 8: Update Blast Me button text for AI mode**

In ScenePlayer, the blast button text changes:
The Blast Me button text change needs to happen in `ScenePlayer.jsx`. Since ScenePlayer already receives `aiMode` as a prop (Task 9), update the button text and add `onExitAi` as a new prop:

```jsx
<button
  className={`tv-blast-btn ${aiMode ? "tv-blast-btn-ai" : ""}`}
  onClick={aiMode ? onExitAi : onBlast}
>
  {aiMode === "dial" ? "📡 SCANNING..."
    : aiMode === "tape" ? "📼 PLAYING TAPE..."
    : "⚡ Blast Me"}
</button>
```

Pass `onExitAi={handleExitAi}` as a prop to ScenePlayer alongside the existing `onBlast`.

- [ ] **Step 9: Update FavoritesList scenes prop to include AI discoveries**

Change the `FavoritesList` rendering:
```jsx
{showFavorites && (
  <FavoritesList
    favoriteIds={favoriteIds}
    scenes={getAllScenesForLookup()}
    onSelect={handleFavoriteSelect}
    onRemove={handleToggleFavorite}
    onClose={() => setShowFavorites(false)}
  />
)}
```

Do the same for `HistoryList`.

- [ ] **Step 10: Add flip trigger button to TV**

Add a small button visible on the TV body that triggers the flip:
```jsx
<button
  className="tv-flip-trigger"
  onClick={() => setShowServicePanel(!showServicePanel)}
  title="Service Panel"
>
  🔧
</button>
```

Position this in the `.tv-front` div, bottom-right corner of the TV bezel.

- [ ] **Step 11: Validate syntax and build**

Run: `npm run build`
Expected: Vite build completes with no errors.

- [ ] **Step 12: Visual verification**

Run: `npm run dev`
Verify in browser:
1. TV renders normally, Blast Me works as before
2. Channel dial visible on right side of TV body (dim/unpowered)
3. VHS slot visible below TV screen (dim/unpowered)
4. 🔧 button visible on TV, clicking it flips to back panel
5. Back panel shows sticker, port input, red LED
6. Pasting a valid API key: LED goes yellow → green, auto-flips back
7. Dial and VHS now glow (powered)
8. Clicking dial pirate zone → heavy static → clips stream in and play
9. Clicking VHS slot → blue VCR screen → tape clips play in sequence
10. Tape auto-saves to shelf, cassette icons appear
11. Clicking Blast Me during AI mode exits back to normal
12. Favoriting an AI clip works

- [ ] **Step 13: Commit**

```bash
git add src/App.jsx
git commit -m "feat: integrate AI discovery (dial, tape, service panel) into App"
```

---

### Task 11: Error Auto-Clear and Polish

**Files:**
- Modify: `src/hooks/useAiDiscovery.js` (add error auto-clear timer)
- Modify: `src/App.jsx` (add `.tv-blast-btn-ai` dimmed styling)

- [ ] **Step 1: Add error auto-clear in useAiDiscovery**

When `aiError` is set, automatically clear it after 3 seconds and exit AI mode:

```js
// Add useEffect import and this effect:
useEffect(() => {
  if (!aiError) return;
  const timer = setTimeout(() => {
    setAiError(null);
    exitAiMode();
  }, 3000);
  return () => clearTimeout(timer);
}, [aiError]);
```

- [ ] **Step 2: Add dimmed blast button CSS**

In the `CSS` literal in `App.jsx`, add:
```css
.tv-blast-btn-ai {
  background: linear-gradient(135deg, #333, #444, #333);
  border-color: var(--text-2);
  box-shadow: none;
  animation: none;
  cursor: pointer;
  font-size: 0.9rem;
  letter-spacing: 0.15em;
}
.tv-blast-btn-ai:hover {
  background: linear-gradient(135deg, #444, #555, #444);
  border-color: var(--text-1);
  box-shadow: none;
  transform: scale(1.02);
}
.tv-blast-btn-ai::after {
  display: none;
}
```

- [ ] **Step 3: Add VCR counter for tape mode**

In ScenePlayer, when `aiMode === "tape"` and a clip is playing, show a VCR-style counter in the corner:
```jsx
{aiMode === "tape" && !aiLoading && (
  <div className="vcr-counter">
    ▶ CLIP {tapeIndex + 1}/{tapeData?.clips?.length || "?"}
  </div>
)}
```

Add CSS: `.vcr-counter` — positioned top-right of `.tv-screen`, monospace, white, small font, slight text-shadow.

Note: `tapeIndex` and `tapeData` need to be passed as props to ScenePlayer, or the counter can live in `App.jsx` overlaying the TV. The simpler approach is to add `tapeIndex` and `tapeClipCount` as props.

- [ ] **Step 4: Validate and build**

Run: `npm run build`
Expected: Passes.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAiDiscovery.js src/App.jsx src/components/ScenePlayer.jsx
git commit -m "feat: add error auto-clear, AI mode button styling, VCR counter"
```

---

### Task 12: Final Validation & Cleanup

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no warnings.

- [ ] **Step 2: Syntax check all new files**

Run: `node -c api/_lib/prompts.js && node -c api/_lib/verify.js && node -c api/_lib/claude.js && node -c api/validate.js && node -c api/dial.js && node -c api/tape.js && node -c src/lib/streamClient.js && node -c src/hooks/useApiKey.js && node -c src/hooks/useAiDiscovery.js && node -c src/components/ServicePanel.jsx && node -c src/components/ChannelDial.jsx && node -c src/components/VHSSlot.jsx && node -c src/components/TapeShelf.jsx`
Expected: All pass.

- [ ] **Step 3: Dev server visual smoke test**

Run `npm run dev` and manually verify:
- Normal blast flow unchanged
- Service panel flip animation smooth
- Dial scanning with static overlay
- Tape VCR loading screen
- Tape shelf cassettes clickable
- Error states display and auto-clear
- AI → normal mode transition clean

- [ ] **Step 4: Update CLAUDE.md**

Add to the Architecture section:
```
├── api/                     # Vercel serverless functions (AI pipeline)
│   ├── dial.js              # SSE endpoint — channel dial discovery
│   ├── tape.js              # SSE endpoint — VHS tape generation
│   ├── validate.js          # API key validation
│   └── _lib/
│       ├── claude.js        # Claude API client (BYOK)
│       ├── verify.js        # YouTube oEmbed verification
│       └── prompts.js       # Prompt templates + vocabulary
```

Add new hooks and components to the file tree. Add note about `sisb-api-key`, `sisb-tapes`, `sisb-ai-discoveries` localStorage keys.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs: update CLAUDE.md with AI discovery architecture"
```
