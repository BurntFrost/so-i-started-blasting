const HISTORY_CAP = 2000;
const COOLDOWN_RATIO = 0.5;
const VIBE_WINDOW = 5;
const ERA_WINDOW = 3;
const MIN_CANDIDATES = 3;

const WEIGHTS = {
  recency: 0.5,
  vibeDiversity: 0.3,
  eraDiversity: 0.1,
  random: 0.1,
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
export function getRecentVibes(history, sceneMap, count) {
  const vibes = new Set();
  const recent = history.slice(-count);
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
export function getRecentEras(history, sceneMap, count) {
  const recent = history.slice(-count);
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
 * Pick a scene using scores as probability weights.
 * Higher-scoring clips are more likely but not guaranteed — keeps output genuinely random.
 */
function weightedRandomPick(scored) {
  const total = scored.reduce((sum, { score }) => sum + score, 0);
  if (total === 0) return scored[Math.floor(Math.random() * scored.length)].scene;

  let r = Math.random() * total;
  for (const { scene, score } of scored) {
    r -= score;
    if (r <= 0) return scene;
  }
  return scored[scored.length - 1].scene;
}

/**
 * Compute a 0–1 score for a candidate scene.
 *
 * Factors:
 *   recency      (0.5) — linear ramp over 50% of pool cooldown
 *   vibeDiversity (0.3) — overlap of candidate vibes with last 5 plays
 *   eraDiversity  (0.1) — overlap of candidate era with last 3 plays
 *   random        (0.1) — jitter
 */
export function scoreScene(scene, history, pool, { recentVibes, recentEras }) {
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
  let vibeDiversity;
  if (!recentVibes || scene.vibes.length === 0) {
    vibeDiversity = 1.0;
  } else {
    const overlapCount = scene.vibes.filter((v) => recentVibes.has(v)).length;
    vibeDiversity = 1 - overlapCount / scene.vibes.length;
  }

  // --- Era diversity ---
  let eraDiversity;
  if (!recentEras || recentEras.length === 0) {
    eraDiversity = 1.0;
  } else {
    const matchCount = recentEras.filter((e) => e === scene.era).length;
    eraDiversity = 1 - matchCount / recentEras.length;
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
 * Pick the next scene from pool.
 *
 * Phase 1 — Hard exclusion: clips from the last HARD_COOLDOWN plays are
 *   removed from candidates entirely, guaranteeing zero repeats within that window.
 * Phase 2 — Scoring: remaining candidates are scored for diversity.
 * Phase 3 — Weighted random: scores become probability weights so the output
 *   is genuinely random while still favoring diverse picks.
 */
export function pickNext(pool, history, allScenes) {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  // Phase 1: Hard exclusion — never repeat a clip the user has already seen.
  // Only resets when every clip in the pool has been watched.
  const seenIds = new Set(history);
  let candidates = pool.filter((s) => !seenIds.has(s.id));
  if (candidates.length === 0) candidates = pool;

  // Phase 2: Score for diversity
  const sceneMap = buildSceneMap(allScenes);
  const vibeWindow = Math.min(VIBE_WINDOW, candidates.length - 1);
  const eraWindow = Math.min(ERA_WINDOW, candidates.length - 1);
  const recentVibes =
    vibeWindow > 0 ? getRecentVibes(history, sceneMap, vibeWindow) : null;
  const recentEras =
    eraWindow > 0 ? getRecentEras(history, sceneMap, eraWindow) : null;

  const scored = candidates.map((scene) => ({
    scene,
    score: scoreScene(scene, history, pool, { recentVibes, recentEras }),
  }));

  // Phase 3: Weighted random selection
  return weightedRandomPick(scored);
}
