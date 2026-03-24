import { useState, useCallback, useRef, useEffect } from "react";
import { streamRequest } from "../lib/streamClient.js";
import { SCENES } from "../data/scenes.js";

const DISCOVERIES_KEY = "sisb-ai-discoveries";
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
  // AI mode: null | "dial"
  const [aiMode, setAiMode] = useState(null);

  // Dial state
  const [dialResults, setDialResults] = useState([]);
  const [dialIndex, setDialIndex] = useState(0);
  const [dialLoading, setDialLoading] = useState(false);
  const [dialStreamDone, setDialStreamDone] = useState(false);
  const [dialWaiting, setDialWaiting] = useState(false);

  // Error state
  const [aiError, setAiError] = useState(null);

  // Abort controller for cancelling streams
  const abortRef = useRef(null);

  // ─── Current scene being played in AI mode ───
  const currentAiScene =
    aiMode === "dial"
      ? dialResults[dialIndex] || null
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
    setDialWaiting(false);
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
    setDialWaiting(false);
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
          setDialWaiting(false);
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

  // ─── Advance to next clip (called by onBlast routing) ───
  // Returns true if AI mode just ended (so App.jsx can trigger a fresh curated scene)
  const advanceAi = useCallback(() => {
    if (aiMode === "dial") {
      const nextIdx = dialIndex + 1;
      if (nextIdx < dialResults.length) {
        setDialIndex(nextIdx);
        setDialWaiting(false);
        return false;
      } else if (dialStreamDone) {
        exitAiMode();
        return true;
      }
      // Buffer empty, stream still running — signal waiting state
      setDialWaiting(true);
      return false;
    }
    return false;
  }, [aiMode, dialIndex, dialResults.length, dialStreamDone]);

  return {
    // State
    aiMode,
    currentAiScene,
    dialResults,
    dialIndex,
    dialLoading,
    dialStreamDone,
    dialWaiting,
    aiError,
    // Actions
    spinDial,
    advanceAi,
    exitAiMode,
  };
}
