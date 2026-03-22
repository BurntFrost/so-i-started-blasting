# Channel Zero — Rebrand & Expansion Design Spec

## Overview

Transform "So I Started Blasting" (a Frank Reynolds clip viewer) into **Channel Zero** — a pirate-TV-themed random video viewer showcasing funny, strange, and iconic clips from across internet history. The CRT TV aesthetic stays; everything else gets rebranded, the video library expands to 35-40+ clips, and the UI is restructured so the video is the hero.

## Identity

- **Name:** Channel Zero
- **Tagline:** "We're experiencing technical difficulties."
- **Tone:** Pirate TV, late-night, absurdist. Rogue broadcast operator energy.
- **Logo treatment:** `CHANNEL ZERO` in system `monospace`, neon green (`#39ff14`), `letter-spacing: 4px`
- **Color palette:**
  - Dark base: `#0a0a08` (unchanged)
  - Primary accent: neon green `#39ff14` (broadcast green, replacing bar-neon mix)
  - Secondary accent: red `#ff1744` (button, alerts)
  - Tag pill colors: each vibe/era gets a unique neon — defined in `filters.js`

## Layout — Cinematic Stack

### Header (slim, persistent)
- Left: `CHANNEL ZERO` logo text
- Right: `FilterDropdown` component + favorites heart icon (inline, horizontal)

### Hero: CRT TV
- Full-width, centered
- Existing CRT frame preserved: bezel, scanlines, knobs, LED indicator, stand
- "Paddy's Pub" label → "CHANNEL ZERO"
- Channel number display stays
- **Autoplay:** See Autoplay Behavior section

### Info Bar (below TV)
- Clip quote in `Special Elite` (keep existing font)
- Tag pills: small colored pills showing the clip's vibe(s) + era. Each filter key maps to a color defined in `filters.js`
- Source line: "Title (Year)" in secondary text

### Action Button
- Centered below info bar
- Label: **"⚡ BLAST ME"** — the lightning emoji is part of the label string passed to `NeonButton`, not hardcoded in the component
- Keeps pulsing glow animation

### Favorites Panel
- Slide-in right panel (unchanged behavior)
- SceneCards updated to show `source` instead of `episode`
- `FavoritesList.jsx` itself unchanged — it just renders SceneCards, which handle data display

### Toast Notifications
- Unchanged

## Filter System

Single dropdown replacing the scrollable category bar. Renders inside the header bar on the right side. Uses `<optgroup>` for visual grouping.

### Filter Definitions (in `filters.js`)

Each filter has: `key`, `label`, `type` ("vibe" | "era"), `color` (hex for tag pill).

### Vibe Filters
| Key | Label | Color | Description |
|-----|-------|-------|-------------|
| `chaotic-energy` | Chaotic Energy | `#ef4444` | Unhinged, high-energy, pure chaos |
| `legendary-fails` | Legendary Fails | `#f97316` | Iconic failures and mishaps |
| `weird-flex` | Weird Flex | `#84cc16` | Inexplicably confident, strange talents |
| `unhinged-wisdom` | Unhinged Wisdom | `#22d3ee` | Rants, monologues, accidental philosophy |

### Era Filters
| Key | Label | Color | Description |
|-----|-------|-------|-------------|
| `early-internet` | Early Internet | `#8b5cf6` | Pre-2007 |
| `viral-classics` | Viral Classics | `#ec4899` | 2007–2015 |
| `modern-chaos` | Modern Chaos | `#ffd600` | 2015+ |

### Dropdown Structure
```
All
─── Vibe ───
Chaotic Energy
Legendary Fails
Weird Flex
Unhinged Wisdom
─── Era ───
Early Internet
Viral Classics
Modern Chaos
```

### Filter → Scene Matching Logic

The dropdown value is a filter key string (or `"all"`). To determine which field to check, use a lookup from `filters.js`:

```js
// filters.js exports FILTERS array, each with { key, label, type, color }
// Helper:
export const getFilterByKey = (key) => FILTERS.find(f => f.key === key);

// In useRandomScene or App.jsx:
function matchesFilter(scene, filterKey) {
  if (filterKey === "all") return true;
  const filter = getFilterByKey(filterKey);
  if (filter.type === "vibe") return scene.vibes.includes(filterKey);
  if (filter.type === "era") return scene.era === filterKey;
  return true;
}
```

### Filter Selection Behavior

Selecting a filter immediately loads a random clip from that filter (same as current CategoryBar behavior — sets filter AND calls `getNext`).

## Clip Data Structure

