import { useState, useEffect, useCallback, useMemo } from "react";
import { SCENES } from "./data/scenes.js";
import { CATEGORIES } from "./data/categories.js";
import { useRandomScene } from "./hooks/useRandomScene.js";
import { useFavorites } from "./hooks/useFavorites.js";
import { ScenePlayer } from "./components/ScenePlayer.jsx";
import { CategoryBar } from "./components/CategoryBar.jsx";
import { NeonButton } from "./components/NeonButton.jsx";
import { Toast } from "./components/Toast.jsx";
import { FavoritesList } from "./components/FavoritesList.jsx";

const CSS = `
  :root {
    --bg-0: #0a0a08;
    --bg-1: #151510;
    --bg-2: #1f1f18;
    --border: rgba(255, 200, 50, 0.08);
    --neon-green: #39ff14;
    --neon-red: #ff1744;
    --neon-yellow: #ffd600;
    --text-0: #e8e4d8;
    --text-1: #a09880;
    --text-2: #6b6350;
    font-family: "Inter", system-ui, sans-serif;
    color: var(--text-0);
  }

  body {
    background: var(--bg-0);
    min-height: 100dvh;
    position: relative;
  }

  /* Noise texture overlay */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 9999;
  }

  .app {
    max-width: 700px;
    margin: 0 auto;
    padding: 24px 16px 80px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 24px;
  }

  .title {
    font-family: "Special Elite", cursive;
    font-size: clamp(1.8rem, 5vw, 2.8rem);
    color: var(--neon-red);
    text-shadow:
      0 0 10px rgba(255, 23, 68, 0.5),
      0 0 40px rgba(255, 23, 68, 0.2);
    letter-spacing: 0.02em;
    line-height: 1.1;
  }

  .subtitle {
    font-family: "Special Elite", cursive;
    font-size: 0.9rem;
    color: var(--text-1);
    margin-top: 4px;
  }

  .header-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 12px;
  }

  .fav-toggle {
    background: none;
    border: 1px solid var(--border);
    color: var(--neon-red);
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-family: "Inter", sans-serif;
    transition: all 0.2s;
  }

  .fav-toggle:hover {
    border-color: var(--neon-red);
    background: rgba(255, 23, 68, 0.08);
  }

  /* Category bar */
  .category-bar {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 0 12px;
    scrollbar-width: none;
  }

  .category-bar::-webkit-scrollbar {
    display: none;
  }

  .category-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--bg-1);
    color: var(--text-1);
    font-size: 0.8rem;
    font-family: "Inter", sans-serif;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .category-chip:hover {
    border-color: var(--chip-color, var(--text-1));
    color: var(--text-0);
  }

  .chip-active {
    border-color: var(--chip-color);
    color: var(--chip-color);
    text-shadow: 0 0 8px var(--chip-color);
    box-shadow: 0 0 12px color-mix(in srgb, var(--chip-color) 20%, transparent);
  }

  .chip-icon {
    font-size: 1rem;
  }

  .chip-count {
    font-size: 0.7rem;
    opacity: 0.6;
  }

  /* Scene player */
  .scene-player {
    margin-top: 8px;
  }

  .video-wrapper {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid var(--border);
    box-shadow:
      inset 0 0 30px rgba(0, 0, 0, 0.5),
      0 4px 20px rgba(0, 0, 0, 0.4);
  }

  .video-wrapper iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .scene-info {
    padding: 16px 0;
  }

  .scene-quote {
    font-family: "Special Elite", cursive;
    font-size: clamp(1.1rem, 3vw, 1.5rem);
    color: var(--neon-yellow);
    text-shadow: 0 0 15px rgba(255, 214, 0, 0.2);
    line-height: 1.4;
    border-left: 3px solid var(--neon-yellow);
    padding-left: 16px;
    margin: 0;
  }

  .scene-description {
    color: var(--text-1);
    font-size: 0.85rem;
    margin-top: 8px;
    padding-left: 19px;
  }

  .scene-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding-left: 19px;
  }

  .episode-tag {
    font-size: 0.75rem;
    color: var(--text-2);
    font-family: "Inter", sans-serif;
  }

  .fav-btn {
    background: none;
    border: none;
    font-size: 1.4rem;
    cursor: pointer;
    color: var(--text-2);
    transition: all 0.2s;
    padding: 4px;
  }

  .fav-btn:hover,
  .fav-active {
    color: var(--neon-red);
    text-shadow: 0 0 10px rgba(255, 23, 68, 0.5);
  }

  /* Neon button */
  .neon-btn {
    display: block;
    width: 100%;
    max-width: 320px;
    margin: 20px auto 0;
    padding: 14px 28px;
    font-family: "Special Elite", cursive;
    font-size: 1.3rem;
    color: #fff;
    background: linear-gradient(135deg, #b71c1c, #d32f2f);
    border: 2px solid var(--neon-red);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow:
      0 0 15px rgba(255, 23, 68, 0.3),
      0 0 30px rgba(255, 23, 68, 0.1);
    animation: pulse-glow 2s ease-in-out infinite;
  }

  .neon-btn:hover {
    transform: scale(1.03);
    box-shadow:
      0 0 20px rgba(255, 23, 68, 0.5),
      0 0 50px rgba(255, 23, 68, 0.2);
  }

  .neon-btn:active {
    transform: scale(0.98);
  }

  @keyframes pulse-glow {
    0%, 100% {
      box-shadow:
        0 0 15px rgba(255, 23, 68, 0.3),
        0 0 30px rgba(255, 23, 68, 0.1);
    }
    50% {
      box-shadow:
        0 0 25px rgba(255, 23, 68, 0.5),
        0 0 50px rgba(255, 23, 68, 0.2);
    }
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-2);
    color: var(--text-0);
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 0.85rem;
    font-family: "Inter", sans-serif;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    animation: toast-in 0.3s ease;
    z-index: 1000;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* Favorites panel */
  .favorites-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 500;
    animation: fade-in 0.2s ease;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .favorites-panel {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(380px, 90vw);
    background: var(--bg-1);
    border-left: 1px solid var(--border);
    padding: 20px;
    overflow-y: auto;
    animation: slide-in 0.25s ease;
  }

  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .favorites-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .favorites-header h2 {
    font-family: "Special Elite", cursive;
    color: var(--neon-red);
    font-size: 1.2rem;
  }

  .favorites-close {
    background: none;
    border: none;
    color: var(--text-1);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px;
  }

  .favorites-close:hover {
    color: var(--text-0);
  }

  .favorites-empty {
    color: var(--text-2);
    font-size: 0.85rem;
    text-align: center;
    margin-top: 40px;
    font-style: italic;
  }

  .favorites-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Scene card (favorites) */
  .scene-card {
    position: relative;
    padding: 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .scene-card:hover {
    border-color: var(--neon-yellow);
    background: rgba(255, 214, 0, 0.03);
  }

  .card-quote {
    font-family: "Special Elite", cursive;
    font-size: 0.9rem;
    color: var(--text-0);
    line-height: 1.3;
  }

  .card-meta {
    font-size: 0.7rem;
    color: var(--text-2);
    margin-top: 6px;
  }

  .card-remove {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 2px 4px;
  }

  .card-remove:hover {
    color: var(--neon-red);
  }
`;

