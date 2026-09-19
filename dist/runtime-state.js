// Keep this module independent of the renderer so failed engine imports remain observable.
const stages = new Set(['module-load', 'webgl-init', 'device-init', 'authored-assets', 'context-lost']);
const sceneIds = new Set(['startup']);

export function registerGraphicsScenes(ids) {
  for (const id of ids.slice(0, 32)) if (/^[a-z0-9-]{1,40}$/.test(id)) sceneIds.add(id);
}

export function sendGraphicsEvent(name, data) {
  const browser = globalThis.window, privacy = globalThis.navigator;
  if (!browser || privacy?.globalPrivacyControl || privacy?.doNotTrack === '1' || browser.doNotTrack === '1') return;
  try { browser.va?.('event', { name, data }); } catch { /* Analytics must not interrupt rendering. */ }
}

export function createGraphicsFailureReporter(emit = sendGraphicsEvent) {
  const reported = new Set();
  return function report(stage, sceneId = 'startup') {
    if (!stages.has(stage)) return;
    const scene = sceneIds.has(sceneId) ? sceneId : 'startup', key = `${scene}/${stage}`;
    if (reported.size >= 40 || reported.has(key)) return;
    reported.add(key);
    emit('Scene Load Failed', { scene, stage });
  };
}

export const reportGraphicsFailure = createGraphicsFailureReporter();

export function markGraphicsFailure(error, stage) {
  const failure = new Error('Graphics startup failed.', { cause: error });
  failure.graphicsStage = stages.has(stage) ? stage : 'module-load';
  return failure;
}

export function graphicsFailureStage(error) {
  return stages.has(error?.graphicsStage) ? error.graphicsStage : 'module-load';
}

export function showGraphicsFailure(stage) {
  const page = globalThis.document;
  const messages = {
    'module-load': 'The graphics engine could not load. Check your connection and retry.',
    'webgl-init': '3D graphics could not start. Enable hardware acceleration or try another browser.',
    'device-init': '3D graphics could not start. Enable hardware acceleration or try another browser.',
    'authored-assets': 'Some scene details could not load. Retry to restore the full scene.',
    'context-lost': 'The graphics connection was interrupted. Retry to restart the player.',
  };
  const loading = page.getElementById('loading'), error = page.getElementById('error');
  if (loading) loading.hidden = true;
  if (error) error.hidden = false;
  const message = page.getElementById('error-message');
  if (message) message.textContent = messages[stage] || messages['module-load'];
  const canvas = page.getElementById('world'), status = page.getElementById('play-status'), play = page.getElementById('play');
  if (canvas) canvas.dataset.renderState = 'failed';
  if (status) status.textContent = 'RENDERER UNAVAILABLE';
  if (play) { play.textContent = '▶'; play.setAttribute('aria-label', 'Play simulation'); }
  page.querySelectorAll('.transport button,.transport input,#reset-camera').forEach(control => { control.disabled = true; });
}