```js
{
  id: "techno-viking",
  videoId: "YouTubeVideoID",
  start: 0,
  end: 30,
  quote: "He points. You obey.",
  description: "The Viking commands the street parade",
  vibes: ["chaotic-energy"],
  era: "early-internet",
  source: { title: "Techno Viking", year: 2000 }
}
```

### Changes from current `scenes.js`:
- `categories: string[]` → `vibes: string[]` (vibe tags)
- New field: `era: string` (era tag)
- `episode: { season, episode, title }` → `source: { title, year }`

### Existing Frank Reynolds clips
Kept in the library — they fit naturally under "Chaotic Energy" / "Unhinged Wisdom" vibes and "Viral Classics" era.

## Clip Library (~35-40 clips)

Target clips spanning all categories. Representative examples:

**Chaotic Energy:** Techno Viking, Leroy Jenkins, Keyboard Cat, Screaming Goat, Grape Lady Fall, He Need Some Milk, Coffin Dance, Frank Reynolds clips (blasting, Trash Man, etc.)

**Legendary Fails:** Star Wars Kid, Miss Teen USA South Carolina, Reporter Stomping Grapes, Fail Army classics, David After Dentist, Boom Goes the Dynamite

**Weird Flex:** Numa Numa, Double Rainbow Guy, Charlie Bit My Finger, Dramatic Chipmunk, Evolution of Dance, Bed Intruder Song, Rick Roll

**Unhinged Wisdom:** "Ain't Nobody Got Time for That", Charlie the Unicorn, Philosopher cat clips, "Why Are You Running", Surprised Pikachu origin, Frank Reynolds wisdom clips

**Note:** Building the clip library is a significant content curation task — finding video IDs, verifying they're still available, picking timestamps, writing quotes. This should be treated as its own implementation step.

## File Changes

### Modified Files
| File | Changes |
|------|---------|
| `src/data/scenes.js` | Expanded to 35-40+ clips, new data structure (vibes, era, source) |
| `src/components/ScenePlayer.jsx` | Rebrand "Paddy's Pub" → "CHANNEL ZERO", show source instead of episode, autoplay via YouTube IFrame API |
| `src/components/NeonButton.jsx` | Default label stays generic; caller passes `"⚡ BLAST ME"` |
| `src/components/SceneCard.jsx` | Show source instead of episode |
| `src/hooks/useRandomScene.js` | Replace `s.categories.includes(category)` filtering with `matchesFilter(s, filterKey)` logic supporting vibes[] and era fields |
| `src/App.jsx` | Rebrand copy/colors, layout restructure (slim header, video hero), swap CategoryBar for FilterDropdown, update sceneCounts to use new filter structure, pass `"⚡ BLAST ME"` as NeonButton label |
| `index.html` | Title: "Channel Zero", description: "We're experiencing technical difficulties. Random internet clips on a pirate TV.", keep existing Google Fonts (Special Elite, Inter) |

### New Files
| File | Purpose |
|------|---------|
| `src/data/filters.js` | Vibe and era filter definitions with keys, labels, types, colors, and `getFilterByKey` helper |
| `src/components/FilterDropdown.jsx` | Single `<select>` with optgroups for Vibe and Era, styled to match the dark theme |

### Deleted Files
| File | Reason |
|------|--------|
| `src/data/categories.js` | Replaced by filters.js |
| `src/components/CategoryBar.jsx` | Replaced by FilterDropdown.jsx |

### Unchanged
- `src/hooks/useFavorites.js` — unchanged (localStorage key `"sisb-favorites"` kept for backwards compat)
- `src/components/FavoritesList.jsx` — unchanged (renders SceneCards which handle their own display)
- `src/components/Toast.jsx` — unchanged
- `vite.config.js` — unchanged
- Build/deploy pipeline — unchanged
- `.github/` — unchanged

## Autoplay Behavior

Use the YouTube IFrame Player API for reliable playback control:

1. Load YouTube IFrame API script (`https://www.youtube.com/iframe_api`)
2. Create player instances via `new YT.Player()` with `enablejsapi=1`
3. On first page load: autoplay muted (`player.mute(); player.playVideo()`)
4. Track user interaction via a one-time click listener on `document`
5. After first interaction: autoplay unmuted (`player.unMute(); player.playVideo()`) — using the JS API bypasses iframe autoplay restrictions since the parent frame has user gesture context
6. Use `player.seekTo(start)` for clip start time and `onStateChange` to detect when to stop at `end` time (more reliable than URL `end=` parameter)

## Responsive Design

- Same breakpoint approach (600px threshold)
- Mobile: TV scales down, header stacks if needed, dropdown stays accessible
- No fundamental layout changes needed — Cinematic Stack works well on mobile as a natural vertical flow
