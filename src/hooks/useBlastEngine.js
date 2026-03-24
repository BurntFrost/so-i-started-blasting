import { useState, useCallback, useRef } from "react";
import { matchesFilters } from "../data/filters.js";
import { pickNext, recordPlay } from "../engine/blastEngine.js";

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

export function useBlastEngine(scenes) {
  const [current, setCurrentState] = useState(null);
  const historyRef = useRef(loadHistory());

  const getNext = useCallback(
    (filters = []) => {
      const pool =
        !filters || filters.length === 0
          ? scenes
          : scenes.filter((s) => matchesFilters(s, filters));

      if (pool.length === 0) return null;

      const pick = pickNext(pool, historyRef.current, scenes);
      historyRef.current = recordPlay(historyRef.current, pick.id);
      saveHistory(historyRef.current);
      setCurrentState(pick);
      return pick;
    },
    [scenes],
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

  return { current, getNext, setCurrent };
}
