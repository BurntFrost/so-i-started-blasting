# Channel Zero Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform "So I Started Blasting" into "Channel Zero" — a pirate-TV-themed random internet clip viewer with 35-40+ clips, video-first layout, and dropdown filter.

**Architecture:** Evolutionary refactor of existing React + Vite app. Replace data layer (scenes, categories) with new clip library and filter system. Restructure layout for video-hero UI. Rebrand all copy, colors, and metadata. Keep CRT TV frame, transitions, favorites, and toast systems intact.

**Tech Stack:** React 18, Vite 8, CSS-in-JS (template literal), YouTube IFrame API

**Spec:** `docs/superpowers/specs/2026-03-22-channel-zero-rebrand-design.md`

---

### Task 1: Data Layer — Filters

Create the new filter definitions that replace `categories.js`.

**Files:**
- Create: `src/data/filters.js`

> **Note:** Do NOT delete `src/data/categories.js` yet — it's still imported by `App.jsx`. Deletion happens in Task 8.

- [ ] **Step 1: Create `src/data/filters.js`**

```js
export const FILTERS = [
  // Vibes
  { key: "chaotic-energy",   label: "Chaotic Energy",   type: "vibe", color: "#ef4444" },
  { key: "legendary-fails",  label: "Legendary Fails",  type: "vibe", color: "#f97316" },
  { key: "weird-flex",       label: "Weird Flex",       type: "vibe", color: "#84cc16" },
  { key: "unhinged-wisdom",  label: "Unhinged Wisdom",  type: "vibe", color: "#22d3ee" },
  // Eras
  { key: "early-internet",   label: "Early Internet",   type: "era",  color: "#8b5cf6" },
  { key: "viral-classics",   label: "Viral Classics",   type: "era",  color: "#ec4899" },
  { key: "modern-chaos",     label: "Modern Chaos",     type: "era",  color: "#ffd600" },
];

export const getFilterByKey = (key) => FILTERS.find((f) => f.key === key);

export const matchesFilter = (scene, filterKey) => {
  if (filterKey === "all") return true;
  const filter = getFilterByKey(filterKey);
  if (!filter) return true;
  if (filter.type === "vibe") return scene.vibes.includes(filterKey);
  if (filter.type === "era") return scene.era === filterKey;
  return true;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/data/filters.js
git commit -m "feat: add vibe/era filter system"
```

---

### Task 2: Data Layer — Clip Library

Replace the 8 Frank Reynolds scenes with a full 35-40+ clip library using the new data structure.

**Files:**
- Modify: `src/data/scenes.js` (full rewrite)

- [ ] **Step 1: Rewrite `src/data/scenes.js`**

Replace the entire file with the expanded clip library. Each clip follows this structure:

```js
{
  id: "techno-viking",
  videoId: "UjCdB5p2v0Y",
  start: 0,
  end: 30,
  quote: "He points. You obey.",
  description: "The Viking commands the street parade",
  vibes: ["chaotic-energy"],
  era: "early-internet",
  source: { title: "Techno Viking", year: 2000 },
}
```

Include all clips from the spec — keeping the 8 existing Frank Reynolds clips (migrated to new structure) plus ~30 new internet clips. Each existing Frank clip maps as follows:

| Old Field | New Field |
|-----------|-----------|
| `categories: ["blasting", "wisdom"]` | `vibes: ["chaotic-energy"]` (map to closest vibe) |
| `episode: { season: 9, episode: 2, title: "..." }` | `source: { title: "It's Always Sunny S9E2", year: 2013 }` |

For all new clips: research the correct YouTube video ID, pick a good 15-35 second window (start/end), write a memorable quote or caption, assign 1-2 vibes and 1 era.

**Target clip list (minimum — add more if good clips are found):**

Early Internet era: Techno Viking, Star Wars Kid, Numa Numa, Badger Badger, All Your Base, Peanut Butter Jelly Time, Dramatic Chipmunk, End of Ze World, Leroy Jenkins, Evolution of Dance

Viral Classics era: Charlie Bit My Finger, Double Rainbow, Keyboard Cat, David After Dentist, Bed Intruder Song, Rick Roll, Ain't Nobody Got Time for That, Charlie the Unicorn, Boom Goes the Dynamite, Grape Lady, Miss Teen USA South Carolina, Screaming Goat, Frank Reynolds clips (8)

Modern Chaos era: Coffin Dance, He Need Some Milk, Why Are You Running, "Road Work Ahead", Yodeling Walmart Kid, Pen Pineapple Apple Pen, Shooting Stars meme

