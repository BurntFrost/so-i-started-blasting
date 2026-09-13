import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { scenes } from '../dist/scenes.js';
import { createGraphicsFailureReporter, markGraphicsFailure, graphicsFailureStage, showGraphicsFailure } from '../dist/runtime-state.js';
import { createGraphicsTelemetry, sendGraphicsEvent } from '../dist/telemetry.js';

function harness() {
  const page = new EventTarget(), browser = new EventTarget(), events = [];
  page.hidden = false;
  let now = 0;
  const telemetry = createGraphicsTelemetry({ page, browser, clock: () => now, emit: (name, data) => events.push({ name, data }) });
  telemetry.setQuality('high', 'initial');
  function frame(delta = 100, active = true, renderMilliseconds) { now += delta; telemetry.frame(now, active, renderMilliseconds); }
  function frames(count, delta = 100) { for (let i = 0; i < count; i++) frame(delta); }
  function hide(hidden) { page.hidden = hidden; page.dispatchEvent(new Event('visibilitychange')); }
  return { telemetry, page, browser, events, frame, frames, hide, advance: milliseconds => { now += milliseconds; } };
}

test('ready means first rendered frame, excludes hidden loading, and is once per scene', () => {
  const h = harness();
  h.advance(100);
  assert.equal(h.events.length, 0);
  h.hide(true); h.advance(10000); h.hide(false); h.frame(100, false);
  assert.deepEqual(h.events, [{ name: 'Scene Ready', data: { scene: 'independence-day', ready_ms: 200 } }]);
  h.frame(100, false);
  h.telemetry.selectScene(1); h.frame(25, false);
  assert.deepEqual(h.events[1], { name: 'Scene Ready', data: { scene: 'deep-impact', ready_ms: 25 } });
  h.telemetry.selectScene(0); h.frame(25, false);
  assert.equal(h.events.length, 2);
  h.telemetry.dispose();
});

test('one bounded sample per scene/tier produces mean FPS and p95 with only two properties', () => {
  const h = harness();
  h.frame(0); h.frames(10);
  for (let i = 0; i < 2000; i++) h.frame(i % 10 === 0 ? 50 : 10);
  const rate = h.events.filter(event => event.name === 'Frame Rate');
  const tail = h.events.filter(event => event.name === 'Frame Time P95');
  assert.equal(rate.length, 1);
  assert.equal(tail.length, 1);
  assert.equal(rate[0].data.scene_quality, 'independence-day/high');
  assert.ok(Math.abs(rate[0].data.fps - 71.4) < .4);
  assert.equal(tail[0].data.milliseconds, 50);
  assert.ok(h.events.every(event => Object.keys(event.data).length === 2));
  h.telemetry.dispose();
});

test('all anthology scenes emit distinct stable names, including newly added scenes', () => {
  const h = harness();
  for (let index = 0; index < scenes.length; index++) {
    h.telemetry.selectScene(index); h.frame(25, false);
  }
  assert.deepEqual(h.events.map(event => event.data.scene), scenes.map(scene => scene.id));
  assert.equal(new Set(h.events.map(event => event.data.scene)).size, 10);
  h.telemetry.selectScene(10); h.frame(25, false);
  assert.equal(h.events.length, 10);
  h.telemetry.dispose();
});

test('long visible frames count toward performance instead of being discarded', () => {
  const h = harness();
  h.frame(0); h.frames(10); h.frames(6, 1000); h.frames(40, 100);
  assert.equal(h.events.find(event => event.name === 'Frame Rate').data.fps, 4.6);
  assert.equal(h.events.find(event => event.name === 'Frame Time P95').data.milliseconds, 1000);
  h.telemetry.dispose();
});

test('paused and background gaps cannot reduce reported FPS', () => {
  const h = harness();
  h.frame(0); h.frames(70);
  h.telemetry.idle(); h.advance(100000); h.frame(100);
  h.hide(true); h.advance(100000); h.hide(false); h.frame(100);
  h.frames(40);
  assert.equal(h.events.find(event => event.name === 'Frame Rate').data.fps, 10);
  assert.equal(h.events.find(event => event.name === 'Frame Time P95').data.milliseconds, 100);
  h.telemetry.dispose();
});

test('quality transitions flush the preceding tier, are deduplicated, and have a hard cap', () => {
  const h = harness();
  h.frame(0); h.frames(70);
  h.telemetry.setQuality('balanced', 'slow');
  assert.equal(h.events.find(event => event.name === 'Frame Rate').data.scene_quality, 'independence-day/high');
  assert.deepEqual(h.events.find(event => event.name === 'Graphics Quality').data, { scene: 'independence-day', change: 'high>balanced:slow' });
  for (let scene = 0; scene < 4; scene++) {
    h.telemetry.selectScene(scene);
    for (let cycle = 0; cycle < 5; cycle++) {
      h.telemetry.setQuality('high', 'headroom');
      h.telemetry.setQuality('balanced', 'slow');
      h.telemetry.setQuality('lite', 'slow');
    }
  }
  assert.equal(h.events.filter(event => event.name === 'Graphics Quality').length, 8);
  h.telemetry.dispose();
});

