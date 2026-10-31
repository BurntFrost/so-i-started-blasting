import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createCosmic } from '../dist/cosmic.js';
import { sceneConfigs } from '../dist/scene-config.js';

function fixture(quality = 'high') {
  const scene = new THREE.Scene(), canvas = { dataset: { quality, pixelRatio: '1' } };
  const cosmic = createCosmic({ scene, canvas, camera: new THREE.PerspectiveCamera() });
  const at = time => cosmic.update(time, { id: 'gravity', ...sceneConfigs.gravity });
  at(0);
  return { scene, canvas, cosmic, at, named: name => scene.getObjectByName(name) };
}

function snapshot(root) {
  root.updateMatrixWorld(true);
  const state = [];
  root.traverse(object => state.push({name:object.name,visible:object.visible,matrix:object.matrix.toArray(),count:object.count,
    instances:object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0,object.count * 16)) : null,
    range:object.geometry?.drawRange,opacity:object.material?.opacity,
    uniforms:Object.fromEntries(Object.entries(object.material?.uniforms || {}).filter(([,uniform]) => typeof uniform.value === 'number').map(([key,uniform]) => [key,uniform.value])),intensity:object.intensity}));
  return structuredClone(state);
}

test('Gravity keeps an articulated station and stages distinct wing, truss and module failures', () => {
  const f = fixture(), wings = Array.from({length:8},(_,i) => f.named(`Solar wing ${i+1}`));
  assert.ok(wings.every(wing => wing.getObjectByName('Photovoltaic cells').count === 24));
  f.at(10); const intact = wings.map(wing => wing.position.clone());
  assert.equal(f.named('Pressure module spine').position.length(),0);
  f.at(11.8);
  assert.ok(wings[0].position.distanceTo(intact[0]) > .3,'first wing releases on the first impact');
  assert.equal(wings[7].position.distanceTo(intact[7]),0,'far wing remains attached until its later impact');
  assert.equal(f.named('Starboard truss').position.x,25,'truss survives the first strike');
  f.at(16);
  assert.ok(f.named('Starboard truss').position.x > 26);
  assert.equal(f.named('Pressure module spine').position.length(),0,'pressure module shear is a distinct later beat');
  f.at(19);
  assert.ok(f.named('Pressure module spine').position.length() > .8);
});

test('Gravity impact glints recede and leave a clearing field with continuing independent drift', () => {
  const f = fixture();
  f.at(11.44);
  assert.equal(f.named('Impact glint').visible,true);
  assert.ok(f.named('Impact glint').scale.x < 2,'the flash does not become a large sustained fireball');
  f.at(11.7);
  assert.equal(f.named('Impact glint').visible,false);
  assert.equal(f.named('Impact splinters').visible,true);
  f.at(24);
  assert.equal(f.named('Kessler debris field').visible,false,'the one-way incoming pass clears in the aftermath');
  assert.equal(f.named('Impact splinters').visible,false);
  const parts = ['Solar wing 1','Starboard truss','Pressure module spine','Untethered astronaut'].map(f.named);
  const before = parts.map(part => part.position.clone());
  f.at(30);
  assert.ok(parts.every((part,i) => part.position.distanceTo(before[i]) > 3),'principal parts continue drifting independently after the hero frame');
  assert.equal(f.named('Orbital dust streaks').material.uniforms.phase.value,0,'dust also settles before the end');
});

test('Gravity retains its station silhouette while thinning secondary debris on lower tiers', () => {
  const f = fixture(), counts = [];
  for (const quality of ['lite','balanced','high']) {
    f.canvas.dataset.quality = quality; f.at(15);
    for (let i=1;i<=8;i++) assert.equal(f.named(`Solar wing ${i}`).visible,true);
    counts.push([f.named('Kessler debris field').count,f.named('Impact splinters').count,f.named('Orbital dust streaks').geometry.drawRange.count]);
    let triangles=0;
    f.named('gravity-debris-cascade').traverseVisible(object => {
      if (object.isMesh) triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    });
    assert.ok(triangles < 150000,`${quality}: ${triangles} triangles`);
  }
  for (let column=0;column<3;column++) assert.ok(counts[0][column]<counts[1][column] && counts[1][column]<counts[2][column]);
});


test('the aftermath astronaut stays framed and separates from the module in desktop and phone projection', () => {
  const f = fixture();
  for (const [width,height,fov] of [[1280,580,45],[390,380,66]]) {
    const camera = new THREE.PerspectiveCamera(fov,width/height,.1,1600);
    camera.position.set(82,88,144); camera.lookAt(-12,40,0); camera.updateMatrixWorld(true);
    for (const time of [25,30]) {
      f.at(time); f.scene.updateMatrixWorld(true);
      const astronaut = f.named('Untethered astronaut'), hub = f.named('Pressure module spine');
      const point = astronaut.getWorldPosition(new THREE.Vector3()).project(camera);
      const hubPoint = hub.getWorldPosition(new THREE.Vector3()).project(camera);
      assert.ok(point.x < hubPoint.x - .18,'astronaut separates to the left of the module silhouette');
      const bounds = new THREE.Box3().setFromObject(astronaut), corners=[];
      for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) corners.push(new THREE.Vector3(x,y,z).project(camera));
      assert.ok(corners.every(p => Math.abs(p.x)<.9 && Math.abs(p.y)<.9),'the complete astronaut remains inside the canvas');
      const heightPixels=(Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y)))*height/2;
      assert.ok(heightPixels>12,'the projected astronaut is large enough for visible body structure');
    }
  }
});

test('Gravity restores exact poses, glints, dust and counts after reverse seeks, tier changes and scene switches', () => {
  const f = fixture(), root = f.named('gravity-debris-cascade');
  for (const quality of ['lite','balanced','high']) for (const time of [0,6,11.44,15,18,24,30]) {
    f.canvas.dataset.quality = quality; f.at(time); const before = snapshot(root);
    f.canvas.dataset.quality='high'; f.at(29);
    f.cosmic.update(18,{id:'interstellar',...sceneConfigs.interstellar});
    assert.equal(root.visible,false);
    f.canvas.dataset.quality=quality; f.at(time);
    assert.deepEqual(snapshot(root),before,`restore ${quality} at ${time}`);
  }
});
