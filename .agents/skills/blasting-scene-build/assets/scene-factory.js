// Runnable factory example: replace its subject and motion to match the scene brief.
// Register createScene in the terrestrial/cosmic factory map after integrating it.
import * as THREE from 'three/webgpu';

const ease = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function createScene({ scene }) {
  const group = new THREE.Group();
  group.name = 'Scene authoring example';
  group.visible = false;
  scene.add(group);

  const material = new THREE.MeshStandardMaterial({ color: '#ff9852', roughness: .6 });
  const subject = new THREE.Mesh(new THREE.IcosahedronGeometry(8, 1), material);
  subject.position.set(0, 24, 0);
  group.add(subject);

  const fragments = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, 24);
  fragments.name = 'Example fragments';
  // Positions spread beyond the initial instance bounds during the event.
  fragments.frustumCulled = false;
  group.add(fragments);
  let seed = 1996;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const seeds = Array.from({ length: 24 }, (_, index) => ({
    angle: index / 24 * Math.PI * 2, radius: 12 + random() * 12,
    height: 8 + random() * 16, size: .6 + random(),
  }));
  const pose = new THREE.Object3D();

  function update(time, quality) {
    // Terrestrial passes numeric detail; cosmic passes its quality name.
    const detail = typeof quality === 'string' ? quality === 'lite' ? 0 : quality === 'balanced' ? 1 : 2 : quality;
    const t = Math.max(0, Math.min(30, time));
    const event = ease((t - 8) / 12), settle = ease((t - 22) / 8);
    subject.position.y = 24 + Math.sin(t * .25) * 2;
    subject.rotation.set(t * .1, t * .18, 0);
    subject.scale.setScalar(1 + event * .8 - settle * .4);
    fragments.count = [8, 16, 24][detail];
    fragments.visible = t > 8;
    for (let i = 0; i < fragments.count; i++) {
      const s = seeds[i], angle = s.angle + t * .15;
      pose.position.set(Math.cos(angle) * s.radius * event,
        24 + s.height * Math.sin(event * Math.PI) - settle * 20,
        Math.sin(angle) * s.radius * event);
      pose.rotation.set(t * .2 + s.angle, t * .3, t * .1);
      pose.scale.setScalar(s.size * (.1 + event));
      pose.updateMatrix();
      fragments.setMatrixAt(i, pose.matrix);
    }
    fragments.instanceMatrix.needsUpdate = true;
  }

  return { group, update, particles: [] };
}