test('pagehide flushes useful partial windows and bfcache restore does not duplicate them', () => {
  const h = harness();
  h.frame(0); h.frames(70);
  const event = new Event('pagehide'); event.persisted = true;
  h.browser.dispatchEvent(event);
  h.frames(200);
  assert.equal(h.events.filter(event => event.name === 'Frame Rate').length, 1);
  h.telemetry.dispose();
});

test('failed assets emit a bounded stage rather than URLs or error messages', () => {
  const h = harness();
  h.telemetry.loadFailed(); h.telemetry.loadFailed();
  assert.deepEqual(h.events, [{ name: 'Scene Load Failed', data: { scene: 'independence-day', stage: 'authored-assets' } }]);
  h.frame(25, false);
  assert.equal(h.events[1].name, 'Scene Ready', 'optional asset degradation must not stop rendering telemetry');
  h.telemetry.dispose();
});

test('first-render work captures paused startup and remains separate from steady sampling', () => {
  const h = harness();
  h.frame(100, false, 243.42); h.frame(100, false, 80);
  assert.deepEqual(h.events.find(event => event.name === 'First Render Work').data, { scene: 'independence-day', milliseconds: 243.4 });
  assert.equal(h.events.filter(event => event.name === 'First Render Work').length, 1);
  assert.equal(h.events.some(event => event.name === 'Frame Rate'), false);
  h.telemetry.selectScene(1); h.frame(25, false, 50);
  h.telemetry.selectScene(0); h.frame(25, false, 100);
  assert.equal(h.events.filter(event => event.name === 'First Render Work').length, 2);
  h.telemetry.dispose();
});

test('authored shader work is measured separately after fallback and only once per page', () => {
  const h = harness();
  h.frame(100, false, 12);
  h.telemetry.markAssetsReady(); h.frame(100, false, 345.67);
  assert.deepEqual(h.events.find(event => event.name === 'Authored Render Work').data, { scene: 'independence-day', milliseconds: 345.7 });
  h.telemetry.selectScene(1); h.telemetry.markAssetsReady(); h.frame(100, false, 900);
  assert.equal(h.events.filter(event => event.name === 'Authored Render Work').length, 1);
  assert.equal(h.events.some(event => event.name === 'Frame Rate'), false);
  h.telemetry.dispose();
});

test('authored work waits for a visible valid render submission before consuming its sample', () => {
  const h = harness();
  h.telemetry.markAssetsReady(); h.hide(true); h.frame(100, false, 200);
  h.hide(false); h.frame(100, false, NaN); h.frame(100, false, -1);
  assert.equal(h.events.some(event => event.name === 'Authored Render Work'), false);
  h.frame(100, false, 75);
  assert.equal(h.events.find(event => event.name === 'Authored Render Work').data.milliseconds, 75);
  h.telemetry.dispose();
});

test('initial stall sampling retains shader-settling stalls excluded from steady FPS', () => {
  const h = harness();
  h.frame(0); h.frame(800); h.frame(200); h.frames(100, 100);
  assert.deepEqual(h.events.find(event => event.name === 'First Load Stall').data, { scene: 'independence-day', milliseconds: 800 });
  assert.equal(h.events.find(event => event.name === 'Frame Rate').data.fps, 10);
  h.telemetry.setQuality('balanced', 'slow'); h.frames(200, 100);
  assert.equal(h.events.filter(event => event.name === 'First Load Stall').length, 1);
  h.telemetry.dispose();
});

test('initial stall sampling excludes paused and background gaps', () => {
  const h = harness();
  h.frame(0); h.frames(3, 100);
  h.telemetry.idle(); h.advance(100000); h.frame(100);
  h.hide(true); h.advance(100000); h.hide(false); h.frame(100);
  h.frames(20, 100);
  assert.equal(h.events.find(event => event.name === 'First Load Stall').data.milliseconds, 100);
  h.telemetry.dispose();
});

test('failure stages are allowlisted, deduplicated per scene, and capped per page', () => {
  const events = [], report = createGraphicsFailureReporter((name, data) => events.push({ name, data }));
  report('module-load'); report('module-load'); report('https://private.example/error?token=secret');
  report('context-lost', 'https://private.example/user');
  assert.deepEqual(events, [
    { name: 'Scene Load Failed', data: { scene: 'startup', stage: 'module-load' } },
    { name: 'Scene Load Failed', data: { scene: 'startup', stage: 'context-lost' } },
  ]);
  for (const scene of scenes) for (const stage of ['module-load', 'webgl-init', 'authored-assets', 'context-lost']) report(stage, scene.id);
  assert.equal(events.length, 40);
  assert.ok(events.every(event => Object.keys(event.data).length === 2));
});

