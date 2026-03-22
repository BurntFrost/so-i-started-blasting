# 🔫 So I Started Blasting

A random Frank Reynolds scene viewer from *It's Always Sunny in Philadelphia*. Each visit loads a random YouTube clip of Frank being Frank — filter by category, save your favorites, and blast through scenes all day.

**Live at [soistartedblasting.com](https://soistartedblasting.com)**

## What It Does

- **Random scenes** — Loads a random Frank Reynolds YouTube clip on every visit
- **Blast again** — Hit the button to get another random scene (avoids repeats)
- **Category filtering** — Browse scenes by vibe: Blasting, Schemes, Food, Rum Ham, Wisdom, Wild Card
- **Favorites** — Save the best scenes to a favorites list (persisted in localStorage)
- **Episode info** — Every scene shows the quote, description, season/episode, and title

## How to Use It

1. Visit the site — a random Frank scene starts playing
2. Click **🔫 Blast Me Again** to load another random scene
3. Use the **category chips** to filter scenes by type
4. Click the **♡ heart** on any scene to save it to favorites
5. Click **♥ Favorites** in the header to view and replay your saved scenes

## How It's Made

| Layer | Tech |
|-------|------|
| Framework | React 18 |
| Build | Vite 5 |
| Styling | CSS-in-JS (template literal in App.jsx) |
| Storage | localStorage for favorites |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (auto-deploy on push to `main`) |
| Domain | Custom domain via CNAME |

### Project Structure

```
src/
├── data/
│   ├── scenes.js          # Curated Frank Reynolds YouTube scenes
│   └── categories.js      # Category definitions (icons, colors)
├── hooks/
│   ├── useRandomScene.js   # Random selection with no-repeat queue
│   └── useFavorites.js     # localStorage persistence
├── components/
│   ├── ScenePlayer.jsx     # YouTube embed + quote + episode info
│   ├── CategoryBar.jsx     # Scrollable category filter chips
│   ├── NeonButton.jsx      # The "Blast Me" button
│   ├── FavoritesList.jsx   # Slide-in favorites panel
│   ├── SceneCard.jsx       # Compact scene card for favorites
│   └── Toast.jsx           # Notification toasts
├── App.jsx                 # Main app + all styles
└── main.jsx                # Entry point
```

### Adding Scenes

Add new scenes to `src/data/scenes.js`:

```js
{
  id: "unique-slug",
  videoId: "YouTubeVideoID",    // from the YouTube URL
  start: 12,                    // start time in seconds
  end: 45,                      // end time in seconds
  quote: "The best Frank quote from this scene.",
  description: "What's happening in the scene.",
  categories: ["blasting", "wisdom"],  // from categories.js
  episode: { season: 9, episode: 2, title: "Episode Title" },
}
```

### Development

```bash
npm install
npm run dev        # starts dev server on port 3000
npm run build      # production build to dist/
```

### Design

Paddy's Pub aesthetic — dark, grimy background with neon glows (red, yellow, green), `Special Elite` typewriter font for quotes, subtle noise texture overlay, and warm muted tones throughout.
