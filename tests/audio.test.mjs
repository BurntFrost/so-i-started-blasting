import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneAudio, crossedAudioCues, sceneSoundtracks } from '../dist/audio.js';
import { scenes } from '../dist/scenes.js';

const frame = (time, extra = {}) => ({ sceneId: 'independence-day', time, speed: 1, playing: true, hidden: false, failed: false, ...extra });
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness({ failures = [], pending = false, resumeFails = false, startFails = false } = {}) {
  const requests = [], sources = [], resolvers = [];
  let context;
  class FakeAudioContext {
    constructor() { context = this; this.currentTime = 0; this.state = 'suspended'; this.destination = {}; }
    async resume() { if (resumeFails) throw new Error('Browser denied audio'); this.state = 'running'; }
    async close() { this.state = 'closed'; }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createBufferSource() {
      const source = { playbackRate: { value: 1 }, connect() {}, disconnect() {},
        start(when, offset) { if (startFails) throw new Error('Audio device interrupted'); this.offset = offset; this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    }
    async decodeAudioData(data) { return { duration: 30, asset: data }; }
  }
  const fetchAsset = async url => {
    requests.push(url);
    if (pending) await new Promise(resolve => resolvers.push(resolve));
    return { ok: !failures.some(name => url.includes(name)), arrayBuffer: async () => url };
  };
  const audio = createSceneAudio({ AudioContextClass: FakeAudioContext, fetchAsset });
  return { audio, requests, sources, resolvers, get context() { return context; } };
}

test('every scene has a local sound bed and cues within its 30-second timeline', () => {
  assert.deepEqual(Object.keys(sceneSoundtracks).sort(), scenes.map(scene => scene.id).sort());
  for (const { bed, cues } of Object.values(sceneSoundtracks)) {
    assert.match(bed, /^[a-z-]+$/);
    assert.ok(cues.every(cue => cue.at > 0 && cue.at < 30));
  }
});

test('cue crossings distinguish real playback from pauses, reverse scrubs, jumps and scene changes', () => {
  assert.deepEqual(crossedAudioCues(frame(12.96), frame(13.04)).map(cue => cue.asset), ['impact']);
  assert.equal(crossedAudioCues(frame(12.96), frame(13.04), true).length, 0);
  for (const [before, after] of [
    [frame(0), frame(14)], [frame(14), frame(12)], [frame(12.96), frame(13.04, { playing: false })],
    [frame(12.96, { playing: false }), frame(13.04)], [frame(12.96), frame(13.04, { hidden: true })],
    [frame(12.96, { hidden: true }), frame(13.04)], [frame(12.96), frame(13.04, { failed: true })],
    [frame(12.96), frame(13.04, { sceneId: 'deep-impact' })],
  ]) assert.equal(crossedAudioCues(before, after).length, 0);
  assert.equal(crossedAudioCues(frame(12.9, { speed: 2 }), frame(13.1, { speed: 2 })).length, 1);
});

test('sound requires consent and starts from the current shared time, including half-speed playback', async () => {
  const { audio, requests, sources } = harness();
  audio.update(frame(12.5, { speed: .5 }));
  assert.equal(audio.state.enabled, false); assert.equal(requests.length, 0); assert.equal(sources.length, 0);
  await audio.enable(); await settle();
  assert.ok(requests.every(url => url.startsWith('/assets/audio/')));
  assert.equal(audio.state.state, 'playing'); assert.equal(audio.state.activeSources, 1);
  assert.equal(sources[0].offset, 12.5); assert.equal(sources[0].playbackRate.value, .5);
  audio.update(frame(12.55, { speed: 2 }));
  assert.equal(sources[0].stopped, true); assert.equal(sources.at(-1).offset, 12.55);
  assert.equal(sources.at(-1).playbackRate.value, 2);
  audio.dispose();
});

test('mute, pause, hidden page, renderer failure and scene switches stop every bed and cue', async () => {
  for (const action of ['mute', 'pause', 'hidden', 'failure', 'scene', 'volume', 'dispose']) {
    const { audio, sources } = harness();
    audio.update(frame(12.96)); await audio.enable(); await settle();
    audio.update(frame(13.04));
    assert.equal(audio.state.activeCues, 1, action);
    if (action === 'mute') audio.mute();
    else if (action === 'volume') audio.setVolume(0);
    else if (action === 'dispose') audio.dispose();
    else audio.update(frame(13.05, { playing: action !== 'pause' && action !== 'scene', hidden: action === 'hidden', failed: action === 'failure', sceneId: action === 'scene' ? 'interstellar' : 'independence-day' }));
    assert.equal(audio.state.activeSources, 0, action);
    assert.ok(sources.every(source => source.stopped), action);
    audio.dispose();
  }
});

test('scrubbing does not fire historical effects, while replay can cross the cue again', async () => {
  const { audio } = harness();
  audio.update(frame(12.96)); await audio.enable(); await settle();
  audio.update(frame(13.04)); assert.equal(audio.state.activeCues, 1);
  audio.update(frame(20, { playing: false })); assert.equal(audio.state.activeSources, 0);
  audio.update(frame(20.01)); assert.equal(audio.state.activeCues, 0);
  audio.update(frame(12.96), { discontinuity: true }); assert.equal(audio.state.activeCues, 0);
  audio.update(frame(13.04)); assert.equal(audio.state.activeCues, 1);
  audio.dispose();
});

test('failed asset and blocked browser audio remain isolated from simulation updates', async () => {
  const missing = harness({ failures: ['alien-drone'] });
  missing.audio.update(frame(12)); await missing.audio.enable(); await settle();
  assert.equal(missing.audio.state.state, 'degraded'); assert.equal(missing.audio.state.failedAssets.length, 1);
  assert.doesNotThrow(() => missing.audio.update(frame(12.1)));
  missing.audio.dispose();
  const blocked = harness({ resumeFails: true });
  await blocked.audio.enable();
  assert.equal(blocked.audio.state.state, 'unavailable'); assert.equal(blocked.requests.length, 0);
  assert.equal(blocked.audio.state.activeSources, 0); blocked.audio.dispose();
  const interrupted = harness({ startFails: true });
  interrupted.audio.update(frame(12)); await interrupted.audio.enable(); await settle();
  assert.equal(interrupted.audio.state.state, 'unavailable');
  assert.equal(interrupted.audio.state.activeSources, 0);
  assert.doesNotThrow(() => interrupted.audio.update(frame(12.1))); interrupted.audio.dispose();
});

test('late asset completions respect current scene, pause and consent instead of reviving old audio', async () => {
  const { audio, resolvers, sources } = harness({ pending: true });
  audio.update(frame(4)); await audio.enable();
  assert.equal(audio.state.state, 'loading'); assert.equal(audio.state.activeSources, 0);
  audio.update(frame(10, { sceneId: 'interstellar', playing: false }));
  audio.mute();
  for (const resolve of resolvers) resolve(); await settle();
  assert.equal(audio.state.state, 'off'); assert.equal(sources.length, 0);
  await audio.enable(); await settle();
  assert.equal(audio.state.state, 'paused'); assert.equal(sources.length, 0);
  audio.update(frame(10, { sceneId: 'interstellar' }));
  assert.equal(sources[0].buffer.asset, '/assets/audio/cosmic-drone.mp3');
  assert.equal(sources[0].offset, 10); audio.dispose();
});
