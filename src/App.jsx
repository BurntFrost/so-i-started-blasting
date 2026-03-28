import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { SCENES } from "./data/scenes.js";
import { useBlastEngine } from "./hooks/useBlastEngine.js";
import { useFavorites } from "./hooks/useFavorites.js";
import { useWatchHistory } from "./hooks/useWatchHistory.js";
import { ScenePlayer } from "./components/ScenePlayer.jsx";
import { ThumbnailMosaic } from "./components/ThumbnailMosaic.jsx";
import { FilterBar } from "./components/FilterBar.jsx";
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

  /* Filter toggle button in header */
  .filter-toggle {
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

  .filter-toggle:hover {
    border-color: var(--neon-yellow);
    background: rgba(255, 214, 0, 0.08);
    color: var(--neon-yellow);
  }

  .filter-toggle.has-active {
    border-color: var(--neon-green);
    color: var(--neon-green);
    text-shadow: 0 0 8px rgba(57, 255, 20, 0.3);
  }

  .filter-active-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    background: var(--neon-green);
    color: #000;
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 0 4px;
    margin-left: 6px;
  }

  /* Filter sidebar */
  .filter-sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 500;
    animation: fade-in 0.2s ease;
  }

  .filter-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    width: min(320px, 90vw);
    background: var(--bg-1);
    padding: 20px;
    overflow-y: auto;
    z-index: 501;
    scrollbar-width: thin;
    scrollbar-color: var(--bg-2) transparent;
  }

  .filter-sidebar-right {
    right: 0;
    border-left: 1px solid var(--border);
    animation: slide-in 0.25s ease;
  }

  .filter-sidebar-left {
    left: 0;
    border-right: 1px solid var(--border);
    animation: slide-in-left 0.25s ease;
  }

  .filter-sidebar::-webkit-scrollbar { width: 4px; }
  .filter-sidebar::-webkit-scrollbar-track { background: transparent; }
  .filter-sidebar::-webkit-scrollbar-thumb { background: var(--bg-2); border-radius: 2px; }

  .filter-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .filter-sidebar-title {
    font-family: "Special Elite", cursive;
    color: var(--neon-yellow);
    font-size: 1.2rem;
  }

  .filter-sidebar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-sidebar-close {
    background: none;
    border: none;
    color: var(--text-1);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px;
  }

  .filter-sidebar-close:hover {
    color: var(--text-0);
  }

  .filter-clear {
    background: none;
    border: 1px solid rgba(255, 23, 68, 0.3);
    color: var(--neon-red);
    font-size: 0.7rem;
    cursor: pointer;
    padding: 3px 10px;
    border-radius: 4px;
    font-family: "Inter", sans-serif;
    transition: all 0.15s;
  }

  .filter-clear:hover {
    background: rgba(255, 23, 68, 0.1);
    border-color: var(--neon-red);
  }

  .filter-groups {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-group-label {
    font-size: 0.7rem;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }

  .filter-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filter-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--pill-color, var(--border));
    background: var(--pill-bg, transparent);
    color: var(--pill-color, var(--text-1));
    font-size: 0.72rem;
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

  /* Video player container (multi-source) */
  .player-container {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .player-container iframe,
  .player-container video {
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

  /* Static / snow */
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

  @keyframes slide-in-left {
    from { transform: translateX(-100%); }
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
    position: relative;
    z-index: 1;
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

  /* Thumbnail mosaic background — floating tiles */
  .mosaic {
    position: fixed;
    inset: 0;
    overflow: hidden;
    z-index: 0;
    filter: saturate(0.2) brightness(0.6);
    animation: mosaic-fade-in 2.5s ease-out;
  }

  @keyframes mosaic-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .mosaic-cell {
    position: absolute;
    opacity: var(--tile-opacity, 0.12);
    transform: rotate(var(--tile-rotation, 0deg));
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
    animation: mosaic-drift var(--drift-duration, 40s) ease-in-out var(--drift-delay, 0s) infinite alternate;
  }

  @keyframes mosaic-drift {
    0% {
      transform: rotate(var(--tile-rotation, 0deg))
                 translate(0, 0);
    }
    50% {
      transform: rotate(calc(var(--tile-rotation, 0deg) + var(--drift-rot, 4deg)))
                 translate(var(--drift-x, 40px), var(--drift-y, 20px));
    }
    100% {
      transform: rotate(calc(var(--tile-rotation, 0deg) - var(--drift-rot, 4deg)))
                 translate(calc(var(--drift-x, 40px) * -0.6), calc(var(--drift-y, 20px) * -0.8));
    }
  }

  .mosaic-img {
    width: 100%;
    display: block;
    border-radius: 4px;
    transition: opacity 1s ease;
  }

  .mosaic-img-out {
    opacity: 0;
  }

  .mosaic-img-next {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0.5;
    border-radius: 4px;
  }

  @media (max-width: 600px) {
    .mosaic-cell {
      opacity: calc(var(--tile-opacity, 0.12) * 0.7);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mosaic-cell { animation: none; }
    .mosaic-img { transition: none; }
  }

  /* ═══ Edge Config Banners ═══ */
  .banner-maintenance {
    background: rgba(255, 23, 68, 0.12);
    border: 1px solid rgba(255, 23, 68, 0.3);
    color: var(--neon-red);
    padding: 10px 16px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.85rem;
    text-align: center;
    margin-bottom: 12px;
    letter-spacing: 1px;
    text-transform: uppercase;
    text-shadow: 0 0 8px rgba(255, 23, 68, 0.4);
  }

  .banner-announcement {
    background: rgba(57, 255, 20, 0.08);
    border: 1px solid rgba(57, 255, 20, 0.2);
    color: var(--neon-green);
    padding: 10px 16px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.85rem;
    text-align: center;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .banner-dismiss {
    background: none;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    font-size: 1rem;
    padding: 0 4px;
    line-height: 1;
    flex-shrink: 0;
  }
  .banner-dismiss:hover {
    color: var(--text-0);
  }

  .tv-info-actions {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
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
  const { favoriteIds, isFavorite, toggleFavorite } = useFavorites();
  const { history, addToHistory, clearHistory } = useWatchHistory();
  const [activeFilters, setActiveFilters] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [filterSide, setFilterSide] = useState(null); // "left" | "right" | null
  const [filterPinned, setFilterPinned] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Edge Config — runtime config from Vercel dashboard
  const [siteConfig, setSiteConfig] = useState(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((cfg) => { if (cfg) setSiteConfig(cfg); });
  }, []);

  // Edge-hover filter sidebar — opens when mouse approaches screen edges
  const edgeTimerRef = useRef(null);
  const filterSideRef = useRef(filterSide);
  filterSideRef.current = filterSide;

  useEffect(() => {
    if (!hasInteracted) return;
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouch) return;

    const EDGE_ZONE = 60;
    const OPEN_DELAY = 300;

    const handleMouseMove = (e) => {
      // Don't trigger if sidebar already open
      if (filterSideRef.current) return;

      const nearLeft = e.clientX < EDGE_ZONE;
      const nearRight = e.clientX > window.innerWidth - EDGE_ZONE;

      if (nearLeft || nearRight) {
        if (!edgeTimerRef.current) {
          const side = nearLeft ? "left" : "right";
          edgeTimerRef.current = setTimeout(() => {
            edgeTimerRef.current = null;
            // Re-check — sidebar may have opened via button in the meantime
            if (!filterSideRef.current) {
              setFilterSide(side);
              setFilterPinned(false);
              setShowFavorites(false);
              setShowHistory(false);
            }
          }, OPEN_DELAY);
        }
      } else {
        if (edgeTimerRef.current) {
          clearTimeout(edgeTimerRef.current);
          edgeTimerRef.current = null;
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (edgeTimerRef.current) {
        clearTimeout(edgeTimerRef.current);
        edgeTimerRef.current = null;
      }
    };
  }, [hasInteracted]);

  // Filter out dead clips reported by the daily sweep cron
  const liveScenes = useMemo(() => {
    if (!siteConfig?.deadClips?.length) return SCENES;
    const dead = new Set(siteConfig.deadClips);
    return SCENES.filter((s) => !dead.has(s.id));
  }, [siteConfig]);

  const { current, nextUp, getNext, setCurrent } = useBlastEngine(liveScenes);

  const handleEnter = useCallback(() => {
    setHasInteracted(true);
    // If a featured clip is configured, play it first
    const featuredId = siteConfig?.featuredClipId;
    if (featuredId) {
      const featured = SCENES.find((s) => s.id === featuredId);
      if (featured) {
        setCurrent(featured);
        addToHistory(featured.id);
        return;
      }
    }
    const first = getNext([]);
    if (first) addToHistory(first.id);
  }, [getNext, addToHistory, siteConfig, setCurrent]);

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

  const handleFilterClose = useCallback(() => {
    setFilterSide(null);
    setFilterPinned(false);
  }, []);

  const handleFilterMouseLeave = useCallback(() => {
    // Only auto-close in peek mode (not pinned)
    if (!filterPinned) {
      setFilterSide(null);
    }
  }, [filterPinned]);

  const handleFilterPin = useCallback(() => {
    setFilterPinned(true);
  }, []);

  if (!hasInteracted) {
    return (
      <>
        <style>{CSS}</style>
        <ThumbnailMosaic />
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
              className={`filter-toggle ${activeFilters.length > 0 ? "has-active" : ""}`}
              onClick={() => { setFilterSide("right"); setFilterPinned(true); setShowFavorites(false); setShowHistory(false); }}
            >
              🎛 Filters
              {activeFilters.length > 0 && (
                <span className="filter-active-count">{activeFilters.length}</span>
              )}
            </button>
            <button
              className="history-toggle"
              onClick={() => { setShowHistory(true); setFilterSide(null); setFilterPinned(false); setShowFavorites(false); }}
            >
              📼 History
            </button>
            <button
              className="fav-toggle"
              onClick={() => { setShowFavorites(true); setFilterSide(null); setFilterPinned(false); setShowHistory(false); }}
            >
              ♥ ({favoriteIds.length})
            </button>
          </div>
        </header>

        {siteConfig?.maintenance && (
          <div className="banner-maintenance">
            ⚠ Scheduled maintenance — some features may be unavailable
          </div>
        )}

        {siteConfig?.announcement && !announcementDismissed && (
          <div className="banner-announcement">
            <span>{siteConfig.announcement}</span>
            <button className="banner-dismiss" onClick={() => setAnnouncementDismissed(true)}>✕</button>
          </div>
        )}

        <ScenePlayer
          scene={current}
          nextScene={nextUp}
          isFavorite={current ? isFavorite(current.id) : false}
          onToggleFavorite={handleToggleFavorite}
          hasInteracted={hasInteracted}
          onBlast={handleBlast}
        />

        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />

        {filterSide && (
          <FilterBar
            active={activeFilters}
            onToggle={handleFilterToggle}
            onClear={handleFilterClear}
            onClose={handleFilterClose}
            side={filterSide}
            pinned={filterPinned}
            onMouseLeave={handleFilterMouseLeave}
            onPin={handleFilterPin}
          />
        )}

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
