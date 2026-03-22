import { useState, useEffect, useCallback, useMemo } from "react";

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

const STORAGE_KEY = "sisb-favorites";

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState([]);

  useEffect(() => {
    setFavoriteIds(loadJSON(STORAGE_KEY, []));
  }, []);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const isFavorite = useCallback((id) => favoriteSet.has(id), [favoriteSet]);

  const toggleFavorite = useCallback((id) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((fid) => fid !== id)
        : [...prev, id];
      saveJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { favoriteIds, isFavorite, toggleFavorite };
}
