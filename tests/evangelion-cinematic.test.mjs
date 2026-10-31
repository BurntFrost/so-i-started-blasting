import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import { sceneConfigs } from '../dist/scene-config.js';

// The worker stages its isolated factory before the parent integrates shared source.
let { createTerrestrial } = await import('../dist/terrestrial.js');
let config = sceneConfigs.evangelion;
if (process.env.STAGED_EVANGELION === '1') {
  const sourceUrl = new URL('../dist/terrestrial.js', import.meta.url);
  let source = await fs.readFile(sourceUrl, 'utf8');
  const factory = await fs.readFile(new URL('../work/scene-authoring/evangelion/factory.js', import.meta.url), 'utf8');
  source = source.slice(0, source.indexOf('  function createInstrumentality() {')) + factory + source.slice(source.indexOf('  function createTsunami() {'));
  source = source.replace(/from '([^']+)'/g, (match, path) => path.startsWith('.') ? `from '${new URL(path, sourceUrl).href}'` : match);
  source = source.replace("from 'three/webgpu'", `from '${import.meta.resolve('three/webgpu')}'`);
  ({ createTerrestrial } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`));
  config = JSON.parse(await fs.readFile(new URL('../work/scene-authoring/evangelion/integration.json', import.meta.url), 'utf8')).sceneConfig;
}

async function withScene(t, quality, ready, check) {
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => {
    if (!ready) throw new Error('Intentional field texture failure');
    return new THREE.Texture();
  });
  const scene = new THREE.Scene(), canvas = new EventTarget();
  canvas.dataset = { quality, pixelRatio: '1' };
  const city = new THREE.Group(), building = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(590, 590), new THREE.MeshStandardMaterial({ color: '#647077' }));
  city.add(building, paving); scene.add(city);
  const manager = createTerrestrial({ scene, canvas, camera: new THREE.PerspectiveCamera(), buildings: [building] });
  const at = time => manager.update(time, { ...config, id: 'evangelion' });
  at(0); await new Promise(setImmediate);
  const root = scene.getObjectByName('The End of Evangelion — Third Impact');
  await check({ at, root, canvas, manager, paving, named: name => root.getObjectByName(name) });
  t.mock.restoreAll();
}

function snapshot(root) {
  root.updateMatrixWorld(true);
  const result = [];
  root.traverse(object => result.push({ name: object.name, visible: object.visible, matrix: object.matrix.toArray(),
    count: object.count, instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null,
    colors: object.instanceColor ? Array.from(object.instanceColor.array.slice(0, object.count * 3)) : null,
    opacity: object.material?.opacity, emissive: object.material?.emissiveIntensity, intensity: object.intensity,
    mapRepeat: object.material?.map?.repeat.toArray(), mapOffset: object.material?.map?.offset.toArray() }));
  return result;
}

test('Evangelion yields the bright crosses to a complete, sculpted giant on every detail tier', async t => {
  for (const quality of ['lite', 'balanced', 'high']) await withScene(t, quality, true, ({ at, named }) => {
    at(6); assert.equal(named('Luminous giant').visible, false);
    assert.equal(named('Mass production unit wings').geometry.type, 'ExtrudeGeometry');
    at(14); const crosses = named('Crosses of light');
    assert.ok(crosses.instanceColor.array[0] > .9, 'the focal cross announces the event');
    const bar = new THREE.Matrix4(); crosses.getMatrixAt(1, bar);
    assert.ok(bar.elements[13] > 110, 'the main crossbar rises above the winged units rather than hiding behind them');
    assert.ok(new THREE.Vector3().setFromMatrixScale(bar).x > 45, 'the main cross has a readable horizontal arm');
    at(18); const field = named('A.T. field');
    assert.equal(field.geometry.type, 'CircleGeometry', 'the field has no large rectangular silhouette');
    assert.ok(field.material.opacity < .11, 'the field remains secondary to the cross');
    at(26); assert.equal(named('Luminous giant').visible, true);
    assert.ok(crosses.instanceColor.array.slice(0, crosses.count * 3).every(value => value === 0), 'the crosses recede before the complete giant rises');
    assert.equal(named('Giant torso').geometry.type, 'LatheGeometry');
    assert.equal(named('Giant torso').material.isMeshStandardMaterial, true, 'the opaque body retains directional shading');
    const left = named('Left embrace').rotation.z, height = named('Luminous giant').position.y;
    at(30); assert.ok(Math.abs(named('Left embrace').rotation.z) > Math.abs(left));
    assert.ok(named('Luminous giant').position.y > height, 'aftermath continues the upward gesture');
    assert.ok(named('Giant torso').material.emissiveIntensity < .4, 'a restrained glow retains material definition');
  });
});

test('Evangelion giant head, halo and hands stay within desktop and phone framing', async t => {
  await withScene(t, 'high', true, ({ at, root, named }) => {
    for (const [fov, aspect] of [[45, 1280 / 600], [66, 390 / 430]]) {
      const camera = new THREE.PerspectiveCamera(fov, aspect, .1, 1600);
      camera.position.fromArray(config.camera); camera.lookAt(new THREE.Vector3(...config.target)); camera.updateMatrixWorld(true);
      for (const time of [26, 28, 30]) {
        at(time); root.updateMatrixWorld(true);
        for (const name of ['Giant head', 'Halo', 'Giant left hand', 'Giant right hand']) {
          const box = new THREE.Box3().setFromObject(named(name));
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            const point = new THREE.Vector3(x, y, z).project(camera);
            assert.ok(Math.abs(point.x) < .95 && Math.abs(point.y) < .95, `${name} remains framed at ${time}s / ${fov} degrees: ${point.toArray()}`);
          }
        }
      }
    }
  });
});

test('Evangelion restores exact geometry and material state after reverse seek and scene switches', async t => {
  for (const quality of ['lite', 'balanced', 'high']) await withScene(t, quality, true, ({ at, root, manager }) => {
    for (const time of [6, 11, 14, 18, 22, 26]) {
      at(time); const before = snapshot(root);
      at(30); at(time); assert.deepEqual(snapshot(root), before);
      manager.update(0, { id: 'independence-day' }); at(time); assert.deepEqual(snapshot(root), before);
      root.traverse(object => {
        if (object.instanceMatrix) assert.ok(object.instanceMatrix.array.every(Number.isFinite));
        if (object.geometry) assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
      });
    }
  });
});

test('Evangelion preserves optional A.T. field failure feedback and a restrained fallback', async t => {
  await withScene(t, 'balanced', false, ({ at, canvas, named }) => {
    assert.equal(canvas.dataset.atFieldTexture, 'fallback');
    at(16);
    const field = named('A.T. field');
    assert.equal(field.visible, true); assert.ok(field.material.opacity > 0 && field.material.opacity < .06);
    at(28); assert.equal(named('Luminous giant').visible, true);
    assert.ok(named('Halo').material.opacity > .3);
  });
});

test('Evangelion ground continues the city without overlapping or mutating shared paving', async t => {
  await withScene(t, 'balanced', true, ({ at, paving, named }) => {
    const continuation = named('Evangelion ground continuation'), geometry = continuation.geometry;
    assert.equal(continuation.material, paving.material);
    const sharedColor = paving.material.color.toArray();
    const p = geometry.attributes.position, index = geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      let x = 0, y = 0;
      for (let k = 0; k < 3; k++) { x += p.getX(index.getX(i + k)) / 3; y += p.getY(index.getX(i + k)) / 3; }
      assert.ok(Math.abs(x) >= 295 || Math.abs(y) >= 295, 'extension triangles stay outside the shared paving');
    }
    at(30); assert.deepEqual(paving.material.color.toArray(), sharedColor);
    assert.equal(named('Sea of LCL').geometry.parameters.width, 2200, 'the aftermath does not reintroduce a smaller rectangular edge');
  });
});
