import { useState, useCallback, useRef } from "react";
import { matchesFilter } from "../data/filters.js";

export function useRandomScene(scenes) {
  const [current, setCurrent] = useState(null);
  const recentRef = useRef([]);

  const getNext = useCallback(
    (category = "all") => {
      const pool =
        category === "all"
          ? scenes
          : scenes.filter((s) => matchesFilter(s, category));

      if (pool.length === 0) return null;

      // Only consider recent IDs that are actually in this pool
      const poolIds = new Set(pool.map((s) => s.id));
      const relevantRecent = recentRef.current.filter((id) => poolIds.has(id));
      const maxRecent = Math.min(5, Math.max(0, pool.length - 1));
      const recentIds = new Set(relevantRecent.slice(-maxRecent));
      const candidates = pool.filter((s) => !recentIds.has(s.id));
      const pick =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : pool[Math.floor(Math.random() * pool.length)];

      recentRef.current = [...recentRef.current, pick.id].slice(
        -(Math.min(5, scenes.length - 1)),
      );
      setCurrent(pick);
      return pick;
    },
    [scenes],
  );

  return { current, getNext, setCurrent };
}
