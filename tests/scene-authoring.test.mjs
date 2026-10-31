import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three/webgpu';
import { createDraft, initBrief, validateBrief } from '../.agents/skills/blasting-scene-director/scripts/scene-brief.mjs';
import { createScene } from '../.agents/skills/blasting-scene-build/assets/scene-factory.js';

const example = JSON.parse(await readFile(new URL('../.agents/skills/blasting-scene-director/examples/independence-day-refine.json', import.meta.url), 'utf8'));

test('example brief matches the current catalogue and draft needs creative input', () => {
  assert.deepEqual(validateBrief(example), []);
  const draft = createDraft('interstellar', 'Interstellar');
  assert.equal(draft.operation, 'refine');
  assert.equal(draft.world, 'space');
  assert.equal(draft.renderer, 'cosmic');
  assert.ok(validateBrief(draft).some(error => error.includes('intent')));
  assert.equal(createDraft('new-movie-moment', 'A movie').operation, 'create');
  for (const id of ['../escape', '/absolute', '', 'two--hyphens', 42, undefined]) assert.throws(() => createDraft(id, 'A movie'));
});

test('invalid integration and creative handoffs fail with actionable errors', () => {
  const cases = [
    [brief => { brief.operation = 'create'; }, /unused scene ID/],
    [brief => { brief.id = 'unknown'; }, /existing scene ID/],
    [brief => { brief.world = 'space'; }, /renderer must match/],
    [brief => { brief.duration = 60; }, /30 seconds/],
    [brief => { brief.beats[1].start = 10; }, /gaps or overlaps/],
    [brief => { brief.beats[2].end = 29; }, /end at 30/],
    [brief => { brief.camera.position = brief.camera.target; }, /distinct finite/],
    [brief => { brief.audio.cues[0].at = 30; }, /strictly inside/],
    [brief => { brief.captureSeconds = [3, 4, 5]; }, /each beat/],
    [brief => { brief.captureSeconds = [3, 27, 16]; }, /sorted/],
    [brief => { brief.assets = [{path: '/assets/../secret.mp3', provenance: 'Original', fallback: 'Silence'}]; }, /literal local/],
    [brief => { brief.film.sources[0].url = 'javascript:alert(1)'; }, /URL\/observation/],
  ];
  for (const [mutate, expected] of cases) {
    const brief = structuredClone(example);
    mutate(brief);
    assert.match(validateBrief(brief).join('\n'), expected);
  }
  for (const malformed of [null, [], 'scene', {beats: [null], film: {sources: [null]}, audio: {cues: [null]}, assets: [null]}]) {
    assert.ok(validateBrief(malformed).length > 0);
  }
});

test('scaffolding creates local working files and refuses to replace existing work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blasting-authoring-'));
  try {
    const directory = await initBrief('new-moment', 'A movie', root);
    assert.equal(JSON.parse(await readFile(join(directory, 'brief.json'), 'utf8')).id, 'new-moment');
    assert.match(await readFile(join(directory, 'scene.mjs'), 'utf8'), /export function createScene/);
    await writeFile(join(directory, 'brief.json'), 'user creative work');
    await assert.rejects(initBrief('new-moment', 'A movie', root), { code: 'EEXIST' });
    assert.equal(await readFile(join(directory, 'brief.json'), 'utf8'), 'user creative work');
  } finally { await rm(root, { recursive: true, force: true }); }
});

function state(factory) {
  factory.group.updateMatrixWorld(true);
  return factory.group.children.map(object => ({
    matrix: object.matrix.toArray(), visible: object.visible,
    count: object.count, instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null,
  }));
}

test('starter factory reverses exactly at every tier and survives detail changes', () => {
  const scene = new THREE.Scene();
  const factory = createScene({ scene });
  assert.equal(scene.children.length, 1);
  assert.deepEqual(factory.particles, []);
  for (const [detail, count] of [[0, 8], [1, 16], [2, 24], ['lite', 8], ['balanced', 16], ['high', 24], ['ultra', 24]]) {
    factory.update(16, detail);
    const before = state(factory);
    assert.equal(before[1].count, count);
    factory.update(27, 2);
    assert.notDeepEqual(state(factory), before);
    factory.update(0, 0);
    assert.equal(factory.group.children[1].visible, false);
    factory.update(16, detail);
    assert.deepEqual(state(factory), before);
  }
  const other = createScene({ scene: new THREE.Scene() });
  factory.update(16, 2); other.update(16, 2);
  assert.deepEqual(state(factory), state(other), 'construction order does not change seeded variation');
});
