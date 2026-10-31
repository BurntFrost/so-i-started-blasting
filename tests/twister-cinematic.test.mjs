import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three/webgpu';

let createTerrestrial;
if (process.env.TWISTER_CANDIDATE) {
  const moduleURL = new URL('../dist/terrestrial.js', import.meta.url);
  let source = await readFile(moduleURL, 'utf8');
  const candidate = await readFile(process.env.TWISTER_CANDIDATE, 'utf8');
  const start = source.indexOf('  function createTornado() {'), end = source.indexOf('  function createEruption()', start);
  source = source.slice(0, start) + candidate + source.slice(end);
  source = source.replace(/from '([^']+)'/g, (_, name) => `from '${name.startsWith('.') ? new URL(name, moduleURL).href : import.meta.resolve(name)}'`);
  ({ createTerrestrial } = await import(`data:text/javascript,${encodeURIComponent(source)}`));
} else ({ createTerrestrial } = await import('../dist/terrestrial.js'));

function fixture(quality = 'high') {
  const scene = new THREE.Scene(), landscape = new THREE.Group();
  landscape.add(new THREE.Mesh());
  for (let i = 0; i < 4; i++) {
    const tree = new THREE.Group(); tree.position.set(-70 + i * 30, 0, -70);
    tree.rotation.set(.02 * i, .15 * i, -.03 * i); landscape.add(tree);
  }
  const canvas = { dataset: { quality, pixelRatio:'1' }, dispatchEvent() {} };
  const camera = new THREE.PerspectiveCamera(); camera.position.set(112,75,194); camera.lookAt(-18,48,-45);
  const manager = createTerrestrial({ scene, landscape, canvas, camera });
  const initialTrees = landscape.children.slice(1).map(tree => tree.rotation.toArray());
  const at = t => manager.update(t, { id:'twister', world:'landscape' });
  at(0);
  return { scene, landscape, manager, canvas, camera, initialTrees, at, root:scene.getObjectByName('Twister — F5 outbreak'), named:name => scene.getObjectByName(name) };
}
function instances(mesh) {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  return Array.from({length:mesh.count}, (_, i) => {
    mesh.getMatrixAt(i,matrix); position.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
    return { position:position.clone(), scale:scale.clone() };
  });
}
function state(f) {
  f.scene.updateMatrixWorld(true);
  const items = [];
  f.scene.traverse(o => items.push({ name:o.name, visible:o.visible, matrix:o.matrix.toArray(), count:o.count,
    instances:o.instanceMatrix ? Array.from(o.instanceMatrix.array.slice(0,o.count*16)) : null,
    position:o.name === 'Continuous condensation funnel' ? Array.from(o.geometry.attributes.position.array) : null,
    color:o.name === 'Continuous condensation funnel' ? Array.from(o.geometry.attributes.color.array) : null,
    opacity:o.material?.opacity, intensity:o.intensity, mapOffset:o.material?.map?.offset.toArray(),
    uniforms:o.material?.uniforms ? Object.fromEntries(Object.entries(o.material.uniforms).filter(([,u]) => typeof u.value === 'number').map(([k,u]) => [k,u.value])) : null }));
  return {items,trees:f.landscape.children.slice(1).map(tree=>tree.rotation.toArray())};
}

test('Twister lowers one continuous funnel and retains opaque depth at all tiers', () => {
  for (const quality of ['lite','balanced','high']) {
    const f=fixture(quality), funnel=f.named('Continuous condensation funnel');
    assert.ok(funnel, 'unified funnel exists at every quality');
    assert.equal(funnel.material.transparent,false);
    assert.equal(funnel.material.alphaHash,true);
    assert.equal(funnel.userData.opaqueDepth,true);
    assert.equal(funnel.material.alphaMap.image.data[1],255,'lower body stays fully opaque');
    assert.equal(funnel.material.alphaMap.image.data[127*4+1],0,'upper rim dissolves fully into the canopy');
    assert.equal(funnel.layers.isEnabled(1),false,'storm body occludes distant depth instead of receiving a horizon stripe');
    f.at(6); funnel.geometry.computeBoundingBox();
    const early=funnel.geometry.boundingBox.min.y+funnel.position.y;
    f.at(13); funnel.geometry.computeBoundingBox();
    const landed=funnel.geometry.boundingBox.min.y+funnel.position.y;
    assert.ok(early-landed>65,'tip descends to the farm at the touchdown cue');
    const original=Array.from(funnel.geometry.attributes.position.array);
    const crownOffset=funnel.material.alphaMap.offset.toArray();
    f.at(14); assert.notDeepEqual(Array.from(funnel.geometry.attributes.position.array),original,'contours visibly turn after touchdown');
    assert.deepEqual(funnel.material.alphaMap.offset.toArray(),crownOffset,'the top dissolve stays fixed while vapor scrolls');
    assert.equal(f.named('Ground debris cloud').visible,true);
  }
});

