import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createTerrestrial } from '../dist/terrestrial.js';
import { sceneConfigs } from '../dist/scene-config.js';

async function withScene(quality, assetReady, check) {
  const load = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = async () => {
    if (!assetReady) throw new Error('Intentional unavailable optional atlas');
    return new THREE.Texture();
  };
  try {
    const scene = new THREE.Scene(), canvas = new EventTarget();
    canvas.dataset = { quality, pixelRatio: '1' };
    const camera = new THREE.PerspectiveCamera();
    const renderer = createTerrestrial({ scene, canvas, camera });
    const at = time => renderer.update(time, { id: 'terminator-2', ...sceneConfigs['terminator-2'] });
    at(0); await new Promise(setImmediate);
    await check({ at, canvas, root: scene.getObjectByName('Terminator 2 — nuclear firestorm'), named: name => scene.getObjectByName(name) });
  } finally { THREE.TextureLoader.prototype.loadAsync = load; }
}

function snapshot(root) {
  root.updateMatrixWorld(true);
  const state = [];
  root.traverse(object => state.push({ name: object.name, visible: object.visible, matrix: object.matrix.toArray(),
    count: object.count, instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array) : null,
    colors: object.instanceColor ? Array.from(object.instanceColor.array) : null,
    opacity: object.material?.opacity, emissive: object.material?.emissiveIntensity,
    frame: object.userData.bakeFrame, atlasOffset: object.material?.map?.offset.toArray() }));
  return state;
}

test('T2 keeps a substantial cooled mushroom cloud across tiers, with and without the optional bake', async () => {
  for (const quality of ['lite', 'balanced', 'high']) for (const assetReady of [false, true]) {
    await withScene(quality, assetReady, ({ at, canvas, named }) => {
      assert.equal(canvas.dataset.explosionBake, assetReady ? 'ready' : 'fallback');
      for (const time of [18, 27, 30]) {
        at(time);
        const crown = named('Continuous mushroom crown'), stem = named('Continuous mushroom stem');
        assert.equal(crown.visible, true); assert.equal(stem.visible, true);
        assert.ok(crown.position.y > 75, 'cloud rises above the city skyline');
        assert.ok(crown.scale.x > 30, 'the mushroom retains a broad crown');
        assert.ok(stem.scale.y > 30, 'the connected stem reaches the crown');
        assert.equal(named('Rolling mushroom cloud lobes').visible, true, 'bake handoff must not hide all 3D smoke');
        assert.ok(named('Rolling mushroom cloud lobes').material.opacity > (assetReady ? .1 : .7));
        assert.equal(named('Nuclear fireball').visible, false, 'cooled aftermath is not sustained glare');
      }
    });
  }
});

test('T2 releases its bright flash quickly and continues cloud motion during the aftermath', async () => {
  await withScene('high', true, ({ at, named }) => {
    at(4.4);
    const core = named('Nuclear fireball');
    assert.equal(core.visible, true); assert.ok(core.material.opacity > .6);
    at(7);
    assert.equal(core.visible, false, 'the spherical flash ends before the atlas cloud rises');
    assert.equal(core.material.opacity, 0, 'no residual flat disc remains behind the rising smoke');
    at(24); const before = named('Continuous mushroom crown').position.clone();
    at(30); const after = named('Continuous mushroom crown').position;
    assert.ok(after.y > before.y + 2); assert.ok(after.x > before.x + 2);
  });
});

test('T2 reverse seeking restores cloud transforms, baked time and material state exactly', async () => {
  await withScene('balanced', true, ({ at, root }) => {
    at(12); const first = snapshot(root);
    at(27); assert.notDeepEqual(snapshot(root), first);
    at(12); assert.deepEqual(snapshot(root), first);
    at(0);
    for (const name of ['Continuous mushroom crown', 'Continuous mushroom stem', 'Rolling mushroom cloud lobes', 'Nuclear fireball']) {
      assert.equal(root.getObjectByName(name).visible, false, `${name} resets before detonation`);
    }
  });
});
