// Original local sound follows the simulation clock; consent never persists across visits.
const cue = (at, asset, gain = .7) => ({ at, asset, gain });
const audioFiles = {
  'alien-drone': '/assets/audio/alien-drone.mp3',
  'ocean-storm': '/assets/audio/ocean-storm.mp3',
  'ice-wind': '/assets/audio/ice-wind.mp3',
  'cosmic-drone': '/assets/audio/cosmic-drone.mp3',
  'seismic-rumble': '/assets/audio/seismic-rumble.mp3',
  'machine-pulse': '/assets/audio/machine-pulse.mp3',
  'solar-roar': '/assets/audio/solar-roar.mp3',
  impact: '/assets/audio/impact.mp3', fracture: '/assets/audio/fracture.mp3',
  charge: '/assets/audio/charge.mp3', intro: '/assets/audio/intro.mp3',
};
export const sceneSoundtracks = {
  'independence-day': { bed: 'alien-drone', cues: [cue(9, 'charge'), cue(13, 'impact'), cue(18, 'fracture', .45)] },
  'deep-impact': { bed: 'ocean-storm', cues: [cue(13, 'impact'), cue(20, 'fracture', .4)] },
  'day-after-tomorrow': { bed: 'ice-wind', cues: [cue(10, 'charge', .35), cue(19, 'fracture', .35)] },
  melancholia: { bed: 'cosmic-drone', cues: [cue(22, 'charge', .5), cue(28, 'impact')] },
  'terminator-2': { bed: 'seismic-rumble', cues: [cue(3, 'charge', .35), cue(4, 'impact'), cue(12, 'fracture')] },
  '2012': { bed: 'seismic-rumble', cues: [cue(3, 'fracture'), cue(10, 'impact', .55), cue(21, 'fracture')] },
  'war-of-the-worlds': { bed: 'machine-pulse', cues: [cue(6, 'charge'), cue(8, 'impact', .55)] },
  knowing: { bed: 'solar-roar', cues: [cue(5, 'charge', .55), cue(20, 'impact')] },
  armageddon: { bed: 'cosmic-drone', cues: [cue(9, 'charge', .4), cue(16, 'impact'), cue(18, 'fracture')] },
  interstellar: { bed: 'cosmic-drone', cues: [cue(19, 'charge', .35)] },
};

export function crossedAudioCues(previous, next, discontinuity = false) {
  // The renderer advances at most .1 seconds per frame before applying speed.
  const step = next.time - (previous?.time ?? next.time);
  if (discontinuity || !previous?.playing || !next.playing || previous.hidden || next.hidden ||
      previous.failed || next.failed || previous.sceneId !== next.sceneId || step <= 0 ||
      step > .1 * Math.max(previous.speed, next.speed) + .025) return [];
  return (sceneSoundtracks[next.sceneId]?.cues || []).filter(item => previous.time < item.at && next.time >= item.at);
}