export function App() {
  const { current, getNext } = useRandomScene(SCENES);
  const { favoriteIds, isFavorite, toggleFavorite } = useFavorites();
  const [activeCategory, setActiveCategory] = useState("all");
  const [showFavorites, setShowFavorites] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Load first scene on mount
  useEffect(() => {
    getNext("all");
  }, []);

  const sceneCounts = useMemo(() => {
    const counts = { all: SCENES.length };
    for (const key of Object.keys(CATEGORIES)) {
      if (key !== "all") {
        counts[key] = SCENES.filter((s) => s.categories.includes(key)).length;
      }
    }
    return counts;
  }, []);

  const handleBlast = useCallback(() => {
    getNext(activeCategory);
  }, [getNext, activeCategory]);

  const handleCategorySelect = useCallback(
    (category) => {
      setActiveCategory(category);
      getNext(category);
    },
    [getNext],
  );

  const handleToggleFavorite = useCallback(
    (id) => {
      const wasAdded = !isFavorite(id);
      toggleFavorite(id);
      setToastMessage(wasAdded ? "♥ Added to favorites" : "Removed from favorites");
    },
    [isFavorite, toggleFavorite],
  );

  const handleFavoriteSelect = useCallback((scene) => {
    setShowFavorites(false);
    getNext("all");
  }, [getNext]);

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <header className="header">
          <h1 className="title">So I Started Blasting</h1>
          <p className="subtitle">Random Frank Reynolds Scenes</p>
          <div className="header-actions">
            <button
              className="fav-toggle"
              onClick={() => setShowFavorites(true)}
            >
              ♥ Favorites ({favoriteIds.length})
            </button>
          </div>
        </header>

        <CategoryBar
          active={activeCategory}
          onSelect={handleCategorySelect}
          sceneCounts={sceneCounts}
        />

        <ScenePlayer
          scene={current}
          isFavorite={current ? isFavorite(current.id) : false}
          onToggleFavorite={handleToggleFavorite}
        />

        <NeonButton onClick={handleBlast} label="Blast Me Again" />

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
}
