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
- **Format:** Ordered array of scene IDs, most recent last: `["started-blasting", "rum-ham", ...]`
- **Cap:** 200 entries (trimmed from front on write)
- **Separate from watch history:** `sisb-watch-history` (UI panel, max 50) is untouched
- **Stale entries:** Scene IDs no longer in `scenes.js` are silently skipped during scoring

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
recentVibes = all vibes from last 5 plays (Set)
overlapCount = candidate vibes that appear in recentVibes
vibeScore = 1 - (overlapCount / candidate.vibes.length)
```

### Era diversity (0.1)

```
recentEras = eras of last 3 plays
matchCount = occurrences of candidate's era in recentEras
eraScore = 1 - (matchCount / 3)
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

- Loads `sisb-blast-history` from localStorage on mount (into `useRef`)
- `getNext(filters)` → filters pool → `pickNext` → `recordPlay` → save to localStorage → update state
- `setCurrent` for favorites/history panel picks (bypasses scoring)
- Same API shape as `useRandomScene` — drop-in replacement

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