test('marked initialization errors preserve their stage for the bootstrap catch', () => {
  const cause = new Error('raw details never sent to analytics');
  const error = markGraphicsFailure(cause, 'webgl-init');
  assert.equal(error.cause, cause);
  assert.equal(graphicsFailureStage(error), 'webgl-init');
  assert.equal(graphicsFailureStage(cause), 'module-load');
  assert.equal(graphicsFailureStage({ graphicsStage: 'unknown-stage' }), 'module-load');
});

test('bootstrap binds CSP-safe retry and does not relabel marked renderer failures', async () => {
  const boot = (await readFile(new URL('../dist/boot.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '').replace("import('./simulation.js?v=3')", 'loadSimulation()');
  for (const error of [new Error('failed import'), markGraphicsFailure(new Error(), 'webgl-init')]) {
    const reports = [], shown = [], handlers = {}; let reloads = 0;
    vm.runInNewContext(boot, {
      document: { getElementById: () => ({ addEventListener: (name, handler) => { handlers[name] = handler; } }) },
      location: { reload: () => reloads++ },
      loadSimulation: () => Promise.reject(error), graphicsFailureStage,
      reportGraphicsFailure: stage => reports.push(stage), showGraphicsFailure: stage => shown.push(stage),
    });
    await Promise.resolve();
    assert.deepEqual(shown, [graphicsFailureStage(error)]);
    assert.deepEqual(reports, error.graphicsStage ? [] : ['module-load']);
    handlers.click(); assert.equal(reloads, 1);
  }
});

test('failure UI disables renderer controls while preserving fullscreen and the scene catalogue', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const playAttributes = {};
  const nodes = { loading: { hidden: false }, error: { hidden: true }, 'error-message': { textContent: '' },
    world: { dataset: { renderState: 'ready' } }, 'play-status': { textContent: 'SIMULATION RUNNING' },
    play: { textContent: 'Ⅱ', setAttribute: (name, value) => { playAttributes[name] = value; } } };
  const controls = [{ disabled: false }, { disabled: false }], camera = { disabled: false }, fullscreen = { disabled: false }, card = { disabled: false };
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      getElementById: id => nodes[id],
      querySelectorAll: selector => [...controls,
        ...(selector.includes('.view-controls') ? [camera, fullscreen] : selector.includes('#reset-camera') ? [camera] : []),
        ...(selector.includes('#fullscreen') ? [fullscreen] : []), ...(selector.includes('.scene-card') ? [card] : [])],
    } });
    showGraphicsFailure('context-lost');
    assert.equal(nodes.loading.hidden, true); assert.equal(nodes.error.hidden, false);
    assert.match(nodes['error-message'].textContent, /interrupted/);
    assert.ok(controls.every(control => control.disabled));
    assert.equal(camera.disabled, true);
    assert.equal(fullscreen.disabled, false);
    assert.equal(card.disabled, false);
    assert.equal(nodes.world.dataset.renderState, 'failed');
    assert.equal(nodes['play-status'].textContent, 'RENDERER UNAVAILABLE');
    assert.equal(nodes.play.textContent, '▶');
    assert.equal(playAttributes['aria-label'], 'Play simulation');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document;
  }
});

test('Vercel adapter respects DNT/GPC and analytics failures never escape', () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const calls = [];
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { va: (...args) => calls.push(args) } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { doNotTrack: '1' } });
    sendGraphicsEvent('Frame Rate', { scene_quality: 'melancholia/lite', fps: 30 });
    globalThis.navigator.doNotTrack = '0'; globalThis.navigator.globalPrivacyControl = true;
    sendGraphicsEvent('Frame Rate', { scene_quality: 'melancholia/lite', fps: 30 });
    assert.equal(calls.length, 0);
    createGraphicsFailureReporter()('module-load');
    assert.equal(calls.length, 0, 'startup failures must honor the same opt-out');
    globalThis.navigator.globalPrivacyControl = false;
    sendGraphicsEvent('Frame Rate', { scene_quality: 'melancholia/lite', fps: 30 });
    assert.deepEqual(calls, [['event', { name: 'Frame Rate', data: { scene_quality: 'melancholia/lite', fps: 30 } }]]);
    globalThis.window.va = () => { throw new Error('blocked'); };
    assert.doesNotThrow(() => sendGraphicsEvent('Frame Rate', { scene_quality: 'melancholia/lite', fps: 30 }));
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
  }
});
