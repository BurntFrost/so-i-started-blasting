import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Browser modules stay buildless; a data URL also makes their ESM format explicit to Node.
const source = await readFile(new URL('../dist/telemetry.js', import.meta.url), 'utf8');
const { createGraphicsTelemetry, sendGraphicsEvent } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function harness() {
  const page = new EventTarget(), browser = new EventTarget(), events = [];
  page.hidden = false;
  let now = 0;
  const telemetry = createGraphicsTelemetry({ page, browser, clock: () => now, emit: (name, data) => events.push({ name, data }) });
  telemetry.setQuality('high', 'initial');
  function frame(delta = 100, active = true) { now += delta; telemetry.frame(now, active); }
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
  h.telemetry.loadFailed();
  assert.deepEqual(h.events, [{ name: 'Scene Load Failed', data: { scene: 'independence-day', stage: 'authored-assets' } }]);
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
