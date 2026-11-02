import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { disposeAsset, loadOptionalAssets } from './asset-loading.js';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function impactWaveState(t, result = {}) {
  const travel = ease((t - 14) / 16);
  result.front = -115 + travel * 230;
  result.height = (22 + travel * 60) * (1 - .38 * ease((t - 25) / 5));
  result.reveal = Math.max(.001, ease((t - 14) / 1.3));
  return result;
}

// Procedural startup and failed-download fallback share the same crest as their spray.
export function impactWaveProfile(v, height, x, t, point = {}) {
  const fold = ease((t - 17) / 9);
  const ridge = 1 + Math.sin(x * .026 + .7) * .075 + Math.sin(x * .071 - t * .35) * .028;
  point.x = x;
  point.y = Math.sin(v * Math.PI * .68) * height * ridge - Math.pow(v, 10) * fold * 7 + Math.sin(x * .13 + t) * .65 * v;
  point.z = Math.sin(v * Math.PI) * 18 + Math.pow(v, 5) * (16 + fold * 28);
  return point;
}

// The GLB stores baked poses and normals, plus a matching crest curve for each pose.
// Both are sampled from absolute simulation time, without a physics step or mixer history.
export function createImpactWave({ wave, foam, canvas, signal, timeoutMs = 15_000 }) {
  const fallbackGeometry = wave.geometry, base = fallbackGeometry.attributes.position.array.slice();
  const point = {}, foamPoint = {}, state = {};
  let poses, requested = false, ready;
  let sampleTime, previous = 0, next = 1, mix = 0;
  canvas.dataset.impactWave = 'idle';
  canvas.dataset.waveAnimation = 'procedural';
  wave.frustumCulled = false;

  function sampleTimeAt(t) {
    if (t === sampleTime) return;
    sampleTime = t;
    impactWaveState(t, state);
    if (!poses) return;
    const times = poses.waveTimes;
    next = 1;
    while (next < times.length - 1 && t > times[next]) next++;
    previous = next - 1;
    mix = clamp((t - times[previous]) / (times[next] - times[previous]));
  }

  function crestAt(x, t, result = {}) {
    sampleTimeAt(t);
    if (!poses) {
      impactWaveProfile(1, state.height, x, t, result);
      result.y *= state.reveal;
      return result;
    }
    const a = poses.crestFrames[previous], b = poses.crestFrames[next];
    const count = a.length / 3, u = clamp((x - a[0]) / (a[(count - 1) * 3] - a[0])) * (count - 1);
    const left = Math.min(count - 2, Math.floor(u)), f = u - left;
    const p = left * 3;
    result.x = a[p] + (a[p + 3] - a[p]) * f;
    const y = a[p + 1] + (a[p + 4] - a[p + 1]) * f, z = a[p + 2] + (a[p + 5] - a[p + 2]) * f;
    result.y = (y + (b[p + 1] + (b[p + 4] - b[p + 1]) * f - y) * mix) * state.reveal;
    result.z = z + (b[p + 2] + (b[p + 5] - b[p + 2]) * f - z) * mix;
    return result;
  }

  function contactFront(x, t) {
    crestAt(x, t, point);
    return state.front + point.z * .55 + 9;
  }

  async function load() {
    canvas.dataset.impactWave = 'loading';
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const [result] = await loadOptionalAssets([() => loader.loadAsync('/assets/deep-impact-wave.glb')], { signal, timeoutMs });
      if (result.status !== 'fulfilled') throw result.reason;
      const asset = result.value;
      let source;
      asset.scene.traverse(object => { if (object.isMesh && object.userData.waveTimes) source = object; });
      if (!source || source.geometry.morphAttributes.position?.length !== source.userData.waveTimes.length - 1) {
        disposeAsset(asset); throw new Error('Missing authored wave poses');
      }
      poses = source.userData;
      sampleTime = undefined;
      wave.geometry = source.geometry;
      wave.updateMorphTargets();
      // The existing cinema material owns lighting, water shading and renderer adaptation.
      // The closed water volume avoids order-dependent alpha blending between its surfaces.
      wave.material.transparent = false;
      wave.material.opacity = 1;
      wave.material.needsUpdate = true;
      source.geometry = null;
      disposeAsset(asset);
      fallbackGeometry.dispose();
      canvas.dataset.impactWave = 'ready';
      canvas.dataset.waveAnimation = 'baked-morph';
    } catch {
      if (signal?.aborted) return;
      canvas.dataset.impactWave = 'fallback';
    }
    if (!signal?.aborted) canvas.dispatchEvent?.(new Event('impact-wave-ready'));
  }

  function update(t) {
    if (!requested && !signal?.aborted) { requested = true; ready = load(); }
    sampleTimeAt(t);
    const { front, height } = state;
    wave.position.set(0, -1.2, front);
    wave.scale.y = state.reveal;
    if (poses) {
      wave.morphTargetInfluences.fill(0);
      if (previous > 0) wave.morphTargetInfluences[previous - 1] = 1 - mix;
      wave.morphTargetInfluences[next - 1] = mix;
    } else {
      const positions = wave.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        impactWaveProfile((base[i * 3 + 1] + 37.5) / 75, height, base[i * 3] * 1.65, t, point);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      wave.geometry.computeVertexNormals();
    }
    const positions = foam.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const a = (i * .61803398875) % 1, b = (i * .754877666) % 1, c = (i * .569840296) % 1, x = (a - .5) * 355;
      const phase = (t * (.3 + b * .22) + c) % 1, age = phase * (1.2 + c * 1.8);
      crestAt(x, t, foamPoint);
      positions.setXYZ(i, x + age * (2 + b * 4), wave.position.y + foamPoint.y + age * (3 + c * 6) - age * age * 2.1,
        front + foamPoint.z - age * (1 + b * 3));
    }
    foam.material.opacity = .45 * ease((t - 14) / 1.2);
    positions.needsUpdate = true;
  }

  return { update, crestAt, contactFront, get ready() { return ready; } };
}