- [ ] **Step 2: Verify all video IDs are correct**

Open each YouTube URL (`https://www.youtube.com/watch?v=VIDEO_ID`) and confirm the video exists and the start/end window captures the good part.

- [ ] **Step 3: Commit**

```bash
git add src/data/scenes.js
git commit -m "feat: expand clip library to 35+ internet clips with vibe/era tags"
```

---

### Task 3: Hook Update — useRandomScene

Update the filtering logic to work with the new `vibes[]` + `era` structure.

**Files:**
- Modify: `src/hooks/useRandomScene.js:9-12`

- [ ] **Step 1: Update filter logic in `useRandomScene.js`**

Replace line 12:
```js
: scenes.filter((s) => s.categories.includes(category));
```

With import and usage of `matchesFilter`:

```js
import { matchesFilter } from "../data/filters.js";
```

And update the pool line:
```js
const pool =
  category === "all"
    ? scenes
    : scenes.filter((s) => matchesFilter(s, category));
```

The parameter name stays `category` to minimize changes in calling code — it now accepts any filter key.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useRandomScene.js
git commit -m "feat: update useRandomScene to filter by vibes and eras"
```

---

### Task 4: FilterDropdown Component

Create the dropdown that replaces CategoryBar.

**Files:**
- Create: `src/components/FilterDropdown.jsx`

> **Note:** Do NOT delete `src/components/CategoryBar.jsx` yet — it's still imported by `App.jsx`. Deletion happens in Task 8.

- [ ] **Step 1: Create `src/components/FilterDropdown.jsx`**

```jsx
import { FILTERS } from "../data/filters.js";

const vibes = FILTERS.filter((f) => f.type === "vibe");
const eras = FILTERS.filter((f) => f.type === "era");

