import { useState, useCallback, useRef } from "react";
import { matchesFilters } from "../data/filters.js";
import { pickNext, recordPlay } from "../engine/blastEngine.js";
import { getHeartedDiscoveries } from "./useAiDiscovery.js";

const STORAGE_KEY = "sisb-blast-history";

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full or unavailable — silently continue
  }
}

export function useBlastEngine(scenes, favoriteIds = []) {
  const [current, setCurrentState] = useState(null);
  const [nextUp, setNextUp] = useState(null);
  const historyRef = useRef(loadHistory());
  const nextUpRef = useRef(null);

  const getNext = useCallback(
    (filters = []) => {
      // Merge hearted AI discoveries into the pool
      const aiFaves = getHeartedDiscoveries(favoriteIds);
      const fullPool = [...scenes, ...aiFaves];

      const pool =
        !filters || filters.length === 0
          ? fullPool
          : fullPool.filter((s) => matchesFilters(s, filters));

      if (pool.length === 0) return null;

      // Use pre-computed nextUp if it's still in the filtered pool
      const preComputed = nextUpRef.current;
      const pick =
        preComputed && pool.some((s) => s.id === preComputed.id)
          ? preComputed
          : pickNext(pool, historyRef.current, fullPool);
      if (!pick) return null;

      historyRef.current = recordPlay(historyRef.current, pick.id);
      saveHistory(historyRef.current);
      setCurrentState(pick);

      // Pre-compute the next scene for pre-warming
      const peeked = pickNext(pool, historyRef.current, fullPool);
      nextUpRef.current = peeked;
      setNextUp(peeked);

      return pick;
    },
    [scenes, favoriteIds],
  );

  const setCurrent = useCallback(
    (scene) => {
      if (scene) {
        historyRef.current = recordPlay(historyRef.current, scene.id);
        saveHistory(historyRef.current);
      }
      setCurrentState(scene);
    },
    [],
  );

  return { current, nextUp, getNext, setCurrent };
}
