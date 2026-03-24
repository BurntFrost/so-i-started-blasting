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

/**
 * Compute a 0–1 score for a candidate scene.
 *
 * Factors (see spec for details):
 *   recency      (0.4) — linear ramp over 50% of pool cooldown
 *   vibeDiversity (0.3) — overlap of candidate vibes with last 5 plays
 *   eraDiversity  (0.1) — overlap of candidate era with last 3 plays
 *   random        (0.2) — jitter to prevent deterministic ordering
 */
export function scoreScene(scene, history, pool, sceneMap) {
  const cooldown = Math.floor(pool.length * COOLDOWN_RATIO);

  // --- Recency ---
  const playsAgo = findPlaysAgo(history, scene.id);
  let recency;
  if (playsAgo === null || playsAgo >= cooldown) {
    recency = 1.0;
  } else {
    recency = cooldown === 0 ? 1.0 : playsAgo / cooldown;
  }

  // --- Vibe diversity ---
  const vibeWindow = Math.min(VIBE_WINDOW, pool.length - 1);
  let vibeDiversity;
  if (vibeWindow <= 0 || scene.vibes.length === 0) {
    vibeDiversity = 1.0;
  } else {
    const recentVibes = getRecentVibes(history, sceneMap, vibeWindow);
    const overlapCount = scene.vibes.filter((v) => recentVibes.has(v)).length;
    vibeDiversity = 1 - overlapCount / scene.vibes.length;
  }

  // --- Era diversity ---
  const eraWindow = Math.min(ERA_WINDOW, pool.length - 1);
  let eraDiversity;
  if (eraWindow <= 0) {
    eraDiversity = 1.0;
  } else {
    const recentEras = getRecentEras(history, sceneMap, eraWindow);
    const matchCount = recentEras.filter((e) => e === scene.era).length;
    eraDiversity = 1 - matchCount / eraWindow;
  }

  // --- Random jitter ---
  const random = Math.random();

  return (
    WEIGHTS.recency * recency +
    WEIGHTS.vibeDiversity * vibeDiversity +
    WEIGHTS.eraDiversity * eraDiversity +
    WEIGHTS.random * random
  );
}

/**
 * Score every scene in pool, return the highest scorer.
 * If pool has 0 scenes returns null. If pool has 1 scene returns it directly.
 */
export function pickNext(pool, history, allScenes) {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const sceneMap = buildSceneMap(allScenes);
  let best = null;
  let bestScore = -1;

  for (const scene of pool) {
    const score = scoreScene(scene, history, pool, sceneMap);
    if (score > bestScore) {
      bestScore = score;
      best = scene;
    }
  }

  return best;
}
