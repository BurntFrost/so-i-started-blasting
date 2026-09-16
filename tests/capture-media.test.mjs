import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { loadCaptureSet, parseArgs, QUALITY, SCENES, validateSceneSets } from '../tools/capture-media.mjs';

test('capture catalogue contains all fifteen unique scene ids and browser tier profiles', () => {
  assert.equal(SCENES.length, 15);
  assert.equal(new Set(SCENES.map(scene => scene.id)).size, 15);
  assert.deepEqual(Object.keys(QUALITY), ['balanced', 'high', 'ultra']);
  assert.equal(QUALITY.high.deviceScaleFactor, 1);
  assert.equal(QUALITY.ultra.deviceScaleFactor, 2);
  assert.ok(QUALITY.balanced.viewport.width < 600);
});

test('arguments validate scenes, tiers, and probe timing', () => {
  const capture = parseArgs(['capture', '--quality', 'ultra', '--scene', 'twister,knowing', '--output', 'out']);
  assert.deepEqual(capture.scenes, ['twister', 'knowing']);
  assert.equal(parseArgs(['probe', '--quality', 'high', '--scene', 'twister', '--second', '17']).second, 17);
  assert.throws(() => parseArgs(['capture', '--quality', 'lite']), /--quality/);
  assert.throws(() => parseArgs(['capture', '--quality', 'high', '--scene', 'missing']), /Unknown scene/);
  assert.throws(() => parseArgs(['probe', '--quality', 'balanced', '--scene', 'twister', '--second', '17']), /high or ultra/);
  assert.throws(() => parseArgs(['probe', '--quality', 'high', '--scene', 'twister', '--second', '24']), /between 0 and 23/);
});

test('capture-set loader fails missing manifests and missing images', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'capture-media-'));
  await assert.rejects(loadCaptureSet(directory), /Missing capture/);
  await writeFile(join(directory, 'capture.json'), JSON.stringify({ frames: [{ scene: 'twister', file: 'twister.png' }] }));
  await assert.rejects(loadCaptureSet(directory), /Missing capture image/);
  await writeFile(join(directory, 'twister.png'), 'fixture');
  assert.deepEqual([...await loadCaptureSet(directory).then(frames => frames.keys())], ['twister']);
});

test('comparison requires matching scene sets', () => {
  const before = new Map([['twister', 'before.png']]);
  assert.deepEqual(validateSceneSets(before, new Map([['twister', 'after.png']])), ['twister']);
  assert.throws(() => validateSceneSets(before, new Map([['knowing', 'after.png']])), /scene sets differ/);
});
