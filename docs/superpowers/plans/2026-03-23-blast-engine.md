# Blast Me Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple 5-clip recency buffer with a weighted scoring engine that ensures variety across vibes, eras, and play history, persisted in localStorage.

**Architecture:** Pure function module (`src/engine/blastEngine.js`) handles scoring and history logic. Thin React hook (`src/hooks/useBlastEngine.js`) wraps it with state management and localStorage persistence. Drop-in replacement for `useRandomScene` — same `{ current, getNext, setCurrent }` API.

**Tech Stack:** Vite + React 18, plain JS (no TypeScript), localStorage for persistence.

**Spec:** `docs/superpowers/specs/2026-03-23-blast-engine-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/engine/blastEngine.js` | Pure scoring functions, history helpers — no React, no side effects |
| Create | `src/hooks/useBlastEngine.js` | React hook wrapping engine with state + localStorage |
| Modify | `src/App.jsx:956` | Swap `useRandomScene` → `useBlastEngine` import |

---

### Task 1: Create engine helper functions

**Files:**
- Create: `src/engine/blastEngine.js`

These are the utility functions that the scoring function depends on. Build them first.

- [ ] **Step 1: Create `src/engine/blastEngine.js` with constants and `findPlaysAgo`**

```js
const HISTORY_CAP = 200;
const COOLDOWN_RATIO = 0.5;
const VIBE_WINDOW = 5;
const ERA_WINDOW = 3;

const WEIGHTS = {
  recency: 0.4,
  vibeDiversity: 0.3,
  eraDiversity: 0.1,
  random: 0.2,
};

/**
 * How many plays ago a scene last appeared in history.
 * Returns null if never played.
 * History is ordered oldest-first, so the last element is most recent (playsAgo = 1).
 */
export function findPlaysAgo(history, sceneId) {
  const idx = history.lastIndexOf(sceneId);
  if (idx === -1) return null;
  return history.length - idx;
}
```

- [ ] **Step 2: Add `getRecentVibes` and `getRecentEras`**

```js
/**
 * Build an ID → scene lookup map. Called once in pickNext and
 * threaded through to avoid rebuilding per candidate.
 */
export function buildSceneMap(allScenes) {
  return new Map(allScenes.map((s) => [s.id, s]));
}

/**
 * Collect all vibes from the last `window` plays.
 * Uses pre-built sceneMap; skips stale/missing IDs.
 */
export function getRecentVibes(history, sceneMap, window) {
  const vibes = new Set();
  const recent = history.slice(-window);
  for (const id of recent) {
    const scene = sceneMap.get(id);
    if (scene) scene.vibes.forEach((v) => vibes.add(v));
  }
  return vibes;
}

/**
 * Return eras of the last `window` plays.
 * Uses pre-built sceneMap; skips stale/missing IDs.
 */
export function getRecentEras(history, sceneMap, window) {
  const recent = history.slice(-window);
  return recent
    .map((id) => sceneMap.get(id))
    .filter(Boolean)
    .map((s) => s.era);
}
```

- [ ] **Step 3: Add `recordPlay`**

```js
/**
 * Append a scene ID to history, trim to HISTORY_CAP.
 * Returns a new array (does not mutate input).
 */
export function recordPlay(history, sceneId) {
  const next = [...history, sceneId];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}
```

- [ ] **Step 4: Validate syntax**

Run: `node -c src/engine/blastEngine.js`
Expected: No output (clean parse)

- [ ] **Step 5: Commit**

```bash
git add src/engine/blastEngine.js
git commit -m "feat(engine): add blast engine helper functions"
```

---

### Task 2: Add scoring and selection to engine

**Files:**
- Modify: `src/engine/blastEngine.js`

This is the core algorithm — the weighted scoring function and the top-level `pickNext`.

- [ ] **Step 1: Add `scoreScene`**

```js
/**
 * Compute a 0–1 score for a candidate scene.
 *
 * Factors (see spec for details):
 *   recency      (0.4) — linear ramp over 50% of pool cooldown
 *   vibeDiversity (0.3) — overlap of candidate vibes with last 5 plays
 *   eraDiversity  (0.1) — overlap of candidate era with last 3 plays
 *   random        (0.2) — jitter to prevent deterministic ordering
 */
export function scoreScene(scene, history, pool, sceneMap) {
  const cooldown = Math.floor(pool.length * COOLDOWN_RATIO);

  // --- Recency ---
  const playsAgo = findPlaysAgo(history, scene.id);
  let recency;
  if (playsAgo === null || playsAgo >= cooldown) {
    recency = 1.0;
  } else {
    recency = cooldown === 0 ? 1.0 : playsAgo / cooldown;
  }

  // --- Vibe diversity ---
  const vibeWindow = Math.min(VIBE_WINDOW, pool.length - 1);
  let vibeDiversity;
  if (vibeWindow <= 0 || scene.vibes.length === 0) {
    vibeDiversity = 1.0;
  } else {
    const recentVibes = getRecentVibes(history, sceneMap, vibeWindow);
    const overlapCount = scene.vibes.filter((v) => recentVibes.has(v)).length;
    vibeDiversity = 1 - overlapCount / scene.vibes.length;
  }

  // --- Era diversity ---
  const eraWindow = Math.min(ERA_WINDOW, pool.length - 1);
  let eraDiversity;
  if (eraWindow <= 0) {
    eraDiversity = 1.0;
  } else {
    const recentEras = getRecentEras(history, sceneMap, eraWindow);
    const matchCount = recentEras.filter((e) => e === scene.era).length;
    eraDiversity = 1 - matchCount / eraWindow;
  }

  // --- Random jitter ---
  const random = Math.random();

  return (
    WEIGHTS.recency * recency +
    WEIGHTS.vibeDiversity * vibeDiversity +
    WEIGHTS.eraDiversity * eraDiversity +
    WEIGHTS.random * random
  );
}
```

