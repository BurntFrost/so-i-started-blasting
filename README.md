# 📺 Channel Zero

A pirate-TV web app that blasts random video clips through a CRT television you can't turn off. 416 curated clips from YouTube, Vimeo, and Dailymotion spanning the entire internet era — from Dancing Baby to modern chaos — with an AI engine that learns your taste and suggests more.

Nobody asked for this. You're welcome.

**Live at [soistartedblasting.com](https://soistartedblasting.com)**

---

## What It Does

**The short version:** Click a button. Watch a clip. Click it again. Repeat until you've wasted an hour. Congratulations, you've been blasted.

**The longer version:** Channel Zero is a retro pirate TV station simulator. It plays curated 15–60 second clips from across internet history in a CRT television UI. A weighted scoring algorithm maximizes variety across vibes and eras while suppressing recently-played clips. An optional AI mode (BYOK Claude API key) suggests new clips based on your watch history, verified in real-time, and streamed to your TV one at a time.

| Feature | Description |
|---------|-------------|
| **⚡ Blast Me** | Weighted selection algorithm balances recency, vibe diversity, and era variety |
| **416 clips** | Curated library spanning Ancient Web → Early Internet → Viral Classics → Modern Chaos |
| **Multi-source video** | YouTube, Vimeo, Dailymotion, Streamable, and direct MP4/WebM |
| **19 vibe filters** | Chaotic Energy, Legendary Fails, Iconic Cinema, Cursed Content, Unhinged Wisdom, and more |
| **4 era filters** | Ancient Web, Early Internet, Viral Classics, Modern Chaos |
| **Favorites & History** | Heart clips to save them, browse your last 50 watches |
| **📡 AI Pick** | Claude-powered clip suggestions streamed live (bring your own API key) |
| **CRT TV chrome** | Retro bezel, channel-change transitions (static → color bars → vertical hold roll) |

---

## How to Use It

### Normal Mode

1. Click **⚡ Start Blasting** on the splash screen (this enables audio — browsers require a click before unmuting)
2. Click **⚡ Blast Me** to channel-surf to a random clip
3. Use the **filter pills** to narrow by vibe or era
4. Click **♡** on any clip to save it to favorites
5. Click **♥** in the header to view and replay saved clips
6. Click **📼 History** to browse recently watched clips
7. Or just sit back — clips auto-advance when they end, like real TV but worse

### AI Discovery

1. Click the **📡 AI Pick** button on the TV
2. First time: paste your **Claude API key** in the inline input
3. Claude suggests clips based on your watch history, verified against YouTube in real-time
4. Verified clips stream in one at a time
5. Click **⚡ Blast Me** to exit back to normal mode

---

## Architecture

### Overview

```mermaid
graph TB
    subgraph Browser
        App["App.jsx<br/><i>root + all CSS</i>"]
        App --> BE["useBlastEngine"]
        App --> AI["useAiDiscovery"]
        App --> SP["ScenePlayer"]

        BE --> Engine["blastEngine.js<br/><i>weighted scoring</i>"]
        AI --> Stream["streamClient.js<br/><i>SSE parser</i>"]

        SP --> Pool["Player Pool"]
        Pool --> YT["YouTubePlayer"]
        Pool --> VM["VimeoPlayer"]
        Pool --> DM["DailymotionPlayer"]
        Pool --> ST["StreamablePlayer"]
        Pool --> DV["DirectVideoPlayer"]
    end

    subgraph Vercel
        Dial["/api/dial"]
        Validate["/api/validate"]
        Sweep["/api/sweep"]
        Dial --> Claude["Claude Haiku 4.5"]
        Dial --> Verify["YouTube oEmbed"]
        Sweep --> Blob["Vercel Blob"]
        Sweep --> GH["GitHub Issues"]
    end

    Stream -->|"SSE stream"| Dial

    style App fill:#39ff14,color:#0a0a08,stroke:#39ff14
    style Pool fill:#1a1a18,color:#39ff14,stroke:#39ff14
    style Claude fill:#d4a574,color:#0a0a08,stroke:#d4a574
    style Blob fill:#1a1a18,color:#39ff14,stroke:#39ff14
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 (client-side SPA) |
| Build | Vite 8 |
| Styling | CSS-in-JS (one massive template literal in App.jsx, as god intended) |
| Video | Multi-source player pool (YouTube, Vimeo, Dailymotion, Streamable, HTML5 video) |
| State | React hooks + localStorage (no Redux, no context, no regrets) |
| AI | Claude Haiku 4.5 via Anthropic API (BYOK — your key, your bill) |
| API | Vercel Serverless Functions |
| Hosting | Vercel (SPA + API functions + cron jobs) |

**Runtime dependencies:** `react`, `react-dom`, `@vercel/blob`. That's it. We don't believe in bloat.

### The Blast Engine

The app doesn't just pick random clips — it uses a weighted scoring algorithm because random selection is for amateurs who enjoy watching the same clip three times in a row.

Every candidate scene gets a score from 0 to 1:

```mermaid
pie title Blast Engine Score Weights
    "Recency (40%)" : 40
    "Vibe Diversity (30%)" : 30
    "Random Jitter (20%)" : 20
    "Era Diversity (10%)" : 10
```

| Factor | What It Does |
|--------|-------------|
| **Recency** | Recently played scenes get suppressed. Cooldown = 50% of pool size. |
| **Vibe Diversity** | Penalizes clips sharing vibes with your last 5 watches. |
| **Era Diversity** | Penalizes same era as your last 3 watches. |
| **Random Jitter** | Ensures you can't predict what's next. |

The engine also **pre-warms** the next clip — while you're watching, the next scene is already buffered in a hidden player pool. When you blast, it swaps instantly.

### AI Discovery Pipeline

```mermaid
sequenceDiagram
    actor User
    participant UI as ScenePlayer
    participant API as /api/dial
    participant Claude as Claude Haiku 4.5
    participant YT as YouTube oEmbed

    User->>UI: clicks 📡 AI Pick
    UI->>API: POST /api/dial (Bearer: user's key)
    API->>Claude: prompt with watch history + vibes
    Claude-->>API: JSON array of suggestions

    loop For each suggestion
        API->>YT: verify video exists
        alt Video exists
            API-->>UI: SSE stream → play clip
        else Video missing
            Note over API: silently dropped
        end
    end

    API-->>UI: SSE: [DONE]
```

No server-side API keys — your Claude key is passed per-request and never stored. Your key, your bill, our plausible deniability.

### Dead Link Sweeper

416 clips across 5 platforms means links die constantly. A weekly cron job checks every clip via oEmbed/HEAD requests, stores results in Vercel Blob, and files a GitHub Issue if any are dead.

### Deployment

```mermaid
graph LR
    Push["git push main"] --> Vercel["Vercel"]
    Vercel --> Build["Build SPA"]
    Build --> Deploy["Deploy"]
    Deploy --> SPA["Static SPA"]
    Deploy --> API["API Functions"]
    Deploy --> Cron["Cron Jobs"]

    style Vercel fill:#000,color:#fff,stroke:#39ff14
    style SPA fill:#1a1a18,color:#39ff14,stroke:#39ff14
    style API fill:#1a1a18,color:#39ff14,stroke:#39ff14
    style Cron fill:#1a1a18,color:#39ff14,stroke:#39ff14
```

Push to `main` → Vercel builds the Vite SPA → deploys everything. No split pipelines, no drama.
