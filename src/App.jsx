import { useState, useCallback } from "react";
import { SCENES } from "./data/scenes.js";
import { useBlastEngine } from "./hooks/useBlastEngine.js";
import { useFavorites } from "./hooks/useFavorites.js";
import { useWatchHistory } from "./hooks/useWatchHistory.js";
import { useApiKey } from "./hooks/useApiKey.js";
import { useAiDiscovery, getAllScenesForLookup } from "./hooks/useAiDiscovery.js";
import { ScenePlayer } from "./components/ScenePlayer.jsx";
import { FilterBar } from "./components/FilterBar.jsx";
import { Toast } from "./components/Toast.jsx";
import { FavoritesList } from "./components/FavoritesList.jsx";
import { HistoryList } from "./components/HistoryList.jsx";
import { ServicePanel } from "./components/ServicePanel.jsx";
import { ChannelDial } from "./components/ChannelDial.jsx";
import { VHSSlot } from "./components/VHSSlot.jsx";
import { TapeShelf } from "./components/TapeShelf.jsx";

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

  /* Filter bar */
  .filter-bar {
    width: 100%;
    margin-top: 12px;
  }

  .filter-bar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding: 0 2px;
  }

  .filter-pool-count {
    font-size: 0.75rem;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .filter-clear {
    background: none;
    border: none;
    color: var(--text-2);
    font-size: 0.7rem;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: "Inter", sans-serif;
    transition: all 0.15s;
  }

  .filter-clear:hover {
    color: var(--neon-red);
    background: rgba(255, 23, 68, 0.1);
  }

  .filter-bar-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--bg-2) transparent;
    -webkit-overflow-scrolling: touch;
  }

  .filter-bar-scroll::-webkit-scrollbar {
    height: 4px;
  }

  .filter-bar-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .filter-bar-scroll::-webkit-scrollbar-thumb {
    background: var(--bg-2);
    border-radius: 2px;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .filter-group-label {
    font-size: 0.65rem;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .filter-pills {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    max-width: 280px;
  }

  .filter-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--pill-color, var(--border));
    background: var(--pill-bg, transparent);
    color: var(--pill-color, var(--text-1));
    font-size: 0.68rem;
    font-family: "Inter", sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    opacity: 0.6;
  }

  .filter-pill:hover {
    opacity: 1;
    background: var(--pill-bg);
  }

  .filter-pill.active {
    opacity: 1;
    background: var(--pill-color);
    color: #000;
    font-weight: 600;
    box-shadow: 0 0 10px var(--pill-glow, transparent);
    border-color: var(--pill-color);
  }

  .pill-count {
    font-size: 0.6rem;
    opacity: 0.7;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .filter-pill.active .pill-count {
    opacity: 0.8;
  }

  .filter-pill.empty {
    opacity: 0.25;
    pointer-events: none;
  }

  @media (max-width: 599px) {
    .filter-pills {
      max-width: 200px;
    }
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

  /* Blast button — the big CTA */
  .tv-blast-btn {
    font-family: "Special Elite", cursive;
    font-size: 1.15rem;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #c62828, #e53935, #c62828);
    background-size: 200% 200%;
    border: 2px solid var(--neon-red);
    border-radius: 8px;
    cursor: pointer;
    padding: 10px 28px;
    transition: all 0.2s ease;
    box-shadow:
      0 0 12px rgba(255, 23, 68, 0.4),
      0 0 24px rgba(255, 23, 68, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
    animation: blast-pulse 2s ease-in-out infinite, blast-shimmer 3s ease-in-out infinite;
    letter-spacing: 0.08em;
    text-shadow: 0 0 8px rgba(255, 23, 68, 0.6);
    position: relative;
    overflow: hidden;
  }

  /* Shine sweep across button */
  .tv-blast-btn::after {
    content: "";
    position: absolute;
    top: -50%;
    left: -75%;
    width: 50%;
    height: 200%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.15),
      transparent
    );
    transform: skewX(-20deg);
    animation: blast-shine 4s ease-in-out infinite;
    pointer-events: none;
  }

  .tv-blast-btn:hover {
    transform: scale(1.08);
    background: linear-gradient(135deg, #d32f2f, #ff1744, #d32f2f);
    border-color: #ff5252;
    box-shadow:
      0 0 20px rgba(255, 23, 68, 0.6),
      0 0 40px rgba(255, 23, 68, 0.3),
      0 0 60px rgba(255, 23, 68, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    text-shadow: 0 0 12px rgba(255, 255, 255, 0.4);
  }

  .tv-blast-btn:active {
    transform: scale(0.96);
    box-shadow:
      0 0 8px rgba(255, 23, 68, 0.5),
      inset 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  @keyframes blast-pulse {
    0%, 100% {
      box-shadow:
        0 0 12px rgba(255, 23, 68, 0.4),
        0 0 24px rgba(255, 23, 68, 0.15),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }
    50% {
      box-shadow:
        0 0 20px rgba(255, 23, 68, 0.55),
        0 0 40px rgba(255, 23, 68, 0.25),
        0 0 60px rgba(255, 23, 68, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }
  }

  @keyframes blast-shimmer {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @keyframes blast-shine {
    0%, 100% { left: -75%; }
    50% { left: 125%; }
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

  /* Splash screen */
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    gap: 32px;
    text-align: center;
    padding: 24px;
  }

  .splash-title {
    font-family: monospace;
    font-size: clamp(2rem, 6vw, 4rem);
    color: var(--neon-green);
    text-shadow:
      0 0 10px rgba(57, 255, 20, 0.5),
      0 0 40px rgba(57, 255, 20, 0.2);
    letter-spacing: 6px;
    text-transform: uppercase;
    line-height: 1.1;
  }

  .splash-subtitle {
    font-family: "Special Elite", cursive;
    color: var(--text-2);
    font-size: clamp(0.9rem, 2vw, 1.1rem);
  }

  .splash-enter {
    background: none;
    border: 2px solid var(--neon-green);
    color: var(--neon-green);
    padding: 16px 48px;
    border-radius: 8px;
    cursor: pointer;
    font-family: monospace;
    font-size: clamp(1rem, 2.5vw, 1.3rem);
    letter-spacing: 3px;
    text-transform: uppercase;
    transition: all 0.2s;
    animation: pulse-glow 2s ease-in-out infinite;
  }

  .splash-enter:hover {
    background: rgba(57, 255, 20, 0.1);
    box-shadow: 0 0 20px rgba(57, 255, 20, 0.3);
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 8px rgba(57, 255, 20, 0.2); }
    50% { box-shadow: 0 0 20px rgba(57, 255, 20, 0.4); }
  }

  /* ═══ 3D TV Flip Container ═══ */
  .tv-flip-container {
    perspective: 1200px;
  }

  .tv-flip-inner {
    position: relative;
    transform-style: preserve-3d;
    transition: transform 0.6s ease;
  }

  .tv-flip-inner.flipped {
    transform: rotateY(180deg);
  }

  .tv-front {
    backface-visibility: hidden;
    position: relative;
  }

  .tv-back {
    backface-visibility: hidden;
    transform: rotateY(180deg);
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(
        45deg,
        rgba(255,255,255,0.008) 0px,
        rgba(255,255,255,0.008) 1px,
        transparent 1px,
        transparent 6px
      ),
      linear-gradient(180deg, #1e1c18 0%, #1a1814 40%, #141210 100%);
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.04);
    box-shadow:
      0 8px 40px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 255, 255, 0.02);
    overflow: hidden;
  }

  /* ═══ Service Panel ═══ */
  .service-panel {
    padding: 28px 32px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    min-height: 200px;
    position: relative;
  }

  /* Corner screw heads */
  .service-screws {
    position: absolute;
    inset: 12px;
    pointer-events: none;
  }

  .service-screw {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #4a4540, #1a1814);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .service-screw:nth-child(1) { top: 0; left: 0; }
  .service-screw:nth-child(2) { top: 0; right: 0; }
  .service-screw:nth-child(3) { bottom: 0; left: 0; }
  .service-screw:nth-child(4) { bottom: 0; right: 0; }

  /* Product sticker */
  .service-sticker {
    font-family: monospace;
    font-size: 0.7rem;
    background: #ddd8c0;
    color: #1a1814;
    padding: 8px 14px;
    border-radius: 3px;
    border: 1px solid #b8b090;
    transform: rotate(-2deg);
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.6);
    line-height: 1.7;
    letter-spacing: 0.05em;
    text-align: center;
  }

  .sticker-model {
    font-weight: 700;
    letter-spacing: 0.12em;
    font-size: 0.75rem;
  }

  .sticker-serial {
    color: #444;
    font-size: 0.65rem;
  }

  .sticker-warning {
    font-size: 0.6rem;
    color: #8b0000;
    letter-spacing: 0.08em;
  }

  /* Port section */
  .service-port-section {
    width: 100%;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .service-port-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .service-port-header {
    font-family: monospace;
    font-size: 0.7rem;
    color: var(--text-1);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* The port/socket input wrapper */
  .service-port {
    background: #0a0a08;
    border: 2px solid #5a4e30;
    border-radius: 4px;
    padding: 10px 14px;
    box-shadow:
      inset 0 2px 8px rgba(0, 0, 0, 0.8),
      inset 0 0 4px rgba(0, 0, 0, 0.5),
      0 1px 0 rgba(255, 200, 50, 0.08);
    display: flex;
    align-items: center;
  }

  .service-port-input {
    font-family: monospace;
    font-size: 0.85rem;
    background: transparent;
    color: var(--neon-green);
    border: none;
    outline: none;
    width: 100%;
    caret-color: var(--neon-green);
    letter-spacing: 0.05em;
  }

  .service-port-input::placeholder {
    color: var(--text-2);
    letter-spacing: 0.05em;
  }

  .service-port-connected-key {
    font-family: monospace;
    font-size: 0.85rem;
    color: var(--neon-green);
    letter-spacing: 0.05em;
  }

  /* Status label */
  .service-label {
    font-family: monospace;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    color: var(--text-2);
    text-transform: uppercase;
    min-height: 1em;
    text-align: center;
  }

  /* Status LEDs */
  .service-led {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .led-red {
    background: var(--neon-red);
    box-shadow: 0 0 6px var(--neon-red);
  }

  .led-yellow {
    background: var(--neon-yellow);
    box-shadow: 0 0 6px var(--neon-yellow);
    animation: led-pulse 1s ease-in-out infinite;
  }

  .led-green {
    background: var(--neon-green);
    box-shadow: 0 0 8px var(--neon-green), 0 0 14px rgba(57, 255, 20, 0.3);
  }

  @keyframes led-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Disconnect button */
  .service-disconnect-btn {
    background: none;
    border: 1px solid rgba(255, 23, 68, 0.3);
    color: var(--neon-red);
    font-family: monospace;
    font-size: 0.7rem;
    padding: 4px 12px;
    border-radius: 3px;
    cursor: pointer;
    letter-spacing: 0.08em;
    align-self: center;
    transition: all 0.2s;
  }

  .service-disconnect-btn:hover {
    background: rgba(255, 23, 68, 0.1);
    border-color: var(--neon-red);
  }

  /* Flip back button */
  .service-back-btn {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--text-2);
    font-family: monospace;
    font-size: 0.65rem;
    padding: 5px 14px;
    border-radius: 3px;
    cursor: pointer;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: all 0.2s;
    margin-top: 4px;
  }

  .service-back-btn:hover {
    border-color: var(--text-1);
    color: var(--text-0);
  }

  /* Wrench trigger button on TV front */
  .tv-flip-trigger {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-2);
    font-size: 0.85rem;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    opacity: 0.4;
    z-index: 2;
  }

  .tv-flip-trigger:hover {
    border-color: var(--text-2);
    opacity: 1;
    background: rgba(255, 255, 255, 0.04);
  }

  /* ═══ Channel Dial ═══ */
  .channel-dial {
    position: absolute;
    right: -72px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    z-index: 10;
  }

  .dial-unpowered {
    opacity: 0.3;
    pointer-events: none;
    cursor: default;
  }

  /* Outer ring with tick marks */
  .dial-outer {
    position: relative;
    width: 88px;
    height: 88px;
  }

  /* Tick marks positioned around the outer ring */
  .dial-ticks {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .dial-tick {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 8px;
    background: #4a4540;
    transform-origin: 50% 44px;
    transform: translateX(-50%) rotate(var(--tick-angle));
    border-radius: 1px;
  }

  .dial-tick-label {
    position: absolute;
    top: -14px;
    left: 50%;
    transform: translateX(-50%) rotate(calc(-1 * var(--tick-angle)));
    font-size: 0.45rem;
    font-family: monospace;
    color: #4a4540;
    white-space: nowrap;
    letter-spacing: 0;
  }

  .dial-tick-pirate {
    background: var(--neon-red);
    height: 10px;
    width: 2px;
  }

  .dial-tick-pirate .dial-tick-label {
    color: var(--neon-red);
    font-size: 0.7rem;
    text-shadow: 0 0 6px rgba(255, 23, 68, 0.8);
  }

  /* The physical knob */
  .dial-knob {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(0deg);
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 32%, #5a5550 0%, #4a4540 25%, #2a2520 70%, #1a1814 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.7),
      0 1px 0 rgba(255, 255, 255, 0.06) inset,
      0 -1px 0 rgba(0, 0, 0, 0.5) inset,
      0 0 0 3px #0f0d0b,
      0 0 0 4px rgba(255, 255, 255, 0.04);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
    cursor: pointer;
  }

  .dial-knob.active {
    /* Rotated to the pirate zone (last tick at ~+150°) */
    transform: translate(-50%, -50%) rotate(150deg);
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.7),
      0 1px 0 rgba(255, 255, 255, 0.06) inset,
      0 -1px 0 rgba(0, 0, 0, 0.5) inset,
      0 0 0 3px #0f0d0b,
      0 0 0 4px rgba(255, 23, 68, 0.2),
      0 0 16px rgba(255, 23, 68, 0.4),
      0 0 32px rgba(255, 23, 68, 0.15);
    animation: dial-knob-pulse 1.5s ease-in-out infinite;
  }

  @keyframes dial-knob-pulse {
    0%, 100% {
      box-shadow:
        0 3px 10px rgba(0, 0, 0, 0.7),
        0 1px 0 rgba(255, 255, 255, 0.06) inset,
        0 -1px 0 rgba(0, 0, 0, 0.5) inset,
        0 0 0 3px #0f0d0b,
        0 0 0 4px rgba(255, 23, 68, 0.2),
        0 0 16px rgba(255, 23, 68, 0.4),
        0 0 32px rgba(255, 23, 68, 0.15);
    }
    50% {
      box-shadow:
        0 3px 10px rgba(0, 0, 0, 0.7),
        0 1px 0 rgba(255, 255, 255, 0.06) inset,
        0 -1px 0 rgba(0, 0, 0, 0.5) inset,
        0 0 0 3px #0f0d0b,
        0 0 0 4px rgba(255, 23, 68, 0.4),
        0 0 24px rgba(255, 23, 68, 0.6),
        0 0 48px rgba(255, 23, 68, 0.25);
    }
  }

  /* Indicator line on the knob face */
  .dial-indicator {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: 10px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.15));
    border-radius: 1px;
    box-shadow: 0 0 3px rgba(255, 255, 255, 0.2);
  }

  /* Pirate zone indicator — sits below/outside the knob */
  .dial-pirate-zone {
    position: absolute;
    bottom: -28px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 23, 68, 0.25);
    background: rgba(255, 23, 68, 0.05);
    transition: all 0.2s;
    white-space: nowrap;
  }

  .dial-pirate-zone:hover {
    border-color: rgba(255, 23, 68, 0.6);
    background: rgba(255, 23, 68, 0.12);
    box-shadow: 0 0 10px rgba(255, 23, 68, 0.25);
  }

  .dial-pirate-zone.active {
    border-color: var(--neon-red);
    background: rgba(255, 23, 68, 0.1);
    box-shadow:
      0 0 8px rgba(255, 23, 68, 0.4),
      0 0 16px rgba(255, 23, 68, 0.15);
    animation: pirate-zone-pulse 1.5s ease-in-out infinite;
  }

  .dial-pirate-zone.loading {
    animation: pirate-scan 0.8s steps(3) infinite;
  }

  @keyframes pirate-zone-pulse {
    0%, 100% {
      box-shadow: 0 0 8px rgba(255, 23, 68, 0.4), 0 0 16px rgba(255, 23, 68, 0.15);
      border-color: var(--neon-red);
    }
    50% {
      box-shadow: 0 0 16px rgba(255, 23, 68, 0.7), 0 0 32px rgba(255, 23, 68, 0.3);
      border-color: #ff5252;
    }
  }

  @keyframes pirate-scan {
    0%   { opacity: 1; background: rgba(255, 23, 68, 0.08); }
    33%  { opacity: 0.6; background: rgba(255, 23, 68, 0.18); }
    66%  { opacity: 1; background: rgba(255, 23, 68, 0.04); }
    100% { opacity: 0.8; background: rgba(255, 23, 68, 0.12); }
  }

  .pirate-icon {
    font-size: 0.9rem;
    line-height: 1;
  }

  .pirate-label {
    font-family: monospace;
    font-size: 0.5rem;
    letter-spacing: 0.15em;
    color: var(--neon-red);
    text-transform: uppercase;
    text-shadow: 0 0 6px rgba(255, 23, 68, 0.6);
  }

  /* "TUNER" label below the dial */
  .dial-label {
    font-family: monospace;
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    color: #4a4540;
    text-transform: uppercase;
    margin-top: 32px;
  }

  /* On small screens, hide the dial (TV body not wide enough to extend) */
  @media (max-width: 700px) {
    .channel-dial {
      display: none;
    }
  }

  /* ═══ VHS Slot ═══ */
  .vhs-slot {
    position: relative;
    margin: 10px auto 0;
    width: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }

  .vhs-unpowered {
    opacity: 0.3;
    pointer-events: none;
    cursor: default;
  }

  /* The horizontal slit opening */
  .vhs-slot-slit {
    width: 100%;
    height: 6px;
    background: #0a0a08;
    border-radius: 2px;
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.9),
      inset 0 -1px 2px rgba(0, 0, 0, 0.6),
      0 1px 0 rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(0, 0, 0, 0.8);
    border-bottom-color: rgba(255, 255, 255, 0.04);
    position: relative;
    z-index: 2;
  }

  .vhs-slot-slit-inner {
    position: absolute;
    inset: 1px 8px;
    background: #050504;
    border-radius: 1px;
  }

  /* The tape that peeks out below the slot */
  .vhs-tape {
    width: 190px;
    height: 32px;
    background: linear-gradient(180deg, #2a2520 0%, #1e1c18 60%, #141210 100%);
    border-radius: 0 0 4px 4px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-top: none;
    box-shadow:
      0 4px 10px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    cursor: pointer;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateY(0);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
    /* Show 10px of tape peeking, rest is behind the slot */
    margin-top: -22px;
    padding-top: 22px;
    overflow: hidden;
  }

  .vhs-tape:hover:not(:disabled) {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.6),
      0 0 10px rgba(255, 214, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 214, 0, 0.15);
  }

  .vhs-tape.vhs-active {
    transform: translateY(-18px);
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.4),
      0 0 12px rgba(255, 214, 0, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 214, 0, 0.2);
  }

  .vhs-tape.vhs-loading {
    animation: tape-pulse 0.6s steps(2) infinite;
  }

  @keyframes tape-pulse {
    0%   { opacity: 1; }
    50%  { opacity: 0.55; }
    100% { opacity: 1; }
  }

  .vhs-tape-label {
    font-family: "Special Elite", cursive;
    font-size: 0.6rem;
    color: #c8c0a8;
    letter-spacing: 0.08em;
    transform: rotate(-1deg);
    text-transform: uppercase;
    position: relative;
    z-index: 1;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  /* Reel windows on the tape */
  .vhs-reel {
    position: absolute;
    bottom: 5px;
    width: 18px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 38%, #3a3530 0%, #1a1814 70%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
  }

  .vhs-reel-left  { left: 28px; }
  .vhs-reel-right { right: 28px; }

  /* ═══ Tape Shelf ═══ */
  .tape-shelf {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .tape-cassette {
    position: relative;
    width: 45px;
    height: 30px;
    background: linear-gradient(180deg, #2a2520 0%, #1a1814 100%);
    border-radius: 3px 3px 4px 4px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
    /* Reset button styles */
    padding: 0;
    font: inherit;
    outline: none;
  }

  .tape-cassette:hover {
    transform: scale(1.08) translateY(-1px);
    border-color: rgba(255, 214, 0, 0.35);
    box-shadow:
      0 4px 10px rgba(0, 0, 0, 0.6),
      0 0 8px rgba(255, 214, 0, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .tape-cassette:focus-visible {
    border-color: var(--neon-yellow);
    box-shadow:
      0 0 0 2px rgba(255, 214, 0, 0.3),
      0 2px 6px rgba(0, 0, 0, 0.5);
  }

  .tape-cassette-label {
    font-family: monospace;
    font-size: 0.38rem;
    color: #7a7060;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    max-width: 30px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    z-index: 1;
    line-height: 1;
  }

  .tape-cassette:hover .tape-cassette-label {
    color: #c8c0a8;
  }

  /* Small reel windows on cassettes */
  .tape-cassette-reel {
    position: absolute;
    bottom: 3px;
    width: 8px;
    height: 7px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 38%, #3a3530 0%, #0f0e0c 80%);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }

  .tape-cassette-reel-left  { left: 4px; }
  .tape-cassette-reel-right { right: 4px; }

  /* ═══ AI Overlay States ═══ */

  /* Shared: full-screen static snow (looping, unlike the one-shot .tv-static) */
  @keyframes ai-snow-loop {
    0%   { background-position: 0 0, 50px 50px, 20px 30px; }
    25%  { background-position: 10px 5px, 30px 20px, 40px 10px; }
    50%  { background-position: 5px 15px, 45px 35px, 15px 45px; }
    75%  { background-position: 20px 10px, 10px 40px, 35px 20px; }
    100% { background-position: 0 0, 50px 50px, 20px 30px; }
  }

  .ai-static-snow {
    position: absolute;
    inset: 0;
    background:
      repeating-radial-gradient(circle at 17% 32%, white 0px, transparent 1px),
      repeating-radial-gradient(circle at 62% 88%, white 0px, transparent 1px),
      repeating-radial-gradient(circle at 89% 13%, white 0px, transparent 1px);
    background-size: 3px 3px, 4px 4px, 2px 2px;
    opacity: 0.55;
    mix-blend-mode: screen;
    animation: ai-snow-loop 0.15s steps(4) infinite;
  }

  /* Dial mode: heavy static overlay */
  .ai-static-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes ai-text-flicker {
    0%, 100% { opacity: 1; }
    30%       { opacity: 0.7; }
    60%       { opacity: 0.85; }
  }

  .ai-static-text {
    position: relative;
    z-index: 11;
    font-family: monospace;
    font-size: 1.2rem;
    letter-spacing: 0.25em;
    color: var(--neon-green);
    text-shadow:
      0 0 8px rgba(57, 255, 20, 0.8),
      0 0 20px rgba(57, 255, 20, 0.4);
    text-transform: uppercase;
    animation: ai-text-flicker 1.2s ease-in-out infinite;
  }

  /* Tape mode: blue-screen VCR overlay */
  .ai-vcr-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: #000020;
    display: flex;
    align-items: flex-end;
    justify-content: flex-start;
  }

  @keyframes ai-tracking-roll {
    0%   { transform: translateY(110%); }
    100% { transform: translateY(-110%); }
  }

  .ai-vcr-tracking {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .ai-vcr-tracking::before,
  .ai-vcr-tracking::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.25);
    animation: ai-tracking-roll 1.8s linear infinite;
  }

  .ai-vcr-tracking::after {
    height: 2px;
    background: rgba(255, 255, 255, 0.15);
    animation-duration: 2.4s;
    animation-delay: -0.9s;
  }

  .ai-vcr-text {
    position: relative;
    z-index: 11;
    font-family: monospace;
    font-size: 0.75rem;
    color: #fff;
    letter-spacing: 0.15em;
    padding: 10px 14px;
    text-transform: uppercase;
  }

  /* Error overlay — reuses .ai-static-snow or .ai-vcr-tracking */
  .ai-error-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes ai-error-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }

  .ai-error-text {
    position: relative;
    z-index: 11;
    font-family: monospace;
    font-size: 1rem;
    letter-spacing: 0.15em;
    color: var(--neon-red);
    text-shadow:
      0 0 8px rgba(255, 23, 68, 0.8),
      0 0 20px rgba(255, 23, 68, 0.4);
    text-transform: uppercase;
    text-align: center;
    padding: 0 16px;
    animation: ai-error-pulse 1s ease-in-out infinite;
  }

  /* Blast button — dimmed AI mode variant */
  .tv-blast-btn-ai {
    background: linear-gradient(135deg, #3a3530, #4a4540, #3a3530) !important;
    background-size: 200% 200% !important;
    border-color: #5a5550 !important;
    color: #a09880 !important;
    text-shadow: none !important;
    box-shadow:
      0 0 4px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
    animation: none !important;
  }

  .tv-blast-btn-ai::after {
    display: none;
  }

  .tv-blast-btn-ai:hover {
    transform: scale(1.03) !important;
    border-color: #7a7060 !important;
    color: var(--text-0) !important;
    box-shadow:
      0 0 8px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.07) !important;
  }
`;

export function App() {
  const { current, nextUp, getNext, setCurrent } = useBlastEngine(SCENES);
  const { favoriteIds, isFavorite, toggleFavorite } = useFavorites();
  const { history, addToHistory, clearHistory } = useWatchHistory();
  const [activeFilters, setActiveFilters] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const { apiKey, keyStatus, hasKey, setApiKey, clearApiKey } = useApiKey();
  const [showServicePanel, setShowServicePanel] = useState(false);

  const {
    aiMode, currentAiScene,
    dialLoading, dialStreamDone,
    tapeData, tapeLoading, tapeStreamDone,
    tapeShelf, aiError,
    spinDial, insertTape, playSavedTape, advanceAi, exitAiMode,
  } = useAiDiscovery(apiKey, history, favoriteIds, activeFilters);

  const handleEnter = useCallback(() => {
    setHasInteracted(true);
    const first = getNext([]);
    if (first) addToHistory(first.id);
  }, [getNext, addToHistory]);

  const handleBlast = useCallback(() => {
    setHasInteracted(true);
    const next = getNext(activeFilters);
    if (next) addToHistory(next.id);
  }, [getNext, activeFilters, addToHistory]);

  const handleFilterToggle = useCallback(
    (key) => {
      setHasInteracted(true);
      const next = activeFilters.includes(key)
        ? activeFilters.filter((k) => k !== key)
        : [...activeFilters, key];
      setActiveFilters(next);
      const scene = getNext(next);
      if (scene) addToHistory(scene.id);
    },
    [getNext, addToHistory, activeFilters],
  );

  const handleFilterClear = useCallback(() => {
    setActiveFilters([]);
    const scene = getNext([]);
    if (scene) addToHistory(scene.id);
  }, [getNext, addToHistory]);

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

  // When a clip ends in AI mode, advance to next clip. If AI mode ended naturally, load a fresh curated scene.
  const handleAiEnd = useCallback(() => {
    const ended = advanceAi();
    if (ended) {
      const next = getNext(activeFilters);
      if (next) addToHistory(next.id);
    }
  }, [advanceAi, getNext, activeFilters, addToHistory]);

  // When user clicks Blast Me button during AI mode to exit manually
  const handleExitAi = useCallback(() => {
    exitAiMode();
    const next = getNext(activeFilters);
    if (next) addToHistory(next.id);
  }, [exitAiMode, getNext, activeFilters, addToHistory]);

  // Dial and tape handlers with key gate — flip to service panel if no key
  const handleDialSpin = useCallback(() => {
    if (!hasKey) {
      setShowServicePanel(true);
      return;
    }
    spinDial();
  }, [hasKey, spinDial]);

  const handleTapeInsert = useCallback(() => {
    if (!hasKey) {
      setShowServicePanel(true);
      return;
    }
    insertTape();
  }, [hasKey, insertTape]);

  if (!hasInteracted) {
    return (
      <>
        <style>{CSS}</style>
        <div className="splash">
          <h1 className="splash-title">Channel Zero</h1>
          <p className="splash-subtitle">We're experiencing technical difficulties.</p>
          <button className="splash-enter" onClick={handleEnter}>
            ⚡ Start Blasting
          </button>
        </div>
      </>
    );
  }

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

        <FilterBar
          active={activeFilters}
          onToggle={handleFilterToggle}
          onClear={handleFilterClear}
        />

        <div className="tv-flip-container">
          <div className={`tv-flip-inner ${showServicePanel ? "flipped" : ""}`}>
            <div className="tv-front">
              <ScenePlayer
                scene={aiMode ? currentAiScene : current}
                nextScene={aiMode ? null : nextUp}
                isFavorite={
                  (aiMode ? currentAiScene : current)
                    ? isFavorite((aiMode ? currentAiScene : current).id)
                    : false
                }
                onToggleFavorite={handleToggleFavorite}
                hasInteracted={hasInteracted}
                onBlast={aiMode ? handleAiEnd : handleBlast}
                aiMode={aiMode}
                aiLoading={aiMode === "dial" ? dialLoading : tapeLoading}
                aiError={aiError}
                onExitAi={handleExitAi}
              />
              <ChannelDial
                powered={hasKey}
                active={aiMode === "dial"}
                loading={dialLoading}
                onSpin={handleDialSpin}
              />
              <VHSSlot
                powered={hasKey}
                active={aiMode === "tape"}
                loading={tapeLoading}
                tapeName={tapeData?.name}
                onInsert={handleTapeInsert}
              />
              <TapeShelf
                tapes={tapeShelf}
                onPlay={playSavedTape}
              />
              <button
                className="tv-flip-trigger"
                onClick={() => setShowServicePanel(!showServicePanel)}
                title="Service Panel"
              >
                🔧
              </button>
            </div>
            <div className="tv-back">
              <ServicePanel
                apiKey={apiKey}
                keyStatus={keyStatus}
                onSubmitKey={setApiKey}
                onClearKey={clearApiKey}
                onClose={() => setShowServicePanel(false)}
              />
            </div>
          </div>
        </div>

        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />

        {showFavorites && (
          <FavoritesList
            favoriteIds={favoriteIds}
            scenes={getAllScenesForLookup()}
            onSelect={handleFavoriteSelect}
            onRemove={handleToggleFavorite}
            onClose={() => setShowFavorites(false)}
          />
        )}

        {showHistory && (
          <HistoryList
            history={history}
            scenes={getAllScenesForLookup()}
            onSelect={handleHistorySelect}
            onClear={handleClearHistory}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </>
  );
}
