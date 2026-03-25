import { useState, useCallback, useRef, useEffect, useReducer } from "react";
import { streamRequest } from "../lib/streamClient.js";
import { SCENES } from "../data/scenes.js";

const DISCOVERIES_KEY = "sisb-ai-discoveries";
const MAX_DISCOVERIES = 50;
const BUFFER_LOW = 2; // trigger refill when buffer drops below this

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

/**
 * Get hearted AI discoveries (for merging into blast pool).
 */
export function getHeartedDiscoveries(favoriteIds) {
  const favSet = new Set(favoriteIds);
  const discoveries = loadJSON(DISCOVERIES_KEY, []);
  return discoveries.filter((s) => favSet.has(s.id));
}

// ─── Reducer for atomic current/buffer/played transitions ───
const initialPlaybackState = { current: null, buffer: [], played: [] };

function playbackReducer(state, action) {
  switch (action.type) {
    case "RESET":
      return initialPlaybackState;
    case "ADD_TO_BUFFER": {
      // If nothing is playing, immediately set as current instead of buffering
      if (!state.current) {
        return { ...state, current: action.scene };
      }
      return { ...state, buffer: [...state.buffer, action.scene] };
    }
    case "ADVANCE": {
      const [next, ...rest] = state.buffer;
      return {
        current: next || null,
        buffer: rest,
        played: state.current ? [...state.played, state.current] : state.played,
      };
    }
    default:
      return state;
  }
}

export function useAiDiscovery(apiKey, history, favorites, activeFilters) {
  const [aiMode, setAiMode] = useState(false);
  const [playback, dispatch] = useReducer(playbackReducer, initialPlaybackState);
  const [fetching, setFetching] = useState(false);
  const [rateMeta, setRateMeta] = useState(null);
  const [error, setError] = useState(null); // "RATE_LIMITED" | "SIGNAL_LOST" | "INVALID_KEY" | null

  const abortRef = useRef(null);
  const fetchingRef = useRef(false); // ref mirror to avoid stale closures
  const playedRef = useRef([]); // ref mirror for played (used in callbacks)

  // Keep refs in sync
  useEffect(() => { playedRef.current = playback.played; }, [playback.played]);
  useEffect(() => { fetchingRef.current = fetching; }, [fetching]);

  // ─── Cancel any in-flight request ───
  function cancelStream() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  // ─── Exit discovery mode ───
  const exitDiscovery = useCallback(() => {
    cancelStream();
    // Save any played + buffered clips as discoveries before exiting
    const allDiscovered = [...playedRef.current, ...playback.buffer];
    if (allDiscovered.length > 0) addDiscoveries(allDiscovered);

    setAiMode(false);
    dispatch({ type: "RESET" });
    setFetching(false);
    setError(null);
  }, [playback.buffer]);

  // ─── Fetch a batch of discoveries ───
  const refill = useCallback(() => {
    // Use ref to avoid stale closure over fetching state
    if (fetchingRef.current) return;
    setFetching(true);

    // Resolve last 20 watch history IDs to full scene objects
    const recentIds = (history || []).slice(0, 20).map((h) => h.id || h);
    const watchHistory = recentIds
      .map((id) => SCENES.find((s) => s.id === id))
      .filter(Boolean);

    // Session-played videoIds (capped at 50 for request size)
    const sessionPlayed = playedRef.current
      .map((s) => s.videoId)
      .slice(0, 50);

    const accumulated = [];

    abortRef.current = streamRequest(
      "/api/dial",
      apiKey || null, // null = free tier (no auth header)
      { watchHistory, sessionPlayed, currentVibes: activeFilters || [] },
      {
        onEvent(data) {
          if (data.scene) {
            accumulated.push(data.scene);
            dispatch({ type: "ADD_TO_BUFFER", scene: data.scene });
          }
        },
        onMeta(meta) {
          setRateMeta(meta);
        },
        onDone() {
          setFetching(false);
          if (accumulated.length > 0) {
            addDiscoveries(accumulated);
          }
        },
        onError(err) {
          setFetching(false);
          if (err.includes("INVALID_KEY")) {
            setError("INVALID_KEY");
          } else if (err.includes("RATE_LIMITED") || err.includes("429")) {
            setError("RATE_LIMITED");
          } else {
            setError("SIGNAL_LOST");
          }
        },
      },
    );
  }, [apiKey, history, activeFilters]); // no `fetching` dep — uses fetchingRef instead

  // ─── Enter discovery mode ───
  const enterDiscovery = useCallback(() => {
    cancelStream();
    setAiMode(true);
    dispatch({ type: "RESET" });
    setFetching(false);
    setError(null);
    setRateMeta(null);
    // First refill triggered by the auto-refill useEffect below
  }, []);

  // ─── Advance to next clip ───
  const advance = useCallback(() => {
    dispatch({ type: "ADVANCE" });
  }, []);

  // ─── Auto-refill when buffer is low (also handles first refill on mode entry) ───
  useEffect(() => {
    if (!aiMode) return;
    if (playback.buffer.length < BUFFER_LOW && !fetching && !error) {
      refill();
    }
  }, [aiMode, playback.buffer.length, fetching, error, refill]);

  // ─── Error auto-clear after 3 seconds (for transient errors) ───
  useEffect(() => {
    if (error && error !== "RATE_LIMITED" && error !== "INVALID_KEY") {
      const timer = setTimeout(() => {
        setError(null);
        // Clearing error will trigger auto-refill via the useEffect above
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // ─── Derived state ───
  const isScanning = aiMode && fetching && !playback.current;
  const isBuffering = aiMode && !playback.current && !fetching && playback.buffer.length === 0 && !error;
  const isDriedUp = aiMode && !playback.current && playback.buffer.length === 0 && !fetching && !!error;

  return {
    // State
    aiMode,
    current: playback.current,
    buffer: playback.buffer,
    played: playback.played,
    fetching,
    rateMeta,
    error,
    isScanning,
    isBuffering,
    isDriedUp,
    // Actions
    enterDiscovery,
    advance,
    exitDiscovery,
  };
}
