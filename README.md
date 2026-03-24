# 📺 Channel Zero

A pirate-TV web app that plays random YouTube clips in a CRT television UI. 350+ curated clips spanning internet history — from Dancing Baby to modern chaos — with an AI discovery engine that finds new clips based on your viewing habits.

*"We're experiencing technical difficulties."*

**Live at [soistartedblasting.com](https://soistartedblasting.com)**

---

## What It Does

**Core experience:** Click in and watch. Clips auto-advance when they end. Hit ⚡ Blast Me to channel-surf. Filter by vibe or era to steer the chaos. Save favorites. Let the internet wash over you.

**AI Discovery:** Bring your own Claude API key to unlock two new modes:
- **Channel Dial** 📡 — Spin the dial past the normal channels into the pirate zone. Claude suggests clips based on your watch history, verified against YouTube in real-time, and streamed to your TV one at a time.
- **VHS Tape** 📼 — Insert a mystery tape. Claude studies your taste profile and assembles a themed mini-playlist (4-6 clips) with a mood arc. Tapes auto-save to a shelf for replay.

### Full Feature List

| Feature | Description |
|---------|-------------|
| **Random clips** | Weighted selection algorithm balances recency, vibe diversity, and era variety |
| **350+ clips** | Curated library spanning ancient web → early internet → viral classics → modern chaos |
| **19 vibe filters** | Chaotic Energy, Legendary Fails, Iconic Cinema, Cursed Content, Unhinged Wisdom, and 14 more |
| **4 era filters** | Ancient Web, Early Internet, Viral Classics, Modern Chaos |
| **Favorites** | Heart any clip to save it (persisted in localStorage) |
| **Watch history** | Browse your last 50 watched clips with timestamps |
| **AI Channel Dial** | Claude-powered clip suggestions streamed via SSE (BYOK) |
| **AI VHS Tapes** | Claude-curated themed playlists with mood arcs (BYOK) |
| **Tape Shelf** | Replay saved AI tapes without using API credits (max 5) |
| **Service Panel** | Flip the TV around to enter your Claude API key |
| **Error recovery** | Dead or non-embeddable videos auto-skip seamlessly |
| **CRT TV chrome** | Retro bezel, channel-change transitions (static → color bars → vertical hold roll) |

---

## How to Use It

### Basic Mode

1. Click **⚡ Start Blasting** on the splash screen (enables audio)
2. Click **⚡ Blast Me** to channel-surf to a random clip
3. Use the **filter bar** to narrow by vibe or era (multi-select, AND logic)
4. Click **♡** on any clip to save it to favorites
5. Click **♥** in the header to view and replay saved clips
6. Click **📼 History** to browse recently watched clips
7. Or just sit back — clips auto-advance when they end

### AI Discovery Mode

1. Click the **🔧 wrench** on the TV to flip to the back panel
2. Paste your **Claude API key** into the Signal Decoder port
3. LED goes green when validated — TV auto-flips back
4. The **channel dial** (right side) and **VHS slot** (below TV) are now powered
5. **Dial:** Click the 📡 PIRATE zone to scan for AI-suggested clips
6. **Tape:** Click INSERT TAPE to generate a themed playlist
7. Click **⚡ Blast Me** (dimmed in AI mode) to exit back to normal

---

## Architecture

### High-Level

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│                                                              │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ App.jsx  │──▶│ useBlastEngine│──▶│ blastEngine.js       │ │
│  │ (root +  │   │ (weighted     │   │ (scoring algorithm)  │ │
│  │  all CSS)│   │  selection)   │   └──────────────────────┘ │
│  │          │   └──────────────┘                             │
│  │          │   ┌──────────────┐   ┌──────────────────────┐ │
│  │          │──▶│useAiDiscovery│──▶│ streamClient.js      │ │
│  │          │   │ (dial, tape, │   │ (fetch+ReadableStream│ │
│  │          │   │  shelf state)│   │  SSE parser)         │ │
│  │          │   └──────────────┘   └──────────┬───────────┘ │
│  │          │                                  │             │
│  │          │──▶ ScenePlayer ──▶ YouTube IFrame API          │
│  │          │──▶ ChannelDial, VHSSlot, TapeShelf             │
│  │          │──▶ ServicePanel (3D flip)                      │
│  └──────────┘                                  │             │
└────────────────────────────────────────────────┼─────────────┘
                                                 │ HTTPS POST
                                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Functions                           │
│                                                              │
│  /api/dial.js ──┐                                            │
│  /api/tape.js ──┤──▶ claude.js ──▶ Anthropic API (Haiku)    │
│  /api/validate──┘    verify.js ──▶ YouTube oEmbed            │
│                      prompts.js    (video existence check)   │
│                                                              │
│  Response: SSE stream (data: {scene}\n\n ... data: [DONE])  │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 (client-side SPA) |
| Build | Vite 8 |
| Styling | CSS-in-JS (template literal in App.jsx — ~1500 lines) |
| Video | YouTube IFrame API with timestamp clipping |
| State | React hooks + localStorage (no external state library) |
| AI | Claude Haiku 4.5 via Anthropic API (BYOK) |
| Streaming | `fetch()` + `ReadableStream` (SSE format) |
| API | Vercel Serverless Functions |
| Hosting | GitHub Pages (static) + Vercel (API routes) |
| CI/CD | GitHub Actions (auto-deploy on push to `main`) |

**Dependencies:** React and React DOM. That's it.

### Project Structure

```
src/
├── App.jsx                  # Root component + ALL CSS (~2000 lines)
├── main.jsx                 # React 18 createRoot entry
├── data/
│   ├── scenes.js            # 350+ clips (3900+ lines) — the content library
│   └── filters.js           # 19 vibes + 4 eras, matching logic
├── engine/
│   └── blastEngine.js       # Weighted scoring algorithm
├── lib/
│   └── streamClient.js      # fetch + ReadableStream SSE parser
├── hooks/
│   ├── useBlastEngine.js    # Scene selection with diversity scoring + pre-warming
│   ├── useFavorites.js      # localStorage favorites (key: sisb-favorites)
│   ├── useWatchHistory.js   # localStorage history, max 50 (key: sisb-watch-history)
│   ├── useApiKey.js         # Claude API key management (key: sisb-api-key)
│   └── useAiDiscovery.js    # AI mode state manager (dial, tape, shelf, discoveries)
└── components/
    ├── ScenePlayer.jsx      # YouTube player + CRT TV chrome + AI overlays
    ├── FilterBar.jsx        # Grouped vibe/era filter pills
    ├── ChannelDial.jsx      # Rotary knob with pirate zone
    ├── VHSSlot.jsx          # Tape insertion slot
    ├── TapeShelf.jsx        # Saved tape cassettes (max 5)
    ├── ServicePanel.jsx     # API key back panel (3D flip)
    ├── FavoritesList.jsx    # Slide-out favorites panel
    ├── HistoryList.jsx      # Slide-out watch history panel
    ├── SceneCard.jsx        # Card for favorites/history lists
    ├── NeonButton.jsx       # Styled button component
    └── Toast.jsx            # Notification toast

api/                         # Vercel serverless functions
├── dial.js                  # SSE endpoint — channel dial discovery
├── tape.js                  # SSE endpoint — VHS tape curation
├── validate.js              # API key validation
└── _lib/
    ├── claude.js            # Claude API client (BYOK, per-request key)
    ├── verify.js            # YouTube oEmbed verification
    └── prompts.js           # Prompt templates + vocabulary constants
```

---

## The Blast Engine

The app doesn't just pick random clips — it uses a **weighted multi-factor scoring algorithm** to maximize variety and minimize repetition.

### How It Scores

Every candidate scene gets a score from 0 to 1 based on four factors:

| Factor | Weight | What It Does |
|--------|--------|-------------|
| **Recency** | 40% | Recently played scenes get suppressed. Cooldown window = 50% of pool size. |
| **Vibe Diversity** | 30% | Penalizes clips with overlapping vibes from last 5 watches. |
| **Era Diversity** | 10% | Penalizes same era as last 3 watches. |
| **Random Jitter** | 20% | `Math.random()` ensures non-deterministic ordering. |

The highest-scoring scene wins. History tracks 200 plays. Pre-computation picks the next-next scene for player pre-warming.

### Pre-Warming

Two YouTube players run simultaneously:
1. **Main player** — plays the current clip
2. **Hidden pre-warm player** — silently loads the predicted next clip

When you blast, the next clip is already buffered. This dramatically reduces perceived latency during rapid channel-surfing.

---

## AI Discovery Pipeline

### Channel Dial Flow

```
User clicks 📡 PIRATE
    → useAiDiscovery.spinDial()
    → POST /api/dial (Bearer: user's Claude key)
    → Server: buildDialPrompt(watchHistory, activeVibes)
    → Server: callClaude() → JSON array of 5-8 suggestions
    → Server: for each suggestion:
        → sanitizeScene() (validate schema, constrain vibes/eras)
        → verifyVideo() (YouTube oEmbed check)
        → if valid: stream as SSE event
    → Client: accumulate dialResults, play first immediately
    → Clips auto-advance, dial can be re-spun
```

### VHS Tape Flow

```
User clicks INSERT TAPE
    → useAiDiscovery.insertTape()
    → POST /api/tape (Bearer: user's Claude key)
    → Server: buildTapePrompt(watchHistory, favorites)
    → Server: callClaude() → JSON object: { name, theme, clips[] }
    → Server: stream tape metadata first, then verified clips
    → Client: show VCR loading screen, then play clips sequentially
    → On completion: auto-save tape to shelf (max 5, localStorage)
```

### Verification

Claude suggests YouTube video IDs from its training knowledge. Before streaming each suggestion to the client, the server validates it exists via YouTube oEmbed (`GET https://www.youtube.com/oembed?url=...`). Invalid suggestions are silently dropped — the user just gets fewer results.

### Prompt Design

Both prompts include:
- The user's recent watch history (resolved to full scene objects with titles, vibes, eras)
- The complete list of valid vibes and eras (preventing Claude from inventing tags)
- Instructions to return a JSON array/object with specific fields
- Emphasis on well-known, iconic YouTube content

The tape prompt additionally asks for a **mood arc** — start weird, escalate to chaotic, end with something unexpectedly wholesome.

---

## YouTube Player Gotchas

These are hard-won lessons from fighting the YouTube IFrame API:

- **Autoplay requires mute.** Videos start muted for browser compliance. Audio enables after the user's first interaction.
- **Triple volume redundancy.** Volume is set to 100 in `onReady`, `onStateChange(PLAYING)`, and a `useEffect` on `hasInteracted`. This triple-set is intentional — YouTube API has timing quirks where any single set can be ignored.
- **Spurious "ended" events.** The player sometimes fires state `0` (ended) before the clip actually ends. A guard checks `currentTime` proximity to the clip's `end` timestamp.
- **Error auto-advance.** Codes 100 (not found), 101/150 (not embeddable) trigger auto-skip. Code 5 (HTML5 error) does not — it might recover.
- **Player reuse.** The player is created once on mount and reused via `loadVideoById()` on scene change. No destroy/recreate cycle.

---

## Clip Data Schema

Each entry in `src/data/scenes.js`:

```js
{
  id: "techno-viking",           // Unique kebab-case identifier
  videoId: "UjCdB5p2v0Y",       // 11-char YouTube video ID
  start: 0,                      // Start timestamp (seconds)
  end: 30,                       // End timestamp (seconds)
  quote: "He points. You obey.", // Displayed under the TV
  description: "The Viking commands the street parade.",
  vibes: ["chaotic-energy"],     // 1+ vibes from VALID_VIBES
  era: "early-internet",         // Single era from VALID_ERAS
  source: { title: "Techno Viking", year: 2000 }
}
```

**Vibes** (19): chaotic-energy, dangerous, epic-fight-scenes, disturbing, unhinged, unhinged-wisdom, unhinged-shorts, cursed-content, weird-flex, wholesome-chaos, chaotic-good, pure-nostalgia, awkward-gold, epic-recovery, iconic-cinema, legendary-fails, musical-mayhem, synchronicity, funny-revenge

**Eras** (4): ancient-web, early-internet, viral-classics, modern-chaos

### Adding Clips

1. Find the YouTube video and note the 11-character video ID
2. Pick a 15-60 second window (start/end) capturing the iconic moment
3. Write a memorable quote and short description
4. Assign 1-2 vibes and 1 era
5. Add the object to `SCENES` in `src/data/scenes.js`
6. Add any new vibes/eras to `src/data/filters.js`

---

## localStorage Keys

All keys prefixed `sisb-` (so-i-started-blasting):

| Key | Purpose | Cap |
|-----|---------|-----|
| `sisb-blast-history` | Play history for the scoring algorithm | 200 IDs |
| `sisb-favorites` | Saved clip IDs | Unlimited |
| `sisb-watch-history` | Recently watched with timestamps | 50 entries |
| `sisb-api-key` | Claude API key (raw string) | 1 |
| `sisb-tapes` | Saved AI-curated tape playlists | 5 tapes |
| `sisb-ai-discoveries` | Rolling log of AI-discovered clips | 50 scenes |

---

## Development

```bash
npm install
npm run dev          # Vite dev server on port 3000 (frontend only)
vercel dev           # Full stack: Vite + serverless API routes
npm run build        # Production build → dist/
npm run preview      # Preview production build
```

**`npm run dev`** serves the frontend only — AI features won't work (no API routes).

**`vercel dev`** runs both the Vite frontend and the `/api` serverless functions locally. Requires `vercel link` first.

### Design Language

Pirate TV aesthetic — dark background (`#0a0a08`), neon green (`#39ff14`) branding, Special Elite typewriter font for quotes, monospace for tech elements. CRT TV frame with channel-change transitions (white flash → static → SMPTE color bars → vertical hold roll). Noise texture overlay across the entire page.

The AI hardware elements (channel dial, VHS slot, service panel) are styled as physical TV peripherals — bakelite knobs, cassette tape labels, brass decoder ports, status LEDs.