- [ ] **Step 2: Add `pickNext`**

```js
/**
 * Score every scene in pool, return the highest scorer.
 * If pool has 0 scenes returns null. If pool has 1 scene returns it directly.
 */
export function pickNext(pool, history, allScenes) {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const sceneMap = buildSceneMap(allScenes);
  let best = null;
  let bestScore = -1;

  for (const scene of pool) {
    const score = scoreScene(scene, history, pool, sceneMap);
    if (score > bestScore) {
      bestScore = score;
      best = scene;
    }
  }

  return best;
}
```

- [ ] **Step 3: Validate syntax**

Run: `node -c src/engine/blastEngine.js`
Expected: No output (clean parse)

- [ ] **Step 4: Commit**

```bash
git add src/engine/blastEngine.js
git commit -m "feat(engine): add weighted scoring and pickNext selection"
```

---

### Task 3: Create the useBlastEngine hook

**Files:**
- Create: `src/hooks/useBlastEngine.js`

Thin wrapper: loads/saves localStorage, calls engine functions, exposes the same `{ current, getNext, setCurrent }` API as `useRandomScene`.

- [ ] **Step 1: Create `src/hooks/useBlastEngine.js`**

```js
import { useState, useCallback, useRef } from "react";
import { matchesFilters } from "../data/filters.js";
import { pickNext, recordPlay } from "../engine/blastEngine.js";

const STORAGE_KEY = "sisb-blast-history";

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full or unavailable — silently continue
  }
}

export function useBlastEngine(scenes) {
  const [current, setCurrentState] = useState(null);
  const historyRef = useRef(loadHistory());

  const getNext = useCallback(
    (filters = []) => {
      const pool =
        !filters || filters.length === 0
          ? scenes
          : scenes.filter((s) => matchesFilters(s, filters));

      if (pool.length === 0) return null;

      const pick = pickNext(pool, historyRef.current, scenes);
      historyRef.current = recordPlay(historyRef.current, pick.id);
      saveHistory(historyRef.current);
      setCurrentState(pick);
      return pick;
    },
    [scenes],
  );

  const setCurrent = useCallback(
    (scene) => {
      if (scene) {
        historyRef.current = recordPlay(historyRef.current, scene.id);
        saveHistory(historyRef.current);
      }
      setCurrentState(scene);
    },
    [],
  );

  return { current, getNext, setCurrent };
}
```

- [ ] **Step 2: Validate syntax**

Run: `npx -y acorn --ecma2022 --module src/hooks/useBlastEngine.js > /dev/null`
Expected: No output (clean parse). Note: `node -c` won't work here because this file uses ES module `import` syntax — acorn handles it correctly.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBlastEngine.js
git commit -m "feat(hooks): add useBlastEngine hook with localStorage persistence"
```

---

### Task 4: Swap useRandomScene → useBlastEngine in App.jsx

**Files:**
- Modify: `src/App.jsx:956`

One import swap, one call-site swap. Everything else stays the same.

- [ ] **Step 1: Update the import**

In `src/App.jsx`, find the import for `useRandomScene` and replace it with `useBlastEngine`. The import is near the top of the file — search for `useRandomScene`.

```js
// Before
import { useRandomScene } from "./hooks/useRandomScene.js";

// After
import { useBlastEngine } from "./hooks/useBlastEngine.js";
```

- [ ] **Step 2: Update the hook call**

At line 956:

```js
// Before
const { current, getNext, setCurrent } = useRandomScene(SCENES);

// After
const { current, getNext, setCurrent } = useBlastEngine(SCENES);
```

No other changes needed — `handleBlast`, `handleFilterToggle`, `handleFilterClear`, `handleFavoriteSelect`, `handleHistorySelect` all work unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: swap useRandomScene for useBlastEngine in App"
```

---

### Task 5: Validate end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite starts on port 3000, no build errors

- [ ] **Step 2: Manual smoke test**

Open `http://localhost:3000` in browser and verify:

1. Click "Start Blasting" — a clip loads and plays
2. Click "Blast Me" 10+ times — clips should vary in vibes/eras, no immediate repeats
3. Toggle a filter pill — next clip matches the filter
4. Toggle multiple filter pills — clip matches all active filters
5. Clear filters — returns to full pool
6. Select a clip from favorites or history — it plays and future "Blast Me" picks account for it
7. Refresh the page — after re-entering, the first few clips should differ from what you just watched (persistence working)

- [ ] **Step 3: Verify localStorage**

In browser devtools console:
```js
JSON.parse(localStorage.getItem('sisb-blast-history'))
```
Expected: Array of scene ID strings, most recent last, growing with each play

- [ ] **Step 4: Final commit if any fixes were needed**

If any fixes were applied during verification, commit them:
```bash
git add -A && git commit -m "fix: blast engine adjustments from smoke testing"
```