export function FilterDropdown({ active, onSelect }) {
  return (
    <select
      className="filter-dropdown"
      value={active}
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="all">All</option>
      <optgroup label="Vibe">
        {vibes.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </optgroup>
      <optgroup label="Era">
        {eras.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </optgroup>
    </select>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FilterDropdown.jsx
git commit -m "feat: add FilterDropdown component"
```

---

### Task 5: Update ScenePlayer — Rebrand + Autoplay

Rebrand the TV label, update info display, and implement YouTube IFrame API autoplay.

**Files:**
- Modify: `src/components/ScenePlayer.jsx:25` (embed URL), `:62` (tv-brand), `:76-94` (scene info)

- [ ] **Step 1: Update TV brand label**

In `ScenePlayer.jsx`, change line 62:
```jsx
<span className="tv-brand">Paddy's Pub</span>
```
to:
```jsx
<span className="tv-brand">Channel Zero</span>
```

- [ ] **Step 2: Replace episode info with source + tag pills**

Replace lines 76-94 (the entire `.scene-info` div including `.scene-actions`) with:

```jsx
<div className="scene-info">
  <div className="scene-info-text">
    <blockquote className="scene-quote">"{scene.quote}"</blockquote>
    <p className="scene-description">{scene.description}</p>
    <div className="scene-tags">
      {scene.vibes.map((v) => {
        const filter = getFilterByKey(v);
        return filter ? (
          <span key={v} className="tag-pill" style={{ color: filter.color, borderColor: filter.color }}>
            {filter.label}
          </span>
        ) : null;
      })}
      {(() => {
        const eraFilter = getFilterByKey(scene.era);
        return eraFilter ? (
          <span className="tag-pill" style={{ color: eraFilter.color, borderColor: eraFilter.color }}>
            {eraFilter.label}
          </span>
        ) : null;
      })()}
    </div>
    <span className="source-tag">
      {scene.source.title} ({scene.source.year})
    </span>
  </div>
  <div className="scene-actions">
    <button
      className={`fav-btn ${isFavorite ? "fav-active" : ""}`}
      onClick={() => onToggleFavorite(scene.id)}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      {isFavorite ? "♥" : "♡"}
    </button>
  </div>
</div>
```

Add import at top:
```js
import { getFilterByKey } from "../data/filters.js";
```

- [ ] **Step 3: Update embed URL for autoplay with mute**

Replace line 25:
```js
const embedUrl = `https://www.youtube.com/embed/${displayScene.videoId}?start=${displayScene.start}&end=${displayScene.end}&autoplay=1&rel=0&modestbranding=1`;
```
with:
```js
const embedUrl = `https://www.youtube.com/embed/${displayScene.videoId}?start=${displayScene.start}&end=${displayScene.end}&autoplay=1&mute=1&rel=0&modestbranding=1&enablejsapi=1`;
```

Note: Full YouTube IFrame API integration (unmuting after user interaction) is deferred — the muted autoplay provides the core experience. The `enablejsapi=1` param is included for future enhancement.

- [ ] **Step 4: Commit**

```bash
git add src/components/ScenePlayer.jsx
git commit -m "feat: rebrand ScenePlayer, add tag pills, enable autoplay"
```

---

### Task 6: Update SceneCard

Update favorites cards to show source instead of episode.

**Files:**
- Modify: `src/components/SceneCard.jsx:5-7`

- [ ] **Step 1: Replace episode display with source**

Change lines 5-7:
```jsx
<div className="card-meta">
  S{scene.episode.season}E{scene.episode.episode} — "{scene.episode.title}"
</div>
```
to:
```jsx
<div className="card-meta">
  {scene.source.title} ({scene.source.year})
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SceneCard.jsx
git commit -m "feat: update SceneCard to show source instead of episode"
```

---

### Task 7: Update NeonButton

Remove the hardcoded gun emoji — let the caller own the full label.

**Files:**
- Modify: `src/components/NeonButton.jsx:1-6`

- [ ] **Step 1: Remove hardcoded emoji from NeonButton**

Replace entire file:
```jsx
export function NeonButton({ onClick, label = "Blast Me" }) {
  return (
    <button className="neon-btn" onClick={onClick}>
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NeonButton.jsx
git commit -m "feat: let NeonButton caller own full label text"
```

---

### Task 8: Rebrand App.jsx — Imports, State, Layout, Colors

The big one. Rebrand the main app: new imports, header, layout, colors, and CSS updates.

**Files:**
- Modify: `src/App.jsx` (imports :1-10, component :700-793, CSS :12-698)

- [ ] **Step 1: Update imports**

Replace lines 2-3 and 7:
```jsx
import { SCENES } from "./data/scenes.js";
import { CATEGORIES } from "./data/categories.js";
...
import { CategoryBar } from "./components/CategoryBar.jsx";
```
with:
```jsx
import { SCENES } from "./data/scenes.js";
...
import { FilterDropdown } from "./components/FilterDropdown.jsx";
```

Also remove `useMemo` from the React import (line 1) since `sceneCounts` is being removed.

Then delete `src/data/categories.js` and `src/components/CategoryBar.jsx`:
```bash
rm src/data/categories.js src/components/CategoryBar.jsx
```

- [ ] **Step 2: Update sceneCounts computation**

Replace lines 712-720:
```jsx
const sceneCounts = useMemo(() => {
  const counts = { all: SCENES.length };
  for (const key of Object.keys(CATEGORIES)) {
    if (key !== "all") {
      counts[key] = SCENES.filter((s) => s.categories.includes(key)).length;
    }
  }
  return counts;
}, []);
```

Remove it entirely — the dropdown doesn't show counts. Delete the `sceneCounts` const.

- [ ] **Step 3: Update header and layout in JSX**

Replace the return block (lines 748-793) with:

```jsx
return (
  <>
    <style>{CSS}</style>
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="title">Channel Zero</h1>
          <span className="subtitle">We're experiencing technical difficulties.</span>
        </div>
        <div className="header-right">
          <FilterDropdown
            active={activeCategory}
            onSelect={handleCategorySelect}
          />
          <button
            className="fav-toggle"
            onClick={() => setShowFavorites(true)}
          >
            ♥ ({favoriteIds.length})
          </button>
        </div>
      </header>

      <ScenePlayer
        scene={current}
        isFavorite={current ? isFavorite(current.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />

      <NeonButton onClick={handleBlast} label="⚡ Blast Me" />

      <Toast message={toastMessage} onDone={() => setToastMessage(null)} />

      {showFavorites && (
        <FavoritesList
          favoriteIds={favoriteIds}
          scenes={SCENES}
          onSelect={handleFavoriteSelect}
          onRemove={handleToggleFavorite}
          onClose={() => setShowFavorites(false)}
        />
      )}
    </div>
  </>
);
```

- [ ] **Step 4: Update CSS — title, colors, dropdown, tag pills**

In the CSS template literal, make these changes:

**Title styling** — replace `.title` block (lines 68-78):
```css
.title {
  font-family: monospace;
  font-size: clamp(1.2rem, 3vw, 1.6rem);
  color: var(--neon-green);
  text-shadow:
    0 0 10px rgba(57, 255, 20, 0.5),
    0 0 40px rgba(57, 255, 20, 0.2);
  letter-spacing: 4px;
  line-height: 1;
  white-space: nowrap;
  text-transform: uppercase;
}
```

**Header-right** — add after `.fav-toggle:hover` block (after line 107):
```css
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

**Dropdown styling** — replace `.category-bar` and all `.category-chip` / `.chip-*` blocks (lines 109-158) with:
```css
.filter-dropdown {
  background: var(--bg-1);
  color: var(--text-1);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-family: "Inter", sans-serif;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6350' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px;
}

.filter-dropdown:hover {
  border-color: var(--neon-green);
  color: var(--text-0);
}

.filter-dropdown:focus {
  outline: none;
  border-color: var(--neon-green);
  box-shadow: 0 0 8px rgba(57, 255, 20, 0.2);
}
```

**Tag pills** — add after `.episode-tag` block (after line 470):
```css
.scene-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 19px;
  margin-top: 8px;
}

.tag-pill {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid;
  background: rgba(255, 255, 255, 0.03);
  font-family: "Inter", sans-serif;
}

.source-tag {
  font-size: 0.75rem;
  color: var(--text-2);
  font-family: "Inter", sans-serif;
  padding-left: 19px;
  display: block;
  margin-top: 6px;
}
```

**Remove `.episode-tag` CSS** (lines 463-470) — replaced by `.source-tag`.

**Update quote color** — in `.scene-quote` (line 448), change `var(--neon-yellow)` to `var(--neon-green)` to match the new brand:
```css
color: var(--neon-green);
text-shadow: 0 0 15px rgba(57, 255, 20, 0.2);
border-left: 3px solid var(--neon-green);
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/data/categories.js src/components/CategoryBar.jsx
git commit -m "feat: rebrand App.jsx to Channel Zero with new layout and styling"
```

---

### Task 9: Update index.html

Rebrand page metadata.

**Files:**
- Modify: `index.html:7-13`

- [ ] **Step 1: Update meta tags and title**

Replace lines 7-13:
```html
<meta name="description" content="So I Started Blasting — Random Frank Reynolds scenes from It's Always Sunny in Philadelphia" />
<meta property="og:title" content="So I Started Blasting" />
<meta property="og:description" content="Random Frank Reynolds scenes. Anyway, I started blasting." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
<title>So I Started Blasting</title>
```
with:
```html
<meta name="description" content="Channel Zero — We're experiencing technical difficulties. Random internet clips on a pirate TV." />
<meta property="og:title" content="Channel Zero" />
<meta property="og:description" content="We're experiencing technical difficulties. Random internet clips on a pirate TV." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
<title>Channel Zero</title>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: rebrand index.html metadata to Channel Zero"
```

---

### Task 10: Update FavoritesList Empty State

Update the copy to match the new brand.

**Files:**
- Modify: `src/components/FavoritesList.jsx:19-21`

- [ ] **Step 1: Update empty state text**

Change line 19-21:
```jsx
<p className="favorites-empty">
  No favorites yet. Start blasting and save the ones you love.
</p>
```
to:
```jsx
<p className="favorites-empty">
  No favorites yet. Keep blasting and save the ones you love.
</p>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FavoritesList.jsx
git commit -m "feat: update favorites empty state copy"
```

---

### Task 11: Smoke Test & Verify

Run the dev server and verify everything works.

**Files:** None (verification only)

- [ ] **Step 1: Install dependencies and start dev server**

```bash
npm install && npm run dev
```

- [ ] **Step 2: Verify in browser**

Check:
- Header shows "CHANNEL ZERO" in green monospace with dropdown + heart
- Dropdown has Vibe and Era optgroups, selecting one loads a clip
- CRT TV shows video with muted autoplay
- TV label says "CHANNEL ZERO"
- Quote, tag pills (colored), and source info display below TV
- "⚡ Blast Me" button loads new clips with channel-change transition
- Favorites add/remove works, SceneCards show source
- Responsive layout works on mobile viewport

- [ ] **Step 3: Fix any issues found**

Address anything broken during verification.

- [ ] **Step 4: Final commit if any fixes**

```bash
git add -A && git commit -m "fix: address issues from smoke test"
```

---

### Task 12: Build Verification

Ensure production build succeeds.

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 2: Preview production build**

```bash
npm run preview
```

Verify the built app works the same as dev.

- [ ] **Step 3: Commit if any build fixes needed**

```bash
git add -A && git commit -m "fix: resolve build issues"
```
