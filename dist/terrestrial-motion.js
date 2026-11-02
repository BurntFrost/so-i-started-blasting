import * as THREE from 'three/webgpu';

const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { const v = clamp(x); return v * v * (3 - 2 * v); };
export const FAULT_TIMES = [0, 3, 5, 7, 10, 12, 14, 17, 21, 23, 26, 30];
export const FUNNEL_TIMES = [0, 6, 8, 10, 12, 13, 15, 18, 21, 24, 26, 28, 30];

// These authoring functions also supply the immediate, network-independent fallback.
export function faultSection(t, z) {
  const delay = clamp((z + 90) / 180) * 5;
  const opening = ease((t - 3 - delay) / 4) * .25 + ease((t - 10 - delay * .55) / 5) * .45 + ease((t - 21 - delay * .3) / 6) * .3;
  return { center: Math.sin(z * .045) * 10 + Math.sin(z * .16) * 2,
    width: .35 + opening * (13 + Math.sin(z * .11) * 3),
    heave: opening * (1.1 + Math.sin(z * .065) * .7) };
}
export function createFaultCrustGeometry(side, rows = 320) {
  const geometry = new THREE.BufferGeometry(), indices = [];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((rows + 1) * 12), 3));
  for (let row = 0; row < rows; row++) {
    const a = row * 4, b = a + 4;
    indices.push(a, b, a + 1, a + 1, b, b + 1, a, a + 2, b, b, a + 2, b + 2,
      a + 1, b + 1, a + 3, a + 3, b + 1, b + 3, a + 2, a + 3, b + 2, b + 2, a + 3, b + 3);
  }
  indices.push(0, 1, 2, 1, 3, 2);
  const end = rows * 4; indices.push(end, end + 2, end + 1, end + 1, end + 2, end + 3);
  geometry.setIndex(indices); poseFaultCrust(geometry, side, 0); return geometry;
}
export function poseFaultCrust(geometry, side, t) {
  const p = geometry.attributes.position, rows = p.count / 4 - 1;
  for (let row = 0; row <= rows; row++) {
    const z = 2000 * (.5 - row / rows), s = faultSection(t, z), inner = s.center + side * s.width, a = row * 4;
    p.setXYZ(a, inner, -1.05 + s.heave * (side < 0 ? 1 : -.5), z);
    p.setXYZ(a + 1, side * 1200, -1.05, z);
    p.setXYZ(a + 2, inner + side * 9, -80, z); p.setXYZ(a + 3, side * 1200, -80, z);
  }
  p.needsUpdate = true; geometry.computeVertexNormals();
}
export function poseFaultFloor(geometry, t, y, normals = true) {
  const p = geometry.attributes.position, rows = p.count / 2 - 1;
  for (let i = 0; i < p.count; i++) {
    const z = 2000 * (.5 - Math.floor(i / 2) / rows), s = faultSection(t, z);
    p.setXYZ(i, s.center + (i % 2 ? 1 : -1) * s.width, y, z);
  }
  p.needsUpdate = true; if (normals) geometry.computeVertexNormals();
}
export function funnelState(t) {
  const down = ease((t - 8) / 5), spread = ease((t - 13) / 5), ropeOut = ease((t - 25) / 5);
  return { height: 22 + down * 74, spread, ropeOut,
    lx: -8 + Math.sin(t * .34) * (4 + ropeOut * 7), lz: -4 + Math.cos(t * .29) * (3 + ropeOut * 5) };
}
export function createFunnelGeometry(radial = 64) {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, radial, 48, true);
  const p = geometry.attributes.position;
  geometry.userData.funnelCoordinates = Array.from({ length: p.count }, (_, i) => [p.getY(i) + .5, Math.atan2(p.getZ(i), p.getX(i))]);
  const colors = new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3);
  const low = new THREE.Color('#59534d'), high = new THREE.Color('#778d9a'), shade = new THREE.Color();
  geometry.userData.funnelCoordinates.forEach(([h, a], i) => {
    shade.copy(low).lerp(high, ease(h * 1.6)).multiplyScalar(.9 + Math.sin(a * 3 - h * 4) * .08);
    colors.setXYZ(i, shade.r, shade.g, shade.b);
  });
  geometry.setAttribute('color', colors); poseFunnel(geometry, 0); return geometry;
}
export function poseFunnel(geometry, t) {
  const { height, spread, ropeOut, lx, lz } = funnelState(t), p = geometry.attributes.position;
  const foot = (2.6 + spread * 8.5) * (1 - ropeOut * .72), shoulder = 32 + spread * 8;
  geometry.userData.funnelCoordinates.forEach(([h, a], i) => {
    const profile = foot + (shoulder - foot) * Math.pow(h, 1.65 + ropeOut * .45);
    const r = profile * (1 + Math.sin(a * 3 - t * .28 + h * 3.8) * .065 + Math.sin(a * 7 - h * 5.1) * .018);
    const curl = Math.sin(h * Math.PI) * ropeOut * 7;
    const crown = ease((h - .82) / .18) * (4 + Math.sin(a * 5 - t * .12) * 1.8);
    p.setXYZ(i, Math.cos(a) * r + lx * h * h + curl, h * height + crown,
      Math.sin(a) * r + lz * h * h - curl * .5);
  });
  p.needsUpdate = true; geometry.computeVertexNormals();
}

