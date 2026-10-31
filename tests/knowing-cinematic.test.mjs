import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createCosmic} from '../dist/cosmic.js';
function fixture(quality='high') {const scene=new THREE.Scene(),canvas={dataset:{quality,pixelRatio:'1'}},camera=new THREE.PerspectiveCamera();const manager=createCosmic({scene,canvas,camera});const at=t=>{manager.update(t,{id:'knowing',world:'space'});manager.updateView();};at(0);return {scene,canvas,manager,at,named:name=>scene.getObjectByName(name)};}
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
