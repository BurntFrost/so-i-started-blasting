import * as THREE from 'three/webgpu';
import { markEffects } from './render-kit.js';
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const bell = (t, center, width) => Math.exp(-(((t - center) / width) ** 2));

// Deliberately authored beats: arrival, a held charge, recoil, then a quiet retreat.
export function invasionState(t) {
  const arrival = ease(t / 8), recoil = bell(t, 13.35, .65) * ease((t - 13) / .15), retreat = ease((t - 21) / 9);
  const charge = ease((t - 3) / 7), discharge = 1 - ease((t - 17.5) / 2.5);
  return {
    x: -24 + arrival * 16 - retreat * 2, y: 100 - arrival * 17 + recoil * 1.4 + retreat * 3,
    z: -30 + arrival * 10, yaw: -.12 + arrival * .2 + retreat * .04,
    roll: Math.sin(arrival * Math.PI) * .025 - recoil * .012,
    aperture: ease((t - 6) / 5) * (1 - ease((t - 20) / 5)),
    charge: charge * discharge,
    pulse: bell(t, 8, .35) * .28 + bell(t, 10.5, .3) * .4 + bell(t, 12.8, .24) * .7,
    beamLength: ease((t - 9.8) / 3.2), beamPower: ease((t - 9.8) / .5) * discharge,
    front: Math.max(0, t - 13) * 18,
  };
}
export function invasionCollapse(t, x, z) {
  return ease((t - 13 - Math.hypot(x + 8, z + 20) / 18) / 4.8);
}

export function createInvasionMotion({ scene, ship, core, beam, shockwave }) {
  const assembly = new THREE.Group(); assembly.name = 'Authored mothership weapon assembly'; scene.add(assembly);
  const metal = new THREE.MeshStandardMaterial({ color:'#213b3c', metalness:.72, roughness:.33 });
  const light = new THREE.MeshBasicMaterial({ color:'#62f5c9', transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending });
  const blades = [], seams = [];
  for (let i = 0; i < 12; i++) {
    const pivot = new THREE.Group(), angle = i * Math.PI / 6;
    pivot.rotation.y = angle; assembly.add(pivot);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.2,.6,7), metal);
    blade.position.set(0,-5,7); blade.rotation.y = .24; pivot.add(blade);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(.16,.18,5.8), light);
    seam.position.set(.88,-5.38,7); pivot.add(seam);
    blades.push({ pivot, blade, seam, angle });
  }
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 5,.14,5,64,Math.PI * 1.65), light);
    ring.rotation.x = Math.PI / 2; ring.position.y = -4.7; assembly.add(ring); seams.push(ring);
  }
  const packets = new THREE.InstancedMesh(new THREE.TorusGeometry(1,.08,4,24), light, 7);
  packets.name = 'Travelling beam compression rings'; packets.frustumCulled = false; scene.add(packets);
  const dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),
    new THREE.MeshStandardMaterial({color:'#71665a',roughness:1,transparent:true,opacity:0,depthWrite:false}),48);
  dust.name = 'Radial pressure front dust rolls'; dust.frustumCulled = false; scene.add(dust);
  const dummy = new THREE.Object3D();
  markEffects(assembly); markEffects(packets); markEffects(dust);
  function update(t, active, quality = 'high', phone = false) {
    assembly.visible = active; packets.visible = active && t > 10 && t < 20;
    dust.visible = active && t > 13 && t < 29;
    if (!active) return;
    const state = invasionState(t);
    ship.position.set(state.x,state.y-(phone?12:0),state.z); ship.rotation.set(0,state.yaw,state.roll);
    assembly.position.copy(ship.position); assembly.quaternion.copy(ship.quaternion);
    core.scale.setScalar(.7 + state.charge * .9 + state.pulse * .22);
    core.material.color.setRGB(.16 + state.charge * .6, .8 + state.charge * 2 + state.pulse, .5 + state.charge * 1.35);
    light.opacity = state.charge * (.22 + state.pulse * .3);
    for (const { pivot, blade, seam, angle } of blades) {
      pivot.rotation.y = angle + state.aperture * .36;
      blade.position.z = seam.position.z = 6.7 + state.aperture * 2.6;
      blade.rotation.x = -.18 * state.aperture;
    }
    seams.forEach((ring,i) => { ring.rotation.z = t * (.12 + i * .035) * (i % 2 ? -1 : 1); });
    const top = ship.position.y - 6, length = (top - .3) * state.beamLength;
    beam.visible = t > 9.8 && t < 20;
    beam.position.set(state.x,top-length*.5,state.z);
    beam.scale.set(.25 + state.beamPower * 1.65,Math.max(.001,length/85),.25 + state.beamPower * 1.65);
    beam.material.opacity = state.beamPower * (.46 + state.pulse * .12);
    beam.material.color.setRGB(.35,1.8,1.15);
    for (let i = 0; i < 7; i++) {
      const phase = (t * .65 + i / 7) % 1, width = (.8 + phase * .6) * state.beamPower;
      dummy.position.set(state.x,top-phase*length,state.z); dummy.rotation.set(Math.PI/2,0,0);
      dummy.scale.set(width,width,width); dummy.updateMatrix(); packets.setMatrixAt(i,dummy.matrix);
    }
    packets.instanceMatrix.needsUpdate = true;
    shockwave.position.set(-8,.4,-20); shockwave.scale.setScalar(Math.max(.001,state.front));
    shockwave.material.opacity = (1-ease((t-20)/8))*.7;
    dust.count = quality === 'lite' ? 18 : quality === 'balanced' ? 30 : 48;
    dust.material.opacity = ease((t-13)/.8) * (1-ease((t-22)/7)) * .19;
    for (let i = 0; i < dust.count; i++) {
      const angle = i / dust.count * Math.PI * 2, variation = (i * .61803398875) % 1;
      const radius = state.front * (.92 + variation * .08), size = (1.2 + variation * 1.8) * ease((t-13)/2);
      dummy.position.set(-8+Math.cos(angle)*radius,.4+size*.45,-20+Math.sin(angle)*radius);
      dummy.rotation.set(t*.15+variation,angle,variation); dummy.scale.set(size*2,size*.7,size*1.2);
      dummy.updateMatrix(); dust.setMatrixAt(i,dummy.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;
  }
  return { update, assembly, packets, dust };
}
