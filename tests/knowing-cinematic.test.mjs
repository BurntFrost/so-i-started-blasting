import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createCosmic} from '../dist/cosmic.js';
function fixture(quality='high') {const scene=new THREE.Scene(),canvas={dataset:{quality,pixelRatio:'1'}},camera=new THREE.PerspectiveCamera();const manager=createCosmic({scene,canvas,camera,assetSignal:AbortSignal.abort()});const at=t=>{manager.update(t,{id:'knowing',world:'space'});manager.updateView();};at(0);return {scene,canvas,manager,at,named:name=>scene.getObjectByName(name)};}
function snapshot(root) {root.updateMatrixWorld(true);const values=[];root.traverse(o=>values.push({name:o.name,visible:o.visible,matrix:o.matrix.toArray(),opacity:o.material?.opacity,uniforms:o.material?.uniforms?Object.fromEntries(Object.entries(o.material.uniforms).filter(([,u])=>typeof u.value==='number').map(([k,u])=>[k,u.value])):null}));return values;}
test('directed solar front accelerates and reaches Earth on the engulf cue',()=>{
 const f=fixture(),front=f.named('Ejection volume');const radii=[];for(const t of [7,15,23]){f.at(t);radii.push(front.material.uniforms.radius.value);}assert.ok(radii[2]-radii[1]>radii[1]-radii[0]);
 const sun=new THREE.Vector3(-35,54,-8),earth=new THREE.Vector3(58,23,18),axis=earth.clone().sub(sun).normalize();const tip=front.position.clone().addScaledVector(axis,radii[2]);assert.ok(tip.distanceTo(earth)<6,'front meets Earth around the original 23s cue');
});
test('lower tiers retain a narrow ejection and the engulfment clears for the aftermath',()=>{
 const f=fixture('balanced'),bubble=f.named('Coronal mass ejection'),engulf=f.named('Engulfed Earth');f.at(18);assert.ok(bubble.visible);assert.ok(bubble.scale.z>bubble.scale.x*2.5);
 f.at(25);const peak=engulf.material.uniforms.fade.value;f.at(30);assert.ok(engulf.material.uniforms.fade.value<peak*.3);
 f.canvas.dataset.quality='high';f.at(25);const volume=f.named('Engulf volume'),bright=volume.material.uniforms.swallow.value;f.at(30);assert.ok(volume.material.uniforms.swallow.value<bright*.3);
});
test('solar state returns exactly after scrubbing and scene switching',()=>{
 const f=fixture(),root=f.named('knowing-solar-flare');f.at(18);const before=snapshot(root);f.at(27);assert.notDeepEqual(snapshot(root),before);f.at(18);assert.deepEqual(snapshot(root),before);f.manager.update(0,{id:'independence-day',world:'city'});assert.equal(root.visible,false);f.at(18);assert.deepEqual(snapshot(root),before);
});

test('authored prominence deforms three anchored strands and swaps in on paused timeline time', async t => {
  const { readFile } = await import('node:fs/promises');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const bytes = await readFile(new URL('../dist/assets/knowing-prominence.glb', import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const authored = asset.scene.getObjectByName('Prominence');
  assert.deepEqual(authored.userData.motionTimes, [0, 3, 5, 8, 12, 16, 22, 30]);
  const positions = authored.geometry.attributes.position, target = authored.geometry.morphAttributes.position[3];
  let minLift = Infinity, maxLift = -Infinity;
  for (let i = 0; i < positions.count; i++) { minLift = Math.min(minLift, target.getY(i)); maxLift = Math.max(maxLift, target.getY(i)); }
  assert.ok(maxLift - minLift > 8, 'the baked strand changes shape instead of translating as a rigid arch');
  assert.ok((authored.geometry.index?.count || positions.count) / 3 < 5000);
  const { sampleBakedWeights } = await import('../dist/baked-motion.js');
  const geometry = authored.geometry, weightsAt = Array(7).fill(0), roots = [];
  for (let i = 0; i < positions.count; i++) {
    const fixed = geometry.morphAttributes.position.slice(0, 3).every(pose => [0, 1, 2].every(axis => Math.abs(pose.array[i * 3 + axis]) < 1e-6));
    if (fixed && positions.getY(i) < 1.5) roots.push(i);
  }
  assert.ok(roots.length > 50, 'multiple strand roots remain authored on the solar surface');
  for (let time = 0; time <= 30; time += .25) {
    sampleBakedWeights(time, authored.userData.motionTimes, weightsAt);
    for (let i = 0; i < positions.count; i++) {
      const normal = [0, 1, 2].map(axis => geometry.attributes.normal.array[i * 3 + axis] + weightsAt.reduce((sum, weight, pose) => sum + weight * geometry.morphAttributes.normal[pose].array[i * 3 + axis], 0));
      const length = Math.hypot(...normal);
      assert.ok(Number.isFinite(length) && length > .75 && length < 1.2, 'interpolated morph normals remain usable throughout the motion');
    }
    if (time <= 8) for (const i of roots) {
      const delta = [0, 1, 2].map(axis => weightsAt.reduce((sum, weight, pose) => sum + weight * geometry.morphAttributes.position[pose].array[i * 3 + axis], 0));
      assert.ok(Math.hypot(...delta) < .6, 'smooth tangent anticipation remains within the embedded root thickness');
      assert.ok(delta[1] <= .001, 'root anticipation bends inward instead of detaching early');
    }
  }
  let resolveAsset;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => new Promise(resolve => { resolveAsset = resolve; }));
  const scene = new THREE.Scene(), canvas = new EventTarget(); canvas.dataset = { quality: 'lite', pixelRatio: '1' };
  const manager = createCosmic({ scene, canvas, camera: new THREE.PerspectiveCamera() });
  const at = time => manager.update(time, { id: 'knowing', world: 'space' });
  at(12); await Promise.resolve();
  const arch = scene.getObjectByName('Eruptive prominence'), previous = arch.geometry;
  assert.equal(canvas.dataset.solarMotion, 'loading');
  const ready = new Promise(resolve => canvas.addEventListener('animation-ready', resolve, { once: true }));
  resolveAsset(asset); await ready; at(12);
  assert.equal(canvas.dataset.solarMotion, 'ready'); assert.notEqual(arch.geometry, previous);
  assert.deepEqual(arch.scale.toArray(), [1, 1, 1]); assert.deepEqual(arch.rotation.toArray().slice(0, 3), [0, 0, 0]);
  const weights = [...arch.morphTargetInfluences], position = arch.parent.position.toArray();
  at(28); at(5); at(12);
  assert.deepEqual(arch.morphTargetInfluences, weights); assert.deepEqual(arch.parent.position.toArray(), position);
});
