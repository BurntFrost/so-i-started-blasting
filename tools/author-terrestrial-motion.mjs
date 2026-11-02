import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FAULT_TIMES, FUNNEL_TIMES, createFaultCrustGeometry, poseFaultCrust, poseFaultFloor, createFunnelGeometry, poseFunnel } from '../dist/terrestrial-motion.js';

// Original procedural authoring. Reproduce with Node 24; no remote assets or simulation history.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
function track(name, geometry, times, pose) {
  pose(geometry, times[0]);
  const base = geometry.clone(); base.morphAttributes.position = []; base.morphAttributes.normal = []; base.morphTargetsRelative = true;
  for (const time of times.slice(1)) {
    pose(geometry, time);
    for (const attribute of ['position', 'normal']) {
      const origin = base.attributes[attribute].array, frame = geometry.attributes[attribute].array;
      base.morphAttributes[attribute].push(new THREE.Float32BufferAttribute(Float32Array.from(frame, (value, i) => value - origin[i]), 3));
    }
  }
  base.userData = {};
  const mesh = new THREE.Mesh(base, new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  mesh.name = name; mesh.userData.motionTimes = times; geometry.dispose(); return mesh;
}
async function write(name, tracks) {
  const scene = new THREE.Scene(); scene.add(...tracks);
  const binary = await new GLTFExporter().parseAsync(scene, { binary: true });
  const url = new URL(`../dist/assets/${name}`, import.meta.url);
  await fs.writeFile(url, new Uint8Array(binary));
  console.log(`${name}: ${binary.byteLength} bytes`);
}
await write('continental-motion.glb', [
  track('WestCrust', createFaultCrustGeometry(-1), FAULT_TIMES, (geometry, t) => poseFaultCrust(geometry, -1, t)),
  track('EastCrust', createFaultCrustGeometry(1), FAULT_TIMES, (geometry, t) => poseFaultCrust(geometry, 1, t)),
  track('Chasm', new THREE.PlaneGeometry(1, 1, 1, 320), FAULT_TIMES, (geometry, t) => poseFaultFloor(geometry, t, -3.8))
]);
await write('tornado-motion.glb', [track('Funnel', createFunnelGeometry(), FUNNEL_TIMES, poseFunnel)]);
