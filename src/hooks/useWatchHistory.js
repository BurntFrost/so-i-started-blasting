import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sisb-watch-history";
const MAX_HISTORY = 50;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useWatchHistory() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(loadJSON(STORAGE_KEY, []));
  }, []);

  const addToHistory = useCallback((sceneId) => {
    setHistory((prev) => {
      // Remove previous entry for this scene (so it moves to top)
      const filtered = prev.filter((entry) => entry.id !== sceneId);
      const next = [{ id: sceneId, watchedAt: Date.now() }, ...filtered].slice(
        0,
        MAX_HISTORY,
      );
      saveJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveJSON(STORAGE_KEY, []);
  }, []);

  return { history, addToHistory, clearHistory };
}