test('debris releases in stages and the airborne roofs settle through the aftermath', () => {
  const f=fixture(), planks=f.named('Airborne farm debris'), house=f.named('Farmhouse flying roof'), barn=f.named('Barn flying roof');
  f.at(12); assert.ok(instances(planks).every(o=>o.scale.length()<1e-8));
  f.at(14); const first=instances(planks).filter(o=>o.scale.length()>.1).length;
  f.at(18); const second=instances(planks).filter(o=>o.scale.length()>.1).length;
  assert.ok(first>0 && second>first*2,'pickup cascades across several seconds');
  const highHouse=house.position.y, highBarn=barn.position.y;
  f.at(30); assert.ok(house.position.y<highHouse*.3 && barn.position.y<highBarn*.3,'the roofs descend rather than hovering in permanent circles');
  const late=instances(planks).map(o=>o.position); f.at(29); const before=instances(planks).map(o=>o.position);
  assert.ok(late.reduce((sum,p,i)=>sum+p.distanceTo(before[i]),0)/late.length>5,'loose debris continues moving through the final second');
});

test('Twister reverse seeks restore geometry, tones, debris, lights and tree state exactly', () => {
  for (const quality of ['lite','balanced','high']) {
    const f=fixture(quality);
    for (const time of [0,11.2,13,16.6,18,24,30]) {
      f.at(time); const expected=state(f); f.at(time<20?29:4); f.at(time); assert.deepEqual(state(f),expected);
      f.root.traverse(o=>{
        if(o.instanceMatrix) assert.ok(o.instanceMatrix.array.every(Number.isFinite));
        if(o.geometry?.attributes.position) assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));
      });
    }
  }
});

test('leaving Twister restores authored tree rotations and darkens its always-visible lightning light', () => {
  const f=fixture(); f.at(16.6);
  assert.notDeepEqual(f.landscape.children.slice(1).map(t=>t.rotation.toArray()),f.initialTrees);
  const flash=f.scene.children.find(o=>o.isPointLight); assert.ok(flash);
  assert.equal(flash.parent,f.scene);
  f.manager.update(0,{id:'independence-day',world:'city'});
  assert.deepEqual(f.landscape.children.slice(1).map(t=>t.rotation.toArray()),f.initialTrees);
  assert.equal(flash.intensity,0);
  f.at(0); assert.deepEqual(f.landscape.children.slice(1).map(t=>t.rotation.toArray()),f.initialTrees);
});

test('Twister scene geometry leaves room under the phone triangle budget', t => {
  for (const quality of ['lite','balanced']) {
    const f=fixture(quality); f.at(18); let triangles=0;
    f.root.traverseVisible(o=>{if(o.isMesh) triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
    t.diagnostic(`${quality}: ${triangles} scene triangles`);
    assert.ok(triangles<60000,`${quality} scene uses ${triangles} triangles; shared landscape has a separate allowance`);
  }
});


test('Twister keeps its full procedural silhouette when the optional vapor atlas fails', async t => {
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => { throw new Error('atlas unavailable'); });
  const f=fixture(); await new Promise(resolve=>setImmediate(resolve)); f.at(18);
  assert.equal(f.canvas.dataset.twisterBake,'fallback');
  assert.ok(f.named('Rotating wall cloud').material.opacity>.7);
  assert.equal(f.named('Continuous condensation funnel').visible,true);
  const first=state(f); f.at(30); f.at(18); assert.deepEqual(state(f),first);
});

test('Twister vapor frames reverse exactly and face a paused orbit after atlas readiness', async t => {
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => new THREE.Texture({width:2048,height:1024}));
  const f=fixture(); await new Promise(resolve=>setImmediate(resolve)); f.at(18);
  assert.equal(f.canvas.dataset.twisterBake,'ready');
  assert.ok(f.named('Rotating wall cloud').material.opacity<.03);
  const first=state(f); f.at(30); f.at(18); assert.deepEqual(state(f),first);
  const mist=f.named('Soft rotating funnel filaments'), old=Array.from(mist.instanceMatrix.array), frame=mist.material.map.offset.toArray();
  f.camera.position.set(-150,85,140); f.camera.lookAt(-18,48,-45); f.manager.updateView();
  assert.notDeepEqual(Array.from(mist.instanceMatrix.array),old,'billboards turn with the camera while the timeline is paused');
  assert.deepEqual(mist.material.map.offset.toArray(),frame,'orbit does not advance the vapor animation');
  assert.ok(mist.instanceMatrix.array.every(Number.isFinite));
});
