import * as THREE from 'three/webgpu';
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const p = clamp(value); return p * p * (3 - 2 * p); };

// Authored staging points keep the craft in three dimensions; the camera remains user-owned.
const approach = new THREE.CatmullRomCurve3([
  new THREE.Vector3(62, 28, -54), new THREE.Vector3(71, 40, -19),
  new THREE.Vector3(57, 59, 30), new THREE.Vector3(33, 61, 35),
  new THREE.Vector3(14, 54, 20), new THREE.Vector3(0, 50, 0)
], false, 'centripetal');
const forward = new THREE.Vector3(0, 0, 1), tangent = new THREE.Vector3(), bank = new THREE.Quaternion();
export function interstellarFlight(time, position, quaternion) {
  const t = clamp(time / 30), progress = ease(t);
  approach.getPointAt(progress, position);
  approach.getTangentAt(progress, tangent).normalize();
  quaternion.setFromUnitVectors(forward, tangent);
  const roll = -.18 + .62 * Math.sin(progress * Math.PI) - .85 * ease((time - 22) / 8);
  bank.setFromAxisAngle(forward, roll); quaternion.multiply(bank);
}

export function engineClusterPower(time, cluster) {
  const delay = [-.45, 0, .3, .65, 1, 1.35][cluster];
  return .35 + .65 * ease((time - 15 - delay) / 1.7)
    - .22 * ease((time - 24 - delay * .25) / 2);
}
