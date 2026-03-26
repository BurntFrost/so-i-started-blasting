# Channel Zero — "So I Started Blasting"

A pirate TV web app that plays random YouTube clips in a CRT television UI.

## Commands

```bash
npm run dev      # Vite dev server on port 3000
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

No test suite. Validate data changes with `node -c src/data/scenes.js`.

## Deployment

Auto-deploys to **Vercel** on push to `main`. Custom domain: `soistartedblasting.com`.
`vite.config.js` sets `base: "/"`. Build runs `scripts/sync-clips.js` before Vite (configured in `vercel.json`).

## Architecture

Vite + React 18 SPA. No TypeScript, no CSS modules — all styles are CSS-in-JS via a template literal in `App.jsx`.

```
src/
├── App.jsx                  # Root component + ALL CSS (~1300 lines)
├── main.jsx                 # React 18 createRoot entry
├── data/
│   ├── scenes.js            # 900 clips, ~10k lines — the content library
│   └── filters.js           # Vibe/era filter definitions, groups, matching helpers
├── engine/
│   └── blastEngine.js       # Scoring algorithm (recency, vibe/era diversity, weighted random)
├── players/
│   ├── createPlayer.js      # Factory: scene type → player instance
│   ├── PlayerBase.js         # Shared helpers (script loader, end-time enforcement)
│   ├── YouTubePlayer.js      # YouTube IFrame API
│   ├── VimeoPlayer.js        # Vimeo Player SDK
│   ├── StreamablePlayer.js   # Streamable iframe embed
│   ├── DailymotionPlayer.js  # Dailymotion Player SDK
│   └── DirectVideoPlayer.js  # HTML5 <video> for MP4/WebM URLs
├── components/
│   ├── ScenePlayer.jsx      # Multi-source player pool + CRT TV chrome
│   ├── FilterBar.jsx        # Right-side floating filter sidebar (vibes by group + eras)
│   ├── FavoritesList.jsx    # Slide-out favorites panel
│   ├── HistoryList.jsx      # Slide-out watch history panel
│   ├── SceneCard.jsx        # Card used in favorites/history lists
│   ├── NeonButton.jsx       # Styled button component
│   └── Toast.jsx            # Notification toast
└── hooks/
    ├── useBlastEngine.js    # Hook wrapper for blast engine (pool, history, filters)
    ├── useRandomScene.js    # Simple random selection with recency buffer (legacy)
    ├── useFavorites.js      # localStorage-backed favorites (key: sisb-favorites)
    └── useWatchHistory.js   # localStorage-backed history, max 50 (key: sisb-watch-history)
scripts/
├── sync-clips.js            # Build-time: generates api/_lib/scenes-data.js from scenes.js
├── verify-clips.mjs         # oEmbed batch verification for candidate clips
├── add-verified-clips.mjs   # Merge verified clips into scenes.js
└── ...                      # Other data pipeline utilities
api/                         # Vercel serverless functions
├── config.js               # Edge Config reader (maintenance, announcements, dead clips)
├── sweep.js                # Daily cron: checks all clips, updates Edge Config blocklist
├── sweep-report.js         # Public sweep report from Vercel Blob
└── _lib/
    ├── scenes-data.js       # Auto-generated clip catalog (from sync-clips.js)
    └── check-video.js       # Multi-platform video health checker (oEmbed + HEAD)
```

## Scene Data Schema

Each entry in `SCENES` array (`src/data/scenes.js`):

```js
{
  id: "kebab-case-id",        // Unique, descriptive
  type: "youtube",             // Optional: youtube (default), vimeo, streamable, dailymotion, video
  videoId: "YouTube_ID",       // For YouTube/Vimeo/Streamable/Dailymotion
  videoUrl: "https://...",     // For type: "video" only (direct MP4/WebM URL)
  start: 0,                   // Start timestamp in seconds
  end: 30,                    // End timestamp in seconds
  quote: "Memorable line",    // Displayed under the TV
  description: "Context",     // Brief scene description
  vibes: ["chaotic-energy"],  // Array of vibe filter keys
  era: "viral-classics",      // Single era key
  source: { title: "Show Name", year: 2005 }
}
```

**Vibe Groups** (each vibe belongs to a group, displayed in FilterBar sidebar):

| Group | Vibes |
|-------|-------|
| 🔥 Intense | chaotic-energy, dangerous, epic-fight-scenes, disturbing, body-horror |
| 🌀 Mind-Melt | fever-dream, dark-humor, existential-dread, sensory-overload, absurdist |
| 🤪 Unhinged | unhinged, unhinged-wisdom, unhinged-shorts, cursed-content, weird-flex |
| 😌 Good Vibes | wholesome-chaos, chaotic-good, pure-nostalgia, awkward-gold, epic-recovery |
| 🎬 Entertainment | iconic-cinema, legendary-fails, musical-mayhem, synchronicity, funny-revenge |

**Eras** (one-per-clip): early-internet, viral-classics, modern-chaos, ancient-web

New vibes/eras must be added to both `filters.js` (definition) and the relevant clips in `scenes.js`.

## Vercel Infrastructure

- **Daily sweep cron** (`/api/sweep`, 6 AM UTC): checks all clips via oEmbed/HEAD, writes report to Vercel Blob, updates Edge Config `deadClips` blocklist, opens GitHub issue if dead links found
- **Edge Config** (`/api/config`): serves `maintenance`, `announcement`, `featuredClipId`, `deadClips` — frontend fetches on mount
- **Vercel Blob**: stores `sweep-report.json` (public); readable via `/api/sweep-report`
- Env vars needed: `EDGE_CONFIG`, `VERCEL_API_TOKEN` (for Edge Config writes), `CRON_SECRET`, `GITHUB_TOKEN` (for issue creation)

## YouTube Player Gotchas

- Videos start **muted** for browser autoplay compliance; unmuted after first user click (`hasInteracted` flag)
- Volume is set to 100 in three places (onReady, onStateChange playing, useEffect on hasInteracted) — this triple-redundancy is intentional due to YouTube API timing quirks
- Singleton `loadYTApi()` lazily loads the IFrame API script once
- Player is destroyed and recreated on every scene change (YT.Player replaces its target DOM element)
- Error codes 100/101/150 auto-advance to next clip; code 5 (HTML5 error) does not
- "Ended" state (0) has a guard against spurious fires — checks `currentTime` proximity to clip end

## Hooks (`.claude/settings.json`)

- **PreToolUse**: Blocks editing `.env` files and lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`)
- **PostToolUse**: Auto-runs prettier on code files after edits

## Gotchas

- `scenes.js` is ~10k lines. Bulk edits are fragile — prefer targeted edits or programmatic scripts over mass find-and-replace
- All CSS lives in `App.jsx` as a template literal, not in separate files
- No TypeScript — all files are `.js`/`.jsx`
- `useRandomScene` keeps a recency buffer of 5 to prevent back-to-back repeats
- `blastEngine.js` has a HARD_COOLDOWN of 100 plays — no clip repeats within that window
- localStorage keys are prefixed `sisb-` (so-i-started-blasting):
  - `sisb-favorites`: saved clip IDs
  - `sisb-watch-history`: watch history (max 50)
