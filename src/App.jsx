import { useState, useEffect, useCallback, useRef } from "react";
import { SCENES } from "./data/scenes.js";
import { useRandomScene } from "./hooks/useRandomScene.js";
import { useFavorites } from "./hooks/useFavorites.js";
import { useWatchHistory } from "./hooks/useWatchHistory.js";
import { ScenePlayer } from "./components/ScenePlayer.jsx";
import { FilterDropdown } from "./components/FilterDropdown.jsx";
import { Toast } from "./components/Toast.jsx";
import { FavoritesList } from "./components/FavoritesList.jsx";
import { HistoryList } from "./components/HistoryList.jsx";

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
    --tv-bezel: #2a2520;
    --tv-body: #1a1814;
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
    max-width: 100%;
    margin: 0 auto;
    padding: 20px 24px 60px;
  }

  /* Header — compact inline bar */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .header-left {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

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

  .subtitle {
    font-family: "Special Elite", cursive;
    font-size: 0.75rem;
    color: var(--text-2);
    display: none;
  }

  @media (min-width: 600px) {
    .subtitle { display: inline; }
  }

  .fav-toggle {
    background: none;
    border: 1px solid var(--border);
    color: var(--neon-red);
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    font-family: "Inter", sans-serif;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .fav-toggle:hover {
    border-color: var(--neon-red);
    background: rgba(255, 23, 68, 0.08);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Filter dropdown */
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

  /* ═══ CRT Television ═══ */
  .crt-tv {
    position: relative;
    width: 90vw;
    max-width: 90vw;
    margin: 0 auto;
  }

  /* TV outer body */
  .tv-body {
    background: linear-gradient(
      180deg,
      #3a3430 0%,
      #2a2520 8%,
      #1a1814 50%,
      #12100e 100%
    );
    border-radius: 24px;
    padding: 28px 28px 20px;
    box-shadow:
      0 8px 40px rgba(0, 0, 0, 0.6),
      0 2px 0 rgba(255, 255, 255, 0.03) inset,
      0 -2px 8px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  /* Screen bezel — thick dark frame */
  .tv-bezel {
    background: #0c0a08;
    border-radius: 12px;
    padding: 6px;
    box-shadow:
      inset 0 2px 8px rgba(0, 0, 0, 0.8),
      inset 0 0 2px rgba(0, 0, 0, 0.9);
  }

  /* The screen itself */
  .tv-screen {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    border-radius: 8px;
    overflow: hidden;
    background: #000;
  }

  /* CRT scanline overlay */
  .tv-screen::after {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.15) 2px,
      rgba(0, 0, 0, 0.15) 4px
    );
    pointer-events: none;
    z-index: 2;
    border-radius: 8px;
  }

  /* Screen reflection/glare */
  .tv-screen::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 40%;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.03) 0%,
      transparent 100%
    );
    pointer-events: none;
    z-index: 3;
    border-radius: 8px 8px 0 0;
  }

  .tv-screen iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
    z-index: 1;
  }

  /* YT IFrame API player container */
  .yt-player-container {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .yt-player-container iframe {
    width: 100% !important;
    height: 100% !important;
    border: none !important;
  }

  /* TV controls bar under screen */
  .tv-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 8px 4px;
  }

  .tv-brand {
    font-family: "Inter", sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #4a4540;
  }

  .tv-knobs {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .tv-knob {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #4a4540, #1a1814);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.5),
      inset 0 1px 1px rgba(255, 255, 255, 0.05);
  }

  .tv-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--neon-red);
    box-shadow: 0 0 6px var(--neon-red);
    animation: led-blink 3s ease-in-out infinite;
  }

  @keyframes led-blink {
    0%, 90%, 100% { opacity: 1; }
    95% { opacity: 0.3; }
  }

  /* ═══ Channel Change Transition ═══ */
  .tv-transition {
    position: absolute;
    inset: 0;
    z-index: 10;
    animation: channel-change 0.9s steps(1) forwards;
  }

  /* VHS static / snow */
  .tv-static {
    position: absolute;
    inset: 0;
    background:
      repeating-radial-gradient(circle at 17% 32%, white 0px, transparent 1px),
      repeating-radial-gradient(circle at 62% 88%, white 0px, transparent 1px),
      repeating-radial-gradient(circle at 89% 13%, white 0px, transparent 1px);
    background-size: 3px 3px, 4px 4px, 2px 2px;
    opacity: 0;
    animation: static-flicker 0.9s steps(4) forwards;
    mix-blend-mode: screen;
  }

  @keyframes static-flicker {
    0%   { opacity: 1; background-position: 0 0, 50px 50px, 20px 30px; }
    15%  { opacity: 0.9; background-position: 10px 5px, 30px 20px, 40px 10px; }
    30%  { opacity: 0.7; background-position: 5px 15px, 45px 35px, 15px 45px; }
    50%  { opacity: 0.5; background-position: 20px 10px, 10px 40px, 35px 20px; }
    70%  { opacity: 0.3; background-position: 8px 8px, 25px 15px, 50px 5px; }
    85%  { opacity: 0.15; }
    100% { opacity: 0; }
  }

  /* SMPTE color bars — the classic TV test pattern */
  .tv-color-bars {
    position: absolute;
    inset: 0;
    display: flex;
    opacity: 0;
    animation: bars-flash 0.9s steps(1) forwards;
  }

  .tv-color-bars > div {
    flex: 1;
    height: 100%;
  }

  @keyframes bars-flash {
    0%   { opacity: 0; }
    8%   { opacity: 1; }
    25%  { opacity: 1; }
    30%  { opacity: 0; }
    100% { opacity: 0; }
  }

  /* Vertical hold roll — the screen "flipping" */
  .tv-vhold {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      0deg,
      transparent 0%,
      transparent 35%,
      rgba(255, 255, 255, 0.06) 40%,
      #000 42%,
      #000 58%,
      rgba(255, 255, 255, 0.06) 60%,
      transparent 65%,
      transparent 100%
    );
    animation: vhold-roll 0.9s ease-in-out forwards;
    opacity: 0;
  }

  @keyframes vhold-roll {
    0%   { opacity: 0; transform: translateY(100%); }
    30%  { opacity: 1; transform: translateY(100%); }
    55%  { opacity: 1; transform: translateY(-100%); }
    70%  { opacity: 1; transform: translateY(-200%); }
    75%  { opacity: 0; }
    100% { opacity: 0; }
  }

  /* Channel number display */
  .tv-channel-num {
    position: absolute;
    top: 16px;
    right: 20px;
    font-family: "Special Elite", monospace;
    font-size: 1.8rem;
    color: #0f0;
    text-shadow: 0 0 8px rgba(0, 255, 0, 0.6);
    opacity: 0;
    animation: channel-num-show 0.9s steps(1) forwards;
    z-index: 5;
  }

  @keyframes channel-num-show {
    0%   { opacity: 0; }
    5%   { opacity: 1; }
    50%  { opacity: 1; }
    55%  { opacity: 0; }
    100% { opacity: 0; }
  }

  /* Master sequence: briefly flash white, then static + bars, then clear */
  @keyframes channel-change {
    0%   { background: white; }
    3%   { background: black; }
    90%  { background: transparent; }
    100% { background: transparent; opacity: 0; }
  }

  /* TV legs/stand */
  .tv-stand {
    display: flex;
    justify-content: center;
    gap: 120px;
    margin-top: -2px;
  }

  .tv-leg {
    width: 40px;
    height: 12px;
    background: linear-gradient(180deg, #2a2520, #1a1814);
    border-radius: 0 0 6px 6px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  /* Scene player wrapper */
  .scene-player {
    margin-top: 0;
  }

  /* ─── Now-playing info bar (inside TV body) ─── */
  .tv-info-bar {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 12px 12px;
    margin-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    background: rgba(0, 0, 0, 0.25);
    border-radius: 4px;
  }

  .tv-info-actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    align-self: center;
  }

  .tv-info-text {
    flex: 1;
    min-width: 0;
  }

  .scene-quote {
    font-family: "Special Elite", cursive;
    font-size: clamp(0.95rem, 2vw, 1.2rem);
    color: var(--neon-green);
    text-shadow: 0 0 12px rgba(57, 255, 20, 0.2);
    line-height: 1.35;
    border-left: 2px solid var(--neon-green);
    padding-left: 12px;
    margin: 0;
  }

  .scene-description {
    color: var(--text-1);
    font-size: 0.8rem;
    margin-top: 4px;
    padding-left: 14px;
  }

  .tv-info-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding-left: 14px;
    margin-top: 6px;
  }

  .scene-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .tag-pill {
    font-size: 0.65rem;
    padding: 1px 7px;
    border-radius: 4px;
    border: 1px solid;
    background: rgba(255, 255, 255, 0.03);
    font-family: "Inter", sans-serif;
  }

  .source-tag {
    font-size: 0.7rem;
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
    padding: 2px 4px;
  }

  .fav-btn:hover,
  .fav-active {
    color: var(--neon-red);
    text-shadow: 0 0 10px rgba(255, 23, 68, 0.5);
  }

  /* Blast button — built into TV controls */
  .tv-blast-btn {
    font-family: "Special Elite", cursive;
    font-size: 0.95rem;
    color: #fff;
    background: linear-gradient(135deg, #b71c1c, #d32f2f);
    border: 1px solid var(--neon-red);
    border-radius: 6px;
    cursor: pointer;
    padding: 6px 20px;
    transition: all 0.2s;
    box-shadow:
      0 0 10px rgba(255, 23, 68, 0.3),
      0 0 20px rgba(255, 23, 68, 0.1);
    animation: pulse-glow 2s ease-in-out infinite;
    letter-spacing: 0.05em;
  }

  .tv-blast-btn:hover {
    transform: scale(1.05);
    box-shadow:
      0 0 15px rgba(255, 23, 68, 0.5),
      0 0 30px rgba(255, 23, 68, 0.2);
  }

  .tv-blast-btn:active {
    transform: scale(0.95);
  }

  @keyframes pulse-glow {
    0%, 100% {
      box-shadow:
        0 0 10px rgba(255, 23, 68, 0.3),
        0 0 20px rgba(255, 23, 68, 0.1);
    }
    50% {
      box-shadow:
        0 0 18px rgba(255, 23, 68, 0.5),
        0 0 35px rgba(255, 23, 68, 0.2);
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

  /* History panel extras */
  .history-clear-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-2);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: "Inter", sans-serif;
    cursor: pointer;
    margin-bottom: 12px;
    transition: all 0.2s;
  }

  .history-clear-btn:hover {
    border-color: var(--neon-red);
    color: var(--neon-red);
  }

  .history-time {
    color: var(--text-2);
    font-style: italic;
  }

  .history-toggle {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-1);
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    font-family: "Inter", sans-serif;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .history-toggle:hover {
    border-color: var(--neon-yellow);
    background: rgba(255, 214, 0, 0.08);
    color: var(--neon-yellow);
  }

  /* Responsive */
  @media (max-width: 600px) {
    .tv-body {
      border-radius: 16px;
      padding: 16px 16px 12px;
    }
    .tv-stand { gap: 60px; }
    .tv-leg { width: 28px; }
    .tv-info-bar { flex-direction: column; gap: 6px; }
    .fav-btn { align-self: flex-start; }
  }
`;

export function App() {
  const { current, getNext, setCurrent } = useRandomScene(SCENES);
  const { favoriteIds, isFavorite, toggleFavorite } = useFavorites();
  const { history, addToHistory, clearHistory } = useWatchHistory();
  const [activeCategory, setActiveCategory] = useState("all");
  const [showFavorites, setShowFavorites] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const initRef = useRef(false);

  // Load first scene on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const first = getNext("all");
    if (first) addToHistory(first.id);
  }, [getNext, addToHistory]);

  const handleBlast = useCallback(() => {
    setHasInteracted(true);
    const next = getNext(activeCategory);
    if (next) addToHistory(next.id);
  }, [getNext, activeCategory, addToHistory]);

  const handleCategorySelect = useCallback(
    (category) => {
      setHasInteracted(true);
      setActiveCategory(category);
      const next = getNext(category);
      if (next) addToHistory(next.id);
    },
    [getNext, addToHistory],
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
    setHasInteracted(true);
    setShowFavorites(false);
    setCurrent(scene);
    addToHistory(scene.id);
  }, [setCurrent, addToHistory]);

  const handleHistorySelect = useCallback((scene) => {
    setHasInteracted(true);
    setShowHistory(false);
    setCurrent(scene);
    addToHistory(scene.id);
  }, [setCurrent, addToHistory]);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setToastMessage("History cleared");
  }, [clearHistory]);

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
              className="history-toggle"
              onClick={() => setShowHistory(true)}
            >
              📼 History
            </button>
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
          hasInteracted={hasInteracted}
          onBlast={handleBlast}
        />

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

        {showHistory && (
          <HistoryList
            history={history}
            scenes={SCENES}
            onSelect={handleHistorySelect}
            onClear={handleClearHistory}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </>
  );
}
