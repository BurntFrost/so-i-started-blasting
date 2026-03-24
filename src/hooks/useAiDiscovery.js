import { useState, useCallback, useRef, useEffect } from "react";
import { streamRequest } from "../lib/streamClient.js";
import { SCENES } from "../data/scenes.js";

const TAPES_KEY = "sisb-tapes";
const DISCOVERIES_KEY = "sisb-ai-discoveries";
const MAX_TAPES = 5;
const MAX_DISCOVERIES = 50;

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

function addDiscoveries(scenes) {
  const existing = loadJSON(DISCOVERIES_KEY, []);
  const merged = [...scenes, ...existing].slice(0, MAX_DISCOVERIES);
  saveJSON(DISCOVERIES_KEY, merged);
  return merged;
}

/**
 * Resolve favorite IDs that might be AI-discovered clips.
 * Merges curated SCENES with the AI discoveries log.
 */
export function getAllScenesForLookup() {
  const discoveries = loadJSON(DISCOVERIES_KEY, []);
  return [...SCENES, ...discoveries];
}

export function useAiDiscovery(apiKey, history, favorites, activeFilters) {
  // AI mode: null | "dial" | "tape"
  const [aiMode, setAiMode] = useState(null);

  // Dial state
  const [dialResults, setDialResults] = useState([]);
  const [dialIndex, setDialIndex] = useState(0);
  const [dialLoading, setDialLoading] = useState(false);
  const [dialStreamDone, setDialStreamDone] = useState(false);

  // Tape state
  const [tapeData, setTapeData] = useState(null); // { name, theme, clips: [] }
  const [tapeIndex, setTapeIndex] = useState(0);
  const [tapeLoading, setTapeLoading] = useState(false);
  const [tapeStreamDone, setTapeStreamDone] = useState(false);

  // Tape shelf (persisted)
  const [tapeShelf, setTapeShelf] = useState(() => loadJSON(TAPES_KEY, []));

  // Error state
  const [aiError, setAiError] = useState(null);

  // Abort controller for cancelling streams
  const abortRef = useRef(null);

  // ─── Current scene being played in AI mode ───
  const currentAiScene =
    aiMode === "dial"
      ? dialResults[dialIndex] || null
      : aiMode === "tape"
        ? tapeData?.clips?.[tapeIndex] || null
        : null;

  // ─── Helpers ───
  function cancelStream() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  function exitAiMode() {
    cancelStream();
    setAiMode(null);
    setDialResults([]);
    setDialIndex(0);
    setDialLoading(false);
    setDialStreamDone(false);
    setTapeData(null);
    setTapeIndex(0);
    setTapeLoading(false);
    setTapeStreamDone(false);
    setAiError(null);
  }

  // ─── Error auto-clear after 3 seconds ───
  useEffect(() => {
    if (!aiError) return;
    const timer = setTimeout(() => {
      setAiError(null);
      exitAiMode();
    }, 3000);
    return () => clearTimeout(timer);
  }, [aiError]);

  // ─── Channel Dial ───
  const spinDial = useCallback(() => {
    cancelStream();
    setAiMode("dial");
    setDialResults([]);
    setDialIndex(0);
    setDialLoading(true);
    setDialStreamDone(false);
    setAiError(null);

    // Resolve last 20 watch history IDs to full scene objects
    const recentIds = (history || []).slice(0, 20).map((h) => h.id || h);
    const watchHistory = recentIds
      .map((id) => SCENES.find((s) => s.id === id))
      .filter(Boolean);

    const accumulated = [];

    abortRef.current = streamRequest("/api/dial", apiKey, { watchHistory, currentVibes: activeFilters || [] }, {
      onEvent(data) {
        if (data.scene) {
          accumulated.push(data.scene);
          setDialResults([...accumulated]);
          if (accumulated.length === 1) setDialLoading(false);
        }
      },
      onDone() {
        setDialStreamDone(true);
        setDialLoading(false);
        if (accumulated.length > 0) {
          addDiscoveries(accumulated);
        } else {
          setAiError("DEAD_AIR");
        }
      },
      onError(err) {
        setDialLoading(false);
        setAiError(err.includes("INVALID_KEY") ? "INVALID_KEY" : "SIGNAL_LOST");
      },
    });
  }, [apiKey, history, activeFilters]);

  // ─── VHS Tape ───
  const insertTape = useCallback(() => {
    cancelStream();
    setAiMode("tape");
    setTapeData(null);
    setTapeIndex(0);
    setTapeLoading(true);
    setTapeStreamDone(false);
    setAiError(null);

    // Resolve last 50 history + favorites to full scene objects
    const recentIds = (history || []).slice(0, 50).map((h) => h.id || h);
    const watchHistory = recentIds
      .map((id) => SCENES.find((s) => s.id === id))
      .filter(Boolean);

    const allScenes = getAllScenesForLookup();
    const favIds = (favorites || []).slice(0, 20);
    const favScenes = favIds
      .map((id) => allScenes.find((s) => s.id === id))
      .filter(Boolean);

    let tapeMeta = null;
    const clips = [];

    abortRef.current = streamRequest("/api/tape", apiKey, {
      watchHistory,
      favorites: favScenes,
    }, {
      onEvent(data) {
        if (data.tape) {
          tapeMeta = data.tape;
          setTapeData({ ...tapeMeta, clips: [] });
        }
        if (data.scene) {
          clips.push(data.scene);
          setTapeData((prev) => ({
            ...(prev || tapeMeta || { name: "MYSTERY TAPE", theme: "" }),
            clips: [...clips],
          }));
          if (clips.length === 1) setTapeLoading(false);
        }
      },
      onDone() {
        setTapeStreamDone(true);
        setTapeLoading(false);
        if (clips.length > 0) {
          addDiscoveries(clips);
          // Auto-save tape to shelf
          const tape = {
            name: tapeMeta?.name || "MYSTERY TAPE",
            theme: tapeMeta?.theme || "",
            clips: [...clips],
            savedAt: Date.now(),
          };
          setTapeShelf((prev) => {
            const updated = [tape, ...prev].slice(0, MAX_TAPES);
            saveJSON(TAPES_KEY, updated);
            return updated;
          });
        } else {
          setAiError("BAD_TAPE");
        }
      },
      onError(err) {
        setTapeLoading(false);
        setAiError(err.includes("INVALID_KEY") ? "INVALID_KEY" : "SIGNAL_LOST");
      },
    });
  }, [apiKey, history, favorites]);

  // ─── Play saved tape from shelf ───
  const playSavedTape = useCallback((tape) => {
    cancelStream();
    setAiMode("tape");
    setTapeData(tape);
    setTapeIndex(0);
    setTapeLoading(false);
    setTapeStreamDone(true);
    setAiError(null);
  }, []);

  // ─── Advance to next clip (called by onBlast routing) ───
  // Returns true if AI mode just ended (so App.jsx can trigger a fresh curated scene)
  const advanceAi = useCallback(() => {
    if (aiMode === "dial") {
      const nextIdx = dialIndex + 1;
      if (nextIdx < dialResults.length) {
        setDialIndex(nextIdx);
        return false;
      } else if (dialStreamDone) {
        exitAiMode();
        return true; // signal: AI mode ended naturally
      }
      // else: buffer empty, waiting for more clips — stay on static
      return false;
    } else if (aiMode === "tape") {
      const nextIdx = tapeIndex + 1;
      if (nextIdx < (tapeData?.clips?.length || 0)) {
        setTapeIndex(nextIdx);
        return false;
      } else {
        exitAiMode();
        return true; // signal: AI mode ended naturally
      }
    }
    return false;
  }, [aiMode, dialIndex, dialResults.length, dialStreamDone, tapeIndex, tapeData?.clips?.length]);

  return {
    // State
    aiMode,
    currentAiScene,
    dialResults,
    dialIndex,
    dialLoading,
    dialStreamDone,
    tapeData,
    tapeIndex,
    tapeLoading,
    tapeStreamDone,
    tapeShelf,
    aiError,
    // Actions
    spinDial,
    insertTape,
    playSavedTape,
    advanceAi,
    exitAiMode,
  };
}
