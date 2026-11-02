import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { disposeAsset, loadOptionalAssets } from './asset-loading.js';

// Nonuniform Hermite interpolation keeps velocity continuous at authored keys.
// Four pose weights express the curve on the GPU; pose zero is the implicit base.
export function sampleBakedWeights(time, times, weights) {
  weights.fill(0);
  if (time <= times[0]) return;
  if (time >= times.at(-1)) { weights[weights.length - 1] = 1; return; }
  let next = 1;
  while (time > times[next]) next++;
  const previous = next - 1, before = Math.max(0, previous - 1), after = Math.min(times.length - 1, next + 1);
  const span = times[next] - times[previous], u = (time - times[previous]) / span, u2 = u * u, u3 = u2 * u;
  const add = (pose, value) => { if (pose > 0) weights[pose - 1] += value; };
  add(previous, 2 * u3 - 3 * u2 + 1); add(next, -2 * u3 + 3 * u2);
  const firstTangent = (u3 - 2 * u2 + u) * span / (times[next] - times[before]);
  const lastTangent = (u3 - u2) * span / (times[after] - times[previous]);
  add(next, firstTangent); add(before, -firstTangent);
  add(after, lastTangent); add(previous, -lastTangent);
}

// Offline poses retain the live mesh/material, including depth, shadows and tier ownership.
// All deformation is sampled from the shared timeline; there is no mixer or simulation history.
export function createBakedMotion({ url, targets, canvas, statusKey, signal, timeoutMs = 15_000 }) {
  let requested = false, tracks, ready, lastTime;
  canvas.dataset[statusKey] = 'idle';
  async function load() {
    canvas.dataset[statusKey] = 'loading';
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const [result] = await loadOptionalAssets([() => loader.loadAsync(url)], { signal, timeoutMs });
      if (result.status !== 'fulfilled') throw result.reason;
      const asset = result.value;
      const pending = Object.entries(targets).map(([name, mesh]) => {
        const source = asset.scene.getObjectByName(name), times = source?.userData.motionTimes;
        if (!source?.isMesh || !Array.isArray(times) || times.length < 2 ||
            times.some((time, i) => !Number.isFinite(time) || (i > 0 && time <= times[i - 1])) ||
            source.geometry.morphAttributes.position?.length !== times.length - 1 ||
            source.geometry.morphAttributes.normal?.length !== times.length - 1) return null;
        return { mesh, source, times };
      });
      if (pending.some(track => !track)) { disposeAsset(asset); throw new Error('Invalid baked motion poses'); }
      for (const track of pending) {
        const previous = track.mesh.geometry;
        track.mesh.geometry = track.source.geometry; track.source.geometry = null;
        track.mesh.updateMorphTargets(); track.mesh.frustumCulled = false;
        // The fallback may already have compiled without morph inputs. Rebuild its
        // retained material program when the authored position/normal poses arrive.
        for (const material of [track.mesh.material].flat()) material.needsUpdate = true;
        previous.dispose();
      }
      tracks = pending.map(({ mesh, times }) => ({ mesh, times }));
      disposeAsset(asset);
      lastTime = undefined;
      canvas.dataset[statusKey] = 'ready';
    } catch {
      if (signal?.aborted) return;
      canvas.dataset[statusKey] = 'fallback';
    }
    if (!signal?.aborted) canvas.dispatchEvent?.(new Event('animation-ready'));
  }
  function update(time) {
    if (!requested && !signal?.aborted) { requested = true; ready = load(); }
    if (!tracks) return false;
    if (time === lastTime) return true;
    lastTime = time;
    for (const { mesh, times } of tracks) {
      sampleBakedWeights(time, times, mesh.morphTargetInfluences);
    }
    return true;
  }
  return { update, get ready() { return ready; } };
}
