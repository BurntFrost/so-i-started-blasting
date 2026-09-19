import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LightShaftsPass, emitterEnvelope, projectEmitter, emitterScreenFade } from '../dist/light-shafts.js';
import { heroEmitters, sceneConfigs } from '../dist/scene-config.js';
import { qualityTiers } from '../dist/cinema.js';

test('shafts have their own tier flag and run only at HIGH and ULTRA',()=>{
  assert.deepEqual(qualityTiers.map(tier=>tier.shafts),[false,false,true,true]);
});

test('every emitter is registered and its light and shaft envelope is bounded and reversible',()=>{
  for(const [id,emitter] of Object.entries(heroEmitters)){
    assert.equal(sceneConfigs[id].grade.emitter,emitter);
    assert.ok(emitter.position.length===3 && emitter.position.every(Number.isFinite));
    const [start,attack,release,end]=emitter.window;
    assert.ok(start<attack && attack<=release && release<end);
    assert.equal(emitterEnvelope(start,emitter),0);assert.equal(emitterEnvelope(end,emitter),0);
    assert.equal(emitterEnvelope(attack,emitter),1);assert.equal(emitterEnvelope(release,emitter),1);
    const at=emitterEnvelope((start+attack)/2,emitter);emitterEnvelope(end,emitter);
    assert.equal(emitterEnvelope((start+attack)/2,emitter),at);
  }
  assert.equal(emitterEnvelope(15,null),0);
});
test('projection hides emitters behind the camera or outside the screen and responds to paused orbit',()=>{
  const camera=new THREE.PerspectiveCamera(60,1,.1,100),point=new THREE.Vector3(0,0,-10),result=new THREE.Vector3();
  assert.equal(projectEmitter(point,camera,result),true);assert.equal(result.x,.5);assert.equal(result.y,.5);
  assert.equal(projectEmitter(new THREE.Vector3(0,0,10),camera,result),false);
  assert.equal(projectEmitter(new THREE.Vector3(100,0,-10),camera,result),false);
  camera.rotation.y=Math.PI;assert.equal(projectEmitter(point,camera,result),false);
});
test('shafts resize to quarter resolution, ping-pong without feedback and restore the render target on error',()=>{
  const pass=new LightShaftsPass();pass.setSize(1920,1080);
  assert.equal(pass.targets[0].width,480);assert.equal(pass.targets[1].height,270);
  const previous={},read={texture:{}},write={texture:{}},draws=[];let current=previous;
  const renderer={getRenderTarget:()=>current,setRenderTarget:t=>{current=t;},render:()=>{assert.notEqual(pass.quad.material.uniforms.source.value,current?.texture);draws.push(current);}};
  pass.render(renderer,write,read);assert.equal(current,previous);assert.equal(draws.length,5);assert.equal(draws.at(-1),write);
  renderer.render=()=>{throw new Error('GPU failure');};assert.throws(()=>pass.render(renderer,write,read),/GPU failure/);assert.equal(current,previous);
  pass.dispose();
});
test('orbit fades rays to zero before the projected mask leaves the viewport',()=>{
  assert.equal(emitterScreenFade(new THREE.Vector3(.5,.5,0)),1);
  assert.ok(emitterScreenFade(new THREE.Vector3(1.1,.5,0))<1);
  assert.ok(emitterScreenFade(new THREE.Vector3(1.1,.5,0))>0);
  assert.equal(emitterScreenFade(new THREE.Vector3(1.35,.5,0)),0);
  assert.equal(emitterScreenFade(new THREE.Vector3(-.35,.5,0)),0);
});