export function createSceneAudio({ button, volumeInput, status, player,
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetchAsset = (...args) => globalThis.fetch(...args),
} = {}) {
  const assets = new Map(), voices = new Set();
  let context, master, bed, enabled = false, disposed = false, introPlayed = false, opening = false;
  let volume = .55, message = '', latest = { sceneId: 'independence-day', time: 0, speed: 1, playing: false, hidden: false, failed: false };

  function requiredAssets() {
    const track = sceneSoundtracks[latest.sceneId];
    return track ? [...new Set([track.bed, ...track.cues.map(item => item.asset), ...(!introPlayed ? ['intro'] : [])])] : [];
  }
  function snapshot() {
    const required = requiredAssets(), failed = required.filter(name => assets.get(name)?.state === 'failed');
    const loading = required.some(name => !assets.has(name) || assets.get(name).state === 'loading');
    let state = !enabled ? 'off' : opening || loading ? 'loading' : context?.state !== 'running' ? 'blocked' :
      failed.length === required.length && failed.length ? 'unavailable' : failed.length ? 'degraded' :
      volume === 0 ? 'muted' : !latest.playing || latest.hidden || latest.failed ? 'paused' : 'playing';
    if (message) state = 'unavailable';
    return { enabled, state, volume, sceneId: latest.sceneId, time: latest.time, speed: latest.speed,
      contextState: context?.state || 'none', activeSources: voices.size, activeCues: [...voices].filter(voice => voice !== bed).length,
      loadedAssets: required.filter(name => assets.get(name)?.state === 'ready'), failedAssets: failed };
  }
  function publish() {
    const value = snapshot(), labels = { off: 'SOUND OFF', loading: 'LOADING LOCAL SOUND…', blocked: 'TAP SOUND TO RESUME',
      unavailable: 'SOUND UNAVAILABLE · TAP TO RETRY', degraded: 'SOME SOUNDS UNAVAILABLE', muted: 'VOLUME AT ZERO', paused: 'SOUND READY · PAUSED', playing: 'ORIGINAL SOUNDSCAPE' };
    if (status && status.textContent !== (message || labels[value.state])) status.textContent = message || labels[value.state];
    if (button) {
      const retry = value.state === 'unavailable' || value.state === 'blocked';
      button.textContent = retry ? 'RETRY SOUND' : enabled ? 'SOUND ON' : 'ENABLE SOUND';
      button.setAttribute('aria-label', retry ? 'Retry sound' : enabled ? 'Mute sound' : 'Enable sound');
      button.setAttribute('aria-pressed', String(enabled));
    }
    if (volumeInput) volumeInput.setAttribute('aria-valuetext', `${Math.round(volume * 100)} percent`);
    if (player) {
      player.dataset.audioState = value.state;
      player.dataset.audioSources = String(value.activeSources);
      player.dataset.audioCues = String(value.activeCues);
      player.dataset.audioScene = value.sceneId;
      player.dataset.audioTime = String(value.time);
      player.dataset.audioRate = String(value.speed);
      player.dataset.audioFailures = String(value.failedAssets.length);
    }
  }
  function stop(voice) {
    if (!voice) return;
    voices.delete(voice);
    if (bed === voice) bed = null;
    try { voice.source.stop(); } catch { /* A naturally finished source is already stopped. */ }
    voice.source.disconnect(); voice.gain.disconnect();
  }
  function stopAll() { for (const voice of [...voices]) stop(voice); }
  function play(asset, offset, gain, isBed = false) {
    const buffer = assets.get(asset)?.buffer;
    if (!buffer || offset >= buffer.duration - .01) return;
    let source, level;
    try {
      source = context.createBufferSource(); level = context.createGain();
      source.buffer = buffer; source.playbackRate.value = latest.speed;
      level.gain.setValueAtTime(0, context.currentTime);
      level.gain.linearRampToValueAtTime(gain, context.currentTime + .02);
      source.connect(level); level.connect(master);
      const voice = { source, gain: level, sceneId: latest.sceneId, time: latest.time, rate: latest.speed, started: context.currentTime };
      source.onended = () => { if (voices.has(voice)) { voices.delete(voice); if (bed === voice) bed = null; source.disconnect(); level.disconnect(); publish(); } };
      voices.add(voice); if (isBed) bed = voice;
      source.start(0, Math.max(0, offset));
    } catch {
      enabled = false; message = 'SOUND WAS INTERRUPTED · TAP TO RETRY'; stopAll();
      source?.disconnect(); level?.disconnect(); publish();
    }
  }
  function reconcile() {
    const active = enabled && !disposed && !opening && context?.state === 'running' && volume > 0 &&
      latest.playing && !latest.hidden && !latest.failed && latest.time < 30;
    if (!active) { stopAll(); publish(); return false; }
    const expected = bed && bed.time + (context.currentTime - bed.started) * bed.rate;
    if (bed && (bed.sceneId !== latest.sceneId || bed.rate !== latest.speed || Math.abs(expected - latest.time) > .18)) stop(bed);
    if (!bed) play(sceneSoundtracks[latest.sceneId]?.bed, latest.time, .72, true);
    for (const voice of voices) voice.source.playbackRate.value = latest.speed;
    publish(); return enabled;
  }
  function load(asset) {
    if (assets.has(asset) || disposed) return;
    const controller = new AbortController(), entry = { state: 'loading', controller };
    assets.set(asset, entry);
    const timeout = setTimeout(() => controller.abort(), 15000);
    entry.promise = (async () => {
      try {
        const response = await fetchAsset(audioFiles[asset], { signal: controller.signal });
        if (!response.ok) throw new Error('Sound asset unavailable');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!disposed) { entry.buffer = buffer; entry.state = 'ready'; }
      } catch { if (!disposed) entry.state = 'failed'; }
      finally { clearTimeout(timeout); if (!disposed) reconcile(); }
    })();
  }
  function loadCurrent() { if (enabled && context && !disposed) for (const asset of requiredAssets()) load(asset); }
  function update(next, { discontinuity = false } = {}) {
    if (disposed) return;
    const previous = latest;
    const jumped = discontinuity || previous.sceneId !== next.sceneId || next.time < previous.time ||
      next.time - previous.time > .1 * Math.max(previous.speed, next.speed) + .025;
    latest = { ...next };
    if (jumped) stopAll();
    loadCurrent();
    if (reconcile()) {
      for (const item of crossedAudioCues(previous, latest, jumped)) play(item.asset, latest.time - item.at, item.gain);
      if (!introPlayed && !jumped && previous.playing && previous.time < .6 && latest.time >= .6 && !previous.hidden) {
        if (assets.get('intro')?.buffer) { play('intro', latest.time - .6, .9); introPlayed = true; }
      }
      publish();
    }
  }
  async function enable() {
    if (disposed || opening) return;
    message = '';
    if (!AudioContextClass) { message = 'SOUND IS UNAVAILABLE IN THIS BROWSER'; publish(); return; }
    enabled = true; opening = true; publish();
    try {
      if (!context) {
        context = new AudioContextClass(); master = context.createGain(); master.gain.value = volume; master.connect(context.destination);
        context.onstatechange = () => { if (!disposed) reconcile(); };
      }
      // Called directly by the sound button, while the browser user gesture is active.
      await context.resume();
      if (disposed || !enabled) return;
      for (const [asset, entry] of assets) if (entry.state === 'failed') assets.delete(asset);
      loadCurrent();
    } catch { enabled = false; message = 'SOUND COULD NOT START · TAP TO RETRY'; }
    finally { opening = false; if (!disposed) reconcile(); }
  }
  function mute() { enabled = false; message = ''; stopAll(); publish(); }
  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (master) master.gain.value = volume;
    if (volumeInput) volumeInput.value = String(Math.round(volume * 100));
    reconcile();
  }
  const toggle = () => { if (enabled && !['blocked', 'unavailable'].includes(snapshot().state)) mute(); else void enable(); };
  const changeVolume = event => setVolume(Number(event.target.value) / 100);
  button?.addEventListener('click', toggle); volumeInput?.addEventListener('input', changeVolume);
  publish();
  return { update, enable, mute, setVolume, get state() { return snapshot(); }, dispose() {
    if (disposed) return;
    disposed = true; enabled = false; stopAll();
    for (const entry of assets.values()) entry.controller.abort();
    assets.clear(); button?.removeEventListener('click', toggle); volumeInput?.removeEventListener('input', changeVolume);
    if (context) { context.onstatechange = null; void context.close().catch(() => {}); }
    publish();
  } };
}
