import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createTerrestrial} from '../dist/terrestrial.js';
function fixture(quality='high') {
  const scene=new THREE.Scene(),canvas={dataset:{quality,pixelRatio:'1'}},camera=new THREE.PerspectiveCamera();
  const manager=createTerrestrial({scene,canvas,camera});
  const at=t=>manager.update(t,{id:'2012',world:'city'});at(0);
  return {scene,canvas,manager,at,named:name=>scene.getObjectByName(name)};
}
function position(mesh,index) {const m=new THREE.Matrix4();mesh.getMatrixAt(index,m);return new THREE.Vector3().setFromMatrixPosition(m);}
function snapshot(root) {root.updateMatrixWorld(true);const values=[];root.traverse(o=>values.push({name:o.name,visible:o.visible,matrix:o.matrix.toArray(),count:o.count,instances:o.instanceMatrix?Array.from(o.instanceMatrix.array):null,positions:o.geometry?.attributes.position?Array.from(o.geometry.attributes.position.array):null}));return values;}
test('quake reveals a wider continuous fault while geometry stays finite through all collapse beats',()=>{
  const f=fixture(),chasm=f.named('Jagged continental chasm'),p=chasm.geometry.attributes.position;
  const initial=Math.abs(p.getX(0)-p.getX(1));f.at(30);assert.ok(Math.abs(p.getX(0)-p.getX(1))>initial+10);
  for(const time of [0,3,10,14.5,21,26,30]) {f.at(time);f.scene.traverse(o=>{if(o.geometry?.attributes.position)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),o.name);});}
});
test('freeway buckles before its central slabs fall while the distant decks remain elevated',()=>{
  const f=fixture(),deck=f.named('Broken freeway decks');f.at(0);const initial=position(deck,5).y;
  f.at(17);assert.ok(position(deck,5).y>initial+5);f.at(29);assert.ok(position(deck,5).y<0);assert.ok(position(deck,10).y>3);
});
test('every quality tier retains the continental sides and freeway with reduced secondary debris',()=>{
  for(const [quality,count] of [['lite',45],['balanced',90],['high',150],['ultra',150]]) {const f=fixture(quality);f.at(22);assert.equal(f.named('Airborne earthquake masonry').count,count);assert.ok(f.named('Western continental crust'));assert.ok(f.named('Eastern continental crust'));assert.equal(f.named('Broken freeway decks').count,11);}
});
test('quake geometry restores exactly after reverse seeking and scene switching without reallocation',()=>{
  const f=fixture(),root=f.named('2012 — continental rupture');f.at(18);const before=snapshot(root);f.at(27);assert.notDeepEqual(snapshot(root),before);f.at(18);assert.deepEqual(snapshot(root),before);
  f.manager.update(0,{id:'independence-day',world:'city'});assert.equal(root.visible,false);f.at(18);assert.equal(f.named('2012 — continental rupture'),root);assert.deepEqual(snapshot(root),before);
});
