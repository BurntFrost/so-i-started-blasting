const sceneNames = ['independence-day', 'deep-impact', 'day-after-tomorrow', 'melancholia'];
const qualityNames = ['lite', 'balanced', 'high'];

// The bootstrap owns the Vercel queue. This adapter never creates identifiers or storage.
export function sendGraphicsEvent(name, data) {
  const browser = globalThis.window, privacy = globalThis.navigator;
  if (!browser || privacy?.globalPrivacyControl || privacy?.doNotTrack === '1' || browser.doNotTrack === '1') return;
  try { browser.va?.('event', { name, data }); } catch { /* Analytics must not interrupt rendering. */ }
}

export function createGraphicsTelemetry({
  clock = () => performance.now(),
  emit = sendGraphicsEvent,
  page = globalThis.document,
  browser = globalThis.window,
} = {}) {
  let scene = sceneNames[0], quality = '', previousFrame = null;
  let pendingReady = { scene, started: 0, hidden: 0 };
  let hiddenAt = page.hidden ? 0 : null;
  let durations = [], elapsed = 0, warmup = 0;
  const readyScenes = new Set(), measuredPairs = new Set(), qualityChanges = new Set();

  function resetWindow() { durations = []; elapsed = 0; warmup = 0; previousFrame = null; }
  function reportWindow(complete = false) {
    const pair = `${scene}/${quality}`;
    if (!measuredPairs.has(pair) && (complete || elapsed >= 5000) && durations.length >= 10) {
      const sorted = [...durations].sort((a, b) => a - b);
      measuredPairs.add(pair);
      // Two properties per event fit the base Pro plan without Analytics Plus.
      emit('Frame Rate', { scene_quality: pair, fps: Math.round(durations.length * 10000 / elapsed) / 10 });
      emit('Frame Time P95', { scene_quality: pair, milliseconds: Math.round(sorted[Math.ceil(sorted.length * .95) - 1] * 10) / 10 });
    }
    resetWindow();
  }
  function selectScene(index) {
    const next = sceneNames[index];
    if (!next || next === scene) return;
    reportWindow(); scene = next;
    pendingReady = readyScenes.has(scene) ? null : { scene, started: clock(), hidden: 0 };
    if (page.hidden) hiddenAt = clock();
  }
  function setQuality(next, reason) {
    if (!qualityNames.includes(next) || quality === next) return;
    reportWindow();
    if (quality) {
      const change = `${quality}>${next}:${reason}`, key = `${scene}/${change}`;
      if (qualityChanges.size < 8 && !qualityChanges.has(key)) {
        qualityChanges.add(key);
        emit('Graphics Quality', { scene, change });
      }
    }
    quality = next;
  }
  function idle() { previousFrame = null; }
  function frame(timestamp, active) {
    if (page.hidden) { idle(); return; }
    if (pendingReady) {
      emit('Scene Ready', { scene, ready_ms: Math.max(0, Math.round(clock() - pendingReady.started - pendingReady.hidden)) });
      readyScenes.add(scene); pendingReady = null;
    }
    if (!active || !quality || measuredPairs.has(`${scene}/${quality}`)) { idle(); return; }
    const delta = previousFrame === null ? 0 : timestamp - previousFrame;
    previousFrame = timestamp;
    if (!Number.isFinite(delta) || delta <= 0) return;
    // Skip a second of shader/quality settling; retain long frames in the measured window.
    if (warmup < 1000) { warmup += delta; return; }
    durations.push(delta); elapsed += delta;
    if (elapsed >= 10000 || durations.length >= 1200) reportWindow(true);
  }
  function visibilityChanged() {
    idle();
    if (page.hidden) hiddenAt = clock();
    else if (hiddenAt !== null) {
      if (pendingReady) pendingReady.hidden += clock() - hiddenAt;
      hiddenAt = null;
    }
  }
  function pageHidden(event) {
    reportWindow();
    if (!event.persisted) dispose();
  }
  function dispose() {
    page.removeEventListener('visibilitychange', visibilityChanged);
    browser.removeEventListener('pagehide', pageHidden);
    resetWindow();
  }
  function loadFailed() {
    emit('Scene Load Failed', { scene, stage: 'authored-assets' });
    dispose();
  }
  page.addEventListener('visibilitychange', visibilityChanged);
  browser.addEventListener('pagehide', pageHidden);
  return { selectScene, setQuality, frame, idle, loadFailed, dispose };
}