// Sculpt once; live motion only poses these surfaces and never rewrites vertices.
export function sculptedLathe(profile, segments = 40, lobes = 7, strength = .045) {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(z, x);
    const ripple = 1 + Math.sin(a * lobes + y * 2) * strength + Math.sin(a * (lobes + 4) - y * 3) * strength * .35;
    p.setXYZ(i, x * ripple, y + Math.sin(a * lobes + y * 1.3) * strength * Math.hypot(x, z), z * ripple);
  }
  geometry.computeVertexNormals(); return geometry;
}
export function createSnowDriftGeometry() {
  const geometry = new THREE.SphereGeometry(1, 16, 8), p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), lee = (x + 1) * .5;
    p.setXYZ(i, x * (1 + lee * .7), Math.max(0, y) * (.78 - lee * .35) + Math.sin(z * 7 + x * 2) * .025 * Math.max(0, y), z * (.8 + lee * .3));
  }
  geometry.computeVertexNormals(); return geometry;
}
export function tripodRoot(t, index, x, z) {
  const stride = Math.max(0, t - 6) * .72 + index * 2;
  return { x: x + Math.sin(stride * .3) * 5, z: z + Math.max(0, t - 6) * 1.5,
    yaw: -.22 + Math.sin(t * .12 + index) * .2, stride };
}
export function tripodFoot(t, index, leg, x, z, scale) {
  const period = 4.8, offset = leg / 3 + index * .28, clock = Math.max(0, t - 6) / period + offset;
  const cycle = Math.floor(clock), phase = clock - cycle;
  const anchor = step => {
    const root = tripodRoot(Math.max(6, 6 + (step - offset) * period), index, x, z), a = leg / 3 * Math.PI * 2 + Math.PI;
    const fx = Math.sin(a) * 27 * scale, fz = Math.cos(a) * 25 * scale;
    return [root.x + Math.cos(root.yaw) * fx + Math.sin(root.yaw) * fz, root.z - Math.sin(root.yaw) * fx + Math.cos(root.yaw) * fz];
  };
  const from = anchor(cycle), to = anchor(cycle + 1), swing = ease((phase - .72) / .28);
  return { x: from[0] + (to[0] - from[0]) * swing, z: from[1] + (to[1] - from[1]) * swing,
    lift: Math.sin(Math.PI * clamp((phase - .72) / .28)) * 7 * scale, phase };
}
export function sampleRoute(route, progress, target) {
  const end = route.length / 3 - 1, f = clamp(progress) * end, i = Math.min(end - 1, Math.floor(f)), mix = f - i;
  return target.set(route[i * 3] + (route[(i + 1) * 3] - route[i * 3]) * mix,
    route[i * 3 + 1] + (route[(i + 1) * 3 + 1] - route[i * 3 + 1]) * mix,
    route[i * 3 + 2] + (route[(i + 1) * 3 + 2] - route[i * 3 + 2]) * mix);
}
