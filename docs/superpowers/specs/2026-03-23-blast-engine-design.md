# Blast Me Engine — Design Spec

## Problem

The current `useRandomScene` hook uses a recency buffer of 5 scene IDs, held in a `useRef` that resets on page reload. With 159 clips, a user can see the same clip after just 6 plays, and there's no consideration of vibe/era diversity — two "chaotic-energy" clips can play back-to-back by chance.

## Goals

1. **No noticeable repeats** — a clip shouldn't reappear until ~50% of the available pool has been played
2. **Vibe diversity** — consecutive plays should feel different, not cluster in one category
3. **Persistence** — history survives page reloads and browser sessions via localStorage
4. **Graceful degradation** — when filters shrink the pool, the engine relaxes constraints rather than breaking

## Architecture: Pure Module + Hook (Approach B)

Two new files, one import swap:

```
src/
├── engine/
│   └── blastEngine.js    # Pure scoring + history functions (no React)
└── hooks/
    └── useBlastEngine.js  # Thin React hook wrapping the engine
```

`App.jsx` swaps `useRandomScene(SCENES)` → `useBlastEngine(SCENES)`. The hook API is identical: `{ current, getNext, setCurrent }`.

## Storage & History

- **Key:** `sisb-blast-history`
- **Format:** Ordered array of scene IDs, oldest first, most recent last: `["oldest-play", ..., "most-recent-play"]`
- **Cap:** 200 entries (trimmed from front on write)
- **Separate from watch history:** `sisb-watch-history` (UI panel, max 50) is untouched
- **Stale entries:** Scene IDs no longer in `scenes.js` are silently skipped during scoring
- **Validation on load:** If the stored value is not an array of strings, discard it and start fresh

No timestamps — position in the array is the recency signal.

## Scoring Algorithm

Every candidate scene gets a score from 0–1. Higher = more likely to be picked.

### Weights

| Factor          | Weight | Window    | Purpose                                    |
|-----------------|--------|-----------|--------------------------------------------|
| Recency         | 0.4    | 50% pool  | How long ago was this exact clip played?    |
| Vibe diversity  | 0.3    | Last 5    | Do this clip's vibes overlap recent plays?  |
| Era diversity   | 0.1    | Last 3    | Is this clip from the same era as recent?   |
| Random jitter   | 0.2    | —         | Prevents deterministic "most different" picks |

### Recency (0.4)

```
cooldown = floor(pool.length * 0.5)
playsAgo = position from end of history (null if never played)

if never played       → 1.0
if playsAgo >= cooldown → 1.0
if playsAgo < cooldown  → playsAgo / cooldown
```

### Vibe diversity (0.3)

```
vibeWindow = min(5, pool.length - 1)
recentVibes = all vibes from last vibeWindow plays (Set)
overlapCount = candidate vibes that appear in recentVibes
vibeScore = candidate.vibes.length === 0
  ? 1.0
  : 1 - (overlapCount / candidate.vibes.length)
```

### Era diversity (0.1)

```
eraWindow = min(3, pool.length - 1)
recentEras = eras of last eraWindow plays
matchCount = occurrences of candidate's era in recentEras
eraScore = eraWindow === 0 ? 1.0 : 1 - (matchCount / eraWindow)
```

### Random jitter (0.2)

```
Math.random()  // flat 0–1
```

### Final score

```
finalScore = (0.4 * recency) + (0.3 * vibeDiversity) + (0.1 * eraDiversity) + (0.2 * random)
```

**Selection:** Score every scene in the filtered pool. Pick the highest scorer. The random jitter provides natural variation among similarly-scored candidates.

## Engine Module API (`src/engine/blastEngine.js`)

Pure functions — no React, no side effects.

`pool` is the filtered candidate list; `allScenes` is the full catalog needed to resolve history IDs to their vibe/era metadata.

```js
scoreScene(scene, history, pool, allScenes)  → number
  // Weighted score for a single candidate

pickNext(pool, history, allScenes)  → scene
  // Scores all candidates, returns highest scorer

recordPlay(history, sceneId)  → string[]
  // Appends ID, trims to 200, returns new array

findPlaysAgo(history, sceneId)  → number | null
  // How many plays ago this scene appeared, or null

getRecentVibes(history, allScenes, window)  → Set<string>
  // Vibes from last N plays

getRecentEras(history, allScenes, window)  → string[]
  // Eras of last N plays
```

`pickNext` does not call `recordPlay` — the hook controls when history is written.

## Hook API (`src/hooks/useBlastEngine.js`)

```js
useBlastEngine(scenes) → { current, getNext, setCurrent }
```

- **Initial state:** `current` starts as `null`, matching `useRandomScene` behavior. `App.jsx` calls `getNext([])` on mount to pick the first scene.
- Loads `sisb-blast-history` from localStorage on mount (into `useRef`), validates shape
- `getNext(filters)` → filters pool → `pickNext` → `recordPlay` → save to localStorage → update state
- `setCurrent(scene)` for favorites/history panel picks — bypasses scoring but **does** call `recordPlay` so the engine knows the user just watched this clip and won't immediately serve it again
- Same API shape as `useRandomScene` — drop-in replacement

**Caller responsibility:** `App.jsx` still calls `addToHistory(scene.id)` after `getNext` for the UI watch history panel (`sisb-watch-history`). The blast engine's internal history (`sisb-blast-history`) is separate and managed by the hook. No changes needed to `addToHistory` call sites.

### Graceful degradation

When the filtered pool is very small (e.g., 3 clips):
- Cooldown becomes `floor(3 * 0.5) = 1` — minimal but functional
- Vibe/era windows clamp to `min(window, pool.length - 1)` — prevents penalizing all candidates equally
- If pool has only 1 clip, all scoring is bypassed and that clip is returned directly
- The random jitter (20% weight) ensures variety even when all scoring factors converge

## Integration

Single change in `App.jsx`:

```js
// Before
const { current, getNext, setCurrent } = useRandomScene(SCENES);

// After
const { current, getNext, setCurrent } = useBlastEngine(SCENES);
```

All downstream handlers (`handleBlast`, `handleFilterToggle`, `handleFilterClear`) and components work unchanged.

`useRandomScene.js` remains in the codebase but is no longer imported.
