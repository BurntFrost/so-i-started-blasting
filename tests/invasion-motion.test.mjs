import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createInvasionMotion, invasionState, invasionCollapse } from '../dist/invasion-motion.js';
function fixture(){
 const scene=new THREE.Scene(),ship=new THREE.Group();scene.add(ship);
 const core=new THREE.Mesh(new THREE.SphereGeometry(),new THREE.MeshBasicMaterial());ship.add(core);
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(),new THREE.MeshBasicMaterial());scene.add(beam);
 const shockwave=new THREE.Mesh(new THREE.TorusGeometry(),new THREE.MeshBasicMaterial());scene.add(shockwave);
 return {scene,ship,core,beam,shockwave,motion:createInvasionMotion({scene,ship,core,beam,shockwave})};
}
const snapshot=f=>{const state=[];f.scene.traverse(o=>state.push([o.name,o.visible,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),...(o.instanceMatrix?.array||[])]));return state;};
test('the invasion approaches, holds its charge, reaches the ground on the impact cue and recovers from recoil',()=>{
 assert.ok(invasionState(0).y>invasionState(8).y);
 assert.equal(invasionState(8).y,invasionState(11).y);
 assert.equal(invasionState(9).beamLength,0);assert.equal(invasionState(13).beamLength,1);
 assert.ok(invasionState(13.35).y>invasionState(16).y+1);
 assert.equal(invasionState(22).beamPower,0);
 const f=fixture();f.motion.update(13,true);
 assert.ok(Math.abs(f.beam.position.y-f.beam.scale.y*85/2-.3)<1e-6);
 f.motion.update(13,true,'balanced',true);
 assert.equal(f.motion.assembly.position.y,f.ship.position.y);
 assert.equal(f.ship.position.y,invasionState(13).y-12);
 assert.ok(Math.abs(f.beam.position.y+f.beam.scale.y*85/2-(f.ship.position.y-6))<1e-6);
 assert.ok(Math.abs(f.beam.position.y-f.beam.scale.y*85/2-.3)<1e-6);
});
test('building collapse follows the advancing pressure front instead of simultaneous global shrink',()=>{
 assert.ok(invasionCollapse(17,-8,-20)>.8);assert.equal(invasionCollapse(17,110,80),0);
 assert.ok(invasionCollapse(29,110,80)>.9);
 for(let t=0;t<=30;t+=.1)assert.ok(Number.isFinite(invasionCollapse(t,20,-30)));
});
test('mechanical petals, beam packets and dust restore exact state across reverse seeks and scene switches',()=>{
 const f=fixture();
 for(const quality of ['lite','balanced','high'])for(const t of [0,6,10,12.5,13.35,18,24,30]){
  f.motion.update(t,true,quality);const expected=snapshot(f);f.motion.update(29,true,quality);f.motion.update(0,false,quality);f.motion.update(t,true,quality);
  assert.deepEqual(snapshot(f),expected);
 }
});
test('pressure dust density scales down without removing the ship aperture or beam event',()=>{
 const f=fixture();f.motion.update(16,true,'lite');assert.equal(f.motion.dust.count,18);assert.equal(f.motion.assembly.visible,true);assert.equal(f.beam.visible,true);
 f.motion.update(16,true,'balanced');assert.equal(f.motion.dust.count,30);
 f.motion.update(16,true,'high');assert.equal(f.motion.dust.count,48);
 f.motion.update(16,false);assert.equal(f.motion.assembly.visible,false);assert.equal(f.motion.packets.visible,false);assert.equal(f.motion.dust.visible,false);
});
