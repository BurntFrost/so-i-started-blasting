import { useState, useCallback, useRef } from "react";

export function useRandomScene(scenes) {
  const [current, setCurrent] = useState(null);
  const recentRef = useRef([]);

  const getNext = useCallback(
    (category = "all") => {
      const pool =
        category === "all"
          ? scenes
          : scenes.filter((s) => s.categories.includes(category));

      if (pool.length === 0) return null;

      const maxRecent = Math.min(5, pool.length - 1);
      const recentIds = new Set(
        recentRef.current.slice(-maxRecent).map((id) => id),
      );
      const candidates = pool.filter((s) => !recentIds.has(s.id));
      const pick =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : pool[Math.floor(Math.random() * pool.length)];

      recentRef.current = [...recentRef.current, pick.id].slice(-maxRecent);
      setCurrent(pick);
      return pick;
    },
    [scenes],
  );

  return { current, getNext };
}
