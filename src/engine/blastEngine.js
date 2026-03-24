const HISTORY_CAP = 200;
const COOLDOWN_RATIO = 0.5;
const VIBE_WINDOW = 5;
const ERA_WINDOW = 3;

const WEIGHTS = {
  recency: 0.4,
  vibeDiversity: 0.3,
  eraDiversity: 0.1,
  random: 0.2,
};

/**
 * How many plays ago a scene last appeared in history.
 * Returns null if never played.
 * History is ordered oldest-first, so the last element is most recent (playsAgo = 1).
 */
export function findPlaysAgo(history, sceneId) {
  const idx = history.lastIndexOf(sceneId);
  if (idx === -1) return null;
  return history.length - idx;
}

/**
 * Build an ID → scene lookup map. Called once in pickNext and
 * threaded through to avoid rebuilding per candidate.
 */
export function buildSceneMap(allScenes) {
  return new Map(allScenes.map((s) => [s.id, s]));
}

/**
 * Collect all vibes from the last `window` plays.
 * Uses pre-built sceneMap; skips stale/missing IDs.
 */
export function getRecentVibes(history, sceneMap, window) {
  const vibes = new Set();
  const recent = history.slice(-window);
  for (const id of recent) {
    const scene = sceneMap.get(id);
    if (scene) scene.vibes.forEach((v) => vibes.add(v));
  }
  return vibes;
}

/**
 * Return eras of the last `window` plays.
 * Uses pre-built sceneMap; skips stale/missing IDs.
 */
export function getRecentEras(history, sceneMap, window) {
  const recent = history.slice(-window);
  return recent
    .map((id) => sceneMap.get(id))
    .filter(Boolean)
    .map((s) => s.era);
}

/**
 * Append a scene ID to history, trim to HISTORY_CAP.
 * Returns a new array (does not mutate input).
 */
export function recordPlay(history, sceneId) {
  const next = [...history, sceneId];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}
