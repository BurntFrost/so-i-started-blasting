import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBakedMotion, sampleBakedWeights } from '../dist/baked-motion.js';
function asset(valid=true) {
  const geometry = new THREE.BoxGeometry(1,1,1), base=geometry.attributes.position;
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=[1,2].map(n=>new THREE.Float32BufferAttribute(Array.from(base.array,v=>v*n),3));
  geometry.morphAttributes.normal=[1,2].map(()=>new THREE.Float32BufferAttribute(new Float32Array(base.array.length),3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='Subject';mesh.userData.motionTimes=valid?[0,10,20]:[0,10,10];
  const scene=new THREE.Group();scene.add(mesh);return {scene,mesh,geometry};
}
function fixture(t,request,options={}) {
  t.mock.method(GLTFLoader.prototype,'loadAsync',request);
  const events=[],canvas={dataset:{},dispatchEvent:e=>events.push(e.type)};
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({transparent:true,opacity:.7}));
  const geometry=mesh.geometry,material=mesh.material;
  const controller=createBakedMotion({url:'/fixture.glb',targets:{Subject:mesh},canvas,statusKey:'testMotion',...options});
  return {controller,mesh,geometry,material,events,canvas};
}
test('baked poses adopt atomically, wake paused playback, and sample absolute time without buffer uploads',async t=>{
  let resolve;const loaded=asset(),f=fixture(t,()=>new Promise(r=>{resolve=r;}));
  const materialVersion=f.material.version;
  assert.equal(f.controller.update(7),false);assert.equal(f.mesh.geometry,f.geometry);
  await new Promise(setImmediate);resolve(loaded);await f.controller.ready;
  assert.equal(f.canvas.dataset.testMotion,'ready');assert.deepEqual(f.events,['animation-ready']);
  assert.equal(f.mesh.material,f.material);assert.equal(f.material.opacity,.7);
  assert.equal(f.material.version,materialVersion+1,'adoption rebuilds an already-compiled fallback shader with morph inputs');
  assert.equal(f.controller.update(15),true);assert.ok(Math.abs(f.mesh.morphTargetInfluences[0]+2*f.mesh.morphTargetInfluences[1]-1.5)<1e-12);
  const positions=f.mesh.geometry.attributes.position,version=positions.version,bytes=positions.array.slice();
  f.controller.update(3);const weights=f.mesh.morphTargetInfluences.slice();f.controller.update(30);f.controller.update(3);
  assert.deepEqual(f.mesh.morphTargetInfluences,weights);assert.equal(positions.version,version);assert.deepEqual(positions.array,bytes);
  f.controller.update(-1);assert.deepEqual(f.mesh.morphTargetInfluences,[0,0]);f.controller.update(30);assert.deepEqual(f.mesh.morphTargetInfluences,[0,1]);
});
test('failed and malformed bakes preserve the live procedural geometry and material',async t=>{
  for(const request of [async()=>{throw new Error('offline');},async()=>asset(false)]){
    const f=fixture(t,request);f.controller.update(5);await f.controller.ready;
    assert.equal(f.canvas.dataset.testMotion,'fallback');assert.equal(f.mesh.geometry,f.geometry);assert.equal(f.mesh.material,f.material);
    assert.equal(f.controller.update(8),false);
  }
});
test('timed-out optional bakes cannot replace the fallback when a late response arrives',async t=>{
  let resolve;const f=fixture(t,()=>new Promise(r=>{resolve=r;}),{timeoutMs:5});f.controller.update(5);
  await f.controller.ready;const late=asset();let disposed=false;late.geometry.addEventListener('dispose',()=>{disposed=true;});
  resolve(late);await new Promise(setImmediate);
  assert.equal(f.canvas.dataset.testMotion,'fallback');assert.equal(f.mesh.geometry,f.geometry);assert.equal(disposed,true);
});
test('aborted loading never wakes or installs geometry into a closed player',async t=>{
  const abort=new AbortController();let resolve;
  const f=fixture(t,()=>new Promise(r=>{resolve=r;}),{signal:abort.signal});f.controller.update(5);await new Promise(setImmediate);abort.abort();await f.controller.ready;
  resolve(asset());await new Promise(setImmediate);
  assert.equal(f.mesh.geometry,f.geometry);assert.deepEqual(f.events,[]);
});

test('baked motion preserves every pose and has continuous velocity across uneven key times',()=>{
  const times=[0,3,8,12,22,30], values=[0,2,4,-1,3,2], weights=new Array(times.length-1).fill(0);
  const at=t=>{sampleBakedWeights(t,times,weights);return weights.reduce((sum,w,i)=>sum+w*values[i+1],0);};
  for(let i=0;i<times.length;i++)assert.equal(at(times[i]),values[i]);
  const h=1e-5;
  for(const t of times.slice(1,-1)){
    const left=(at(t)-at(t-h))/h,right=(at(t+h)-at(t))/h;
    assert.ok(Math.abs(left-right)<1e-4,`velocity at${t}: ${left},${right}`);
  }
});
