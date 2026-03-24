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

Auto-deploys to **GitHub Pages** on push to `main` (`.github/workflows/deploy.yml`).
`vite.config.js` sets `base: "/"` — change this if the site moves to a subpath.

## Architecture

Vite + React 18 SPA. No TypeScript, no CSS modules — all styles are CSS-in-JS via a template literal in `App.jsx`.

```
src/
├── App.jsx                  # Root component + ALL CSS (850 lines of styles)
├── main.jsx                 # React 18 createRoot entry
├── data/
│   ├── scenes.js            # 159 clips, 1800+ lines — the content library
│   └── filters.js           # Vibe/era filter definitions + matching helpers
├── lib/
│   └── streamClient.js      # fetch + ReadableStream SSE parser
├── components/
│   ├── ScenePlayer.jsx      # YouTube IFrame API player + CRT TV chrome + AI Pick button
│   ├── FilterDropdown.jsx   # Category selector
│   ├── FavoritesList.jsx    # Slide-out favorites panel
│   ├── HistoryList.jsx      # Slide-out watch history panel
│   ├── SceneCard.jsx        # Card used in favorites/history lists
│   ├── NeonButton.jsx       # Styled button component
│   └── Toast.jsx            # Notification toast
└── hooks/
    ├── useRandomScene.js    # Random scene selection with recency buffer (avoids repeats)
    ├── useFavorites.js      # localStorage-backed favorites (key: sisb-favorites)
    ├── useWatchHistory.js   # localStorage-backed history, max 50 (key: sisb-watch-history)
    ├── useApiKey.js         # localStorage API key management with error differentiation (key: sisb-api-key)
    └── useAiDiscovery.js    # AI mode state manager (discoveries)
api/                         # Vercel serverless functions (AI pipeline)
├── dial.js                  # SSE endpoint — AI clip discovery
├── validate.js              # API key validation
└── _lib/
    ├── claude.js            # Claude API client (BYOK)
    ├── verify.js            # YouTube oEmbed verification
    └── prompts.js           # Prompt templates + vocabulary
```

## Scene Data Schema

Each entry in `SCENES` array (`src/data/scenes.js`):

```js
{
  id: "kebab-case-id",        // Unique, descriptive
  videoId: "YouTube_ID",       // 11-char YouTube video ID
  start: 0,                   // Start timestamp in seconds
  end: 30,                    // End timestamp in seconds
  quote: "Memorable line",    // Displayed under the TV
  description: "Context",     // Brief scene description
  vibes: ["chaotic-energy"],  // Array of vibe filter keys
  era: "viral-classics",      // Single era key
  source: { title: "Show Name", year: 2005 }
}
```

**Vibes** (tags, many-per-clip): chaotic-energy, legendary-fails, weird-flex, unhinged-wisdom, pure-nostalgia, wholesome-chaos, cursed-content, musical-mayhem, dangerous, disturbing, chaotic-good, iconic-cinema, unhinged-shorts, unhinged, epic-fight-scenes, synchronicity

**Eras** (one-per-clip): early-internet, viral-classics, modern-chaos, ancient-web

New vibes/eras must be added to both `filters.js` (definition) and the relevant clips in `scenes.js`.

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

- `scenes.js` is huge (1800+ lines). Bulk edits to this file are fragile — prefer targeted edits or programmatic scripts over mass find-and-replace
- All CSS lives in `App.jsx` as a template literal, not in separate files
- No TypeScript — all files are `.js`/`.jsx`
- `useRandomScene` keeps a recency buffer of 5 to prevent back-to-back repeats
- localStorage keys are prefixed `sisb-` (so-i-started-blasting):
  - `sisb-favorites`: saved clip IDs
  - `sisb-watch-history`: watch history (max 50)
  - `sisb-api-key`: Claude API key for AI features
  - `sisb-ai-discoveries`: rolling AI discovery log (max 50)
