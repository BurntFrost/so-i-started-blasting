# 📺 Channel Zero

A pirate-TV-themed random video viewer showcasing the internet's funniest, strangest, and most iconic clips. Surf through 159 clips spanning internet history — from Dancing Baby (1996) to CT's Challenge moments — on a retro CRT TV with 90s channel-change transitions. Videos auto-advance when they end, so you can sit back and let the chaos wash over you.

*"We're experiencing technical difficulties."*

**Live at [soistartedblasting.com](https://soistartedblasting.com)**

## What It Does

- **Splash screen** — "Start Blasting" entry screen enables unmuted autoplay
- **Random clips** — Loads a random internet video, auto-advances when it ends
- **Blast again** — Hit **⚡ Blast Me** to channel-surf to another clip (avoids repeats)
- **Filter by vibe** — Chaotic Energy, Legendary Fails, Weird Flex, Unhinged Wisdom, Pure Nostalgia, Wholesome Chaos, Cursed Content, Musical Mayhem, Dangerous, Disturbing, Chaotic Good, Iconic Cinema, Unhinged Shorts, Unhinged, Epic Fight Scenes, Synchronicity
- **Filter by era** — Ancient Web (pre-2000), Early Internet (2000–2007), Viral Classics (2007–2015), Modern Chaos (2015+)
- **Favorites** — Save clips to a favorites list (persisted in localStorage)
- **Watch history** — Browse your last 50 watched clips with timestamps (persisted in localStorage)
- **Error recovery** — Unavailable or non-embeddable videos auto-skip to the next clip
- **CRT TV frame** — Retro bezel, knobs, and channel-change transitions with static, color bars, and vertical hold roll
- **Integrated UI** — Scene info, blast button, and favorite toggle built into the TV body

## How to Use It

1. Click **⚡ Start Blasting** on the splash screen — this enables audio
2. Click **⚡ Blast Me** to channel-surf to another random clip
3. Use the **dropdown** in the header to filter by vibe or era
4. Click the **♡ heart** on any clip to save it to favorites
5. Click **♥** in the header to view and replay your saved clips
6. Click **📼 History** to browse your recently watched clips
7. Or just let clips auto-play one after another

## How It Works

### Architecture

The app is a single-page React app with no backend. Clips are defined in a static data file with YouTube video IDs, timestamps, quotes, and metadata. The YouTube IFrame API handles playback — when a video ends (state `0`) or errors out (codes 100/101/150), the app automatically advances to the next random clip. A random selection hook keeps a recency buffer of 5 to prevent repeats. Favorites and watch history persist in localStorage.

### Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React 18 |
| Build | Vite 8 |
| Styling | CSS-in-JS (template literal in App.jsx) |
| Video | YouTube IFrame API with timestamp clipping |
| Storage | localStorage for favorites + watch history |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (auto-deploy on push to `main`) |

### Project Structure

```
src/
├── data/
│   ├── scenes.js            # 159 curated internet clips with metadata
│   └── filters.js           # Vibe and era filter definitions + matching logic
├── hooks/
│   ├── useRandomScene.js    # Random selection with recency buffer (avoids repeats)
│   ├── useFavorites.js      # localStorage-backed favorites
│   └── useWatchHistory.js   # localStorage-backed watch history (max 50)
├── components/
│   ├── ScenePlayer.jsx      # CRT TV frame + YouTube player + info bar + controls
│   ├── FilterDropdown.jsx   # Vibe/era filter dropdown
│   ├── NeonButton.jsx       # Styled button component
│   ├── FavoritesList.jsx    # Slide-in favorites panel
│   ├── HistoryList.jsx      # Slide-in watch history panel
│   ├── SceneCard.jsx        # Compact clip card for favorites/history
│   └── Toast.jsx            # Notification toasts
├── App.jsx                  # Main app + all styles (CSS-in-JS)
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

**Vibe tags:** `chaotic-energy`, `legendary-fails`, `weird-flex`, `unhinged-wisdom`, `pure-nostalgia`, `wholesome-chaos`, `cursed-content`, `musical-mayhem`, `dangerous`, `disturbing`, `chaotic-good`, `iconic-cinema`, `unhinged-shorts`, `unhinged`, `epic-fight-scenes`, `synchronicity`

**Era tags:** `ancient-web`, `early-internet`, `viral-classics`, `modern-chaos`

### Adding Clips

1. Find the YouTube video and note the video ID from the URL
2. Pick a 15–60 second window (start/end) that captures the iconic moment
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

Pirate TV aesthetic — dark background (`#0a0a08`), neon green (`#39ff14`) branding, `Special Elite` typewriter font for quotes, CRT TV frame with channel-change transitions (white flash → static → SMPTE color bars → vertical hold roll), noise texture overlay. Scene info and controls are built into the TV body as distinct sections — an info bar (quote, description, tags, favorite) and a controls strip (branding, knobs, LED indicator).
