import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createTerrestrial} from '../dist/terrestrial.js';
function fixture(quality='high') {const scene=new THREE.Scene(),canvas={dataset:{quality,pixelRatio:'1'}},camera=new THREE.PerspectiveCamera();const manager=createTerrestrial({scene,canvas,camera});const at=t=>manager.update(t,{id:'war-of-the-worlds',world:'city'});at(0);return {scene,canvas,manager,at,named:name=>scene.getObjectByName(name)};}
function snapshot(root) {root.updateMatrixWorld(true);const values=[];root.traverse(o=>values.push({name:o.name,visible:o.visible,matrix:o.matrix.toArray(),count:o.count,instances:o.instanceMatrix?Array.from(o.instanceMatrix.array):null,opacity:o.material?.opacity,color:o.material?.color?.toArray(),intensity:o.intensity}));return values;}
test('heat rays attack in distinct bursts and leave persistent scars',()=>{
 const f=fixture(),first=f.named('Tripod heat ray 1'),second=f.named('Tripod heat ray 2'),scar=f.named('Heat-ray scar 1');
 f.at(19.5);assert.ok(first.material.opacity<.1);assert.equal(scar.material.opacity,0);
 f.at(21);assert.ok(first.material.opacity>.6);assert.equal(second.visible,false);assert.ok(first.material.color.r>first.material.color.b);
 f.at(24);assert.equal(first.visible,false);assert.ok(second.material.opacity>.6);assert.ok(scar.material.opacity>.7);
 f.at(30);assert.equal(first.visible,false);assert.equal(second.visible,false);assert.ok(scar.material.opacity>.7);assert.equal(scar.material.emissiveIntensity,0);
});
test('lower tiers retain the lead and secondary attack with a clear size hierarchy',()=>{
 const f=fixture('lite');f.at(24);const lead=f.named('Articulated tripod 1'),second=f.named('Articulated tripod 2'),third=f.named('Articulated tripod 3');assert.ok(lead.visible&&second.visible);assert.equal(third.visible,false);assert.ok(lead.scale.x>second.scale.x*1.4);assert.equal(f.named('Heat-ray scar 3').visible,false);
 f.canvas.dataset.quality='high';f.at(24);assert.equal(third.visible,true);
});
test('tripod pose, rays and consequences restore after reverse seeking and scene switching',()=>{
 const f=fixture(),root=f.named('War of the Worlds — tripod invasion');f.at(21);const before=snapshot(root);f.at(27);assert.notDeepEqual(snapshot(root),before);f.at(21);assert.deepEqual(snapshot(root),before);f.manager.update(0,{id:'independence-day',world:'city'});assert.equal(root.visible,false);f.at(21);assert.deepEqual(snapshot(root),before);
});
