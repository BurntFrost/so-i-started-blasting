# 📺 Channel Zero

A pirate-TV-themed random video viewer showcasing the internet's funniest, strangest, and most iconic clips. Surf through 37+ clips spanning internet history — from Techno Viking to Coffin Dance — on a retro CRT TV with 90s channel-change transitions.

*"We're experiencing technical difficulties."*

**Live at [soistartedblasting.com](https://soistartedblasting.com)**

## What It Does

- **Random clips** — Loads a random internet video on every visit, muted autoplay
- **Blast again** — Hit **⚡ Blast Me** to channel-surf to another clip (avoids repeats)
- **Filter by vibe** — Chaotic Energy, Legendary Fails, Weird Flex, Unhinged Wisdom
- **Filter by era** — Early Internet (pre-2007), Viral Classics (2007–2015), Modern Chaos (2015+)
- **Favorites** — Save clips to a favorites list (persisted in localStorage)
- **CRT TV frame** — Retro bezel, scanlines, knobs, and channel-change transitions with static, color bars, and vertical hold roll

## How to Use It

1. Visit the site — a random clip starts playing in the CRT TV
2. Click **⚡ Blast Me** to load another random clip
3. Use the **dropdown** in the header to filter by vibe or era
4. Click the **♡ heart** on any clip to save it to favorites
5. Click **♥** in the header to view and replay your saved clips

## How It Works

### Architecture

The app is a single-page React app with no backend. Clips are defined in a static data file with YouTube video IDs, timestamps, quotes, and metadata. A random selection hook ensures you don't see the same clip twice in a row. Favorites persist in localStorage.

### Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React 18 |
| Build | Vite 8 |
| Styling | CSS-in-JS (template literal in App.jsx) |
| Video | YouTube iframe embeds with timestamp clipping |
| Storage | localStorage for favorites |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (auto-deploy on push to `main`) |

### Project Structure

```
src/
├── data/
│   ├── scenes.js            # 37+ curated internet clips with metadata
│   └── filters.js           # Vibe and era filter definitions + matching logic
├── hooks/
│   ├── useRandomScene.js    # Random selection with no-repeat queue
│   └── useFavorites.js      # localStorage persistence
├── components/
│   ├── ScenePlayer.jsx      # CRT TV frame + YouTube embed + tag pills
│   ├── FilterDropdown.jsx   # Vibe/era filter dropdown
│   ├── NeonButton.jsx       # The "Blast Me" button
│   ├── FavoritesList.jsx    # Slide-in favorites panel
│   ├── SceneCard.jsx        # Compact clip card for favorites
│   └── Toast.jsx            # Notification toasts
├── App.jsx                  # Main app + all styles
└── main.jsx                 # Entry point
```

### Clip Data Structure

Each clip in `src/data/scenes.js` looks like:

```js
{
  id: "techno-viking",
  videoId: "UjCdB5p2v0Y",     // YouTube video ID
  start: 0,                    // start time in seconds
  end: 30,                     // end time in seconds
  quote: "He points. You obey.",
  description: "The Viking commands the street parade.",
  vibes: ["chaotic-energy"],   // 1+ vibe tags
  era: "early-internet",       // era tag
  source: { title: "Techno Viking", year: 2000 },
}
```

**Vibe tags:** `chaotic-energy`, `legendary-fails`, `weird-flex`, `unhinged-wisdom`

**Era tags:** `early-internet`, `viral-classics`, `modern-chaos`

### Adding Clips

1. Find the YouTube video and note the video ID from the URL
2. Pick a 15–35 second window (start/end) that captures the iconic moment
3. Write a memorable quote and short description
4. Assign 1–2 vibes and 1 era
5. Add the object to the `SCENES` array in `src/data/scenes.js`

### Development

```bash
npm install
npm run dev        # starts dev server on port 3000
npm run build      # production build to dist/
```

### Design

Pirate TV aesthetic — dark background (`#0a0a08`), neon green (`#39ff14`) branding, `Special Elite` typewriter font for quotes, CRT TV frame with scanlines and channel-change transitions (white flash → static → SMPTE color bars → vertical hold roll), noise texture overlay.
