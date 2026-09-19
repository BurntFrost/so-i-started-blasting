import { REVISION, NearestFilter } from 'three/webgpu';
import {
  Fn, float, vec2, vec3, ivec2, reference, renderGroup,
  shadowPositionWorld, normalWorld, textureLoad,
} from 'three/tsl';

// The same fitter works with WebGL and WebGPU orthographic shadow cameras.
export { fitSunShadowFrustum } from './soft-shadows.js';

const installed = new WeakMap();
const disk = [
  [-.94201624,-.39906216],[.94558609,-.76890725],[-.09418410,-.92938870],
  [.34495938,.29387760],[-.91588581,.45771432],[-.81544232,-.87912464],
  [-.38277543,.27676845],[.97484398,.75648379],[.44323325,-.97511554],
  [.53742981,-.47373420],[-.26496911,-.41893023],[.79197514,.19090188],
  [-.24188840,.99706507],[-.81409955,.91437590],[.19984126,.78641367],
  [.14383161,-.14100790],
];

/** Install before material compilation on an r186 WebGPURenderer, including forceWebGL.
 * Keep renderer.shadowMap.type = PCFShadowMap for other lights. This sun alone uses
 * raw depth and manual PCSS. VSM is rejected because it supplies moments, not depth.
 * Call fitSunShadowFrustum after simulation resets the light, before rendering.
 * The fitter's negative shadow.radius stores the angular radius used by this filter.
 * Returns true for installation, false for an existing installation (radius still updates).
 */
export function installNodeSunShadows(sun, { angularRadius = .025 } = {}) {
  if (String(REVISION) !== '186') throw new Error('Node PCSS requires Three.js r186.');
  if (!sun?.isDirectionalLight || !sun.shadow?.camera.isOrthographicCamera) {
    throw new TypeError('Node PCSS requires a directional sun with an orthographic shadow camera.');
  }
  if (!Number.isFinite(angularRadius) || angularRadius <= 0) throw new RangeError('Invalid sun angular radius.');
  const previous = installed.get(sun);
  if (sun.shadow.filterNode && sun.shadow.filterNode !== previous) {
    throw new Error('The sun already has a different shadow filter.');
  }
  sun.shadow.radius = -angularRadius;
  if (previous && sun.shadow.filterNode === previous) return false;

  const evaluate = Fn(({ depthTexture, shadowCoord, shadow, depthLayer }, builder) => {
    const ref = (key, type, object = shadow) => reference(key, type, object).setGroup(renderGroup);
    const size = ref('mapSize', 'vec2');
    const camera = shadow.camera;
    const spans = vec3(ref('right', 'float', camera).sub(ref('left', 'float', camera)),
      ref('top', 'float', camera).sub(ref('bottom', 'float', camera)),
      ref('far', 'float', camera).sub(ref('near', 'float', camera))).toVar();
    const canonicalDepth = depth => builder.renderer.reversedDepthBuffer ? depth.oneMinus() : depth;
    // ShadowNode has already divided by w, flipped y, and applied the signed bias.
    const receiverDepth = canonicalDepth(shadowCoord.z).toVar();
    const receiverDistance = receiverDepth.mul(spans.z).toVar();
    const angularRadius = ref('radius', 'float').negate().max(0);
    const world = shadowPositionWorld.add(normalWorld.mul(ref('normalBias', 'float')));
    const angle = world.mul(16).floor().dot(vec3(12.9898,78.233,37.719))
      .sin().mul(43758.5453).fract().mul(6.28318530718).toVar();
    const c = angle.cos().toVar(), s = angle.sin().toVar();
    const rotated = ([x,y]) => vec2(c.mul(x).sub(s.mul(y)), s.mul(x).add(c.mul(y)));
    const halfTexel = vec2(.5).div(size);
    const inside = uv => uv.greaterThanEqual(halfTexel).all()
      .and(uv.lessThanEqual(halfTexel.oneMinus()).all());
    const load = uv => {
      // Clamp even invalid taps before loading: neither backend sees out-of-range coordinates.
      const pixel = ivec2(uv.mul(size).floor().clamp(vec2(0), size.sub(1)));
      let depth = textureLoad(depthTexture, pixel);
      if (depthTexture.isArrayTexture) depth = depth.depth(depthLayer);
      return canonicalDepth(depth).toVar();
    };
    const searchRadius = angularRadius.mul(receiverDistance.max(0)).div(spans.xy).toVar();
    const blockerSum = float(0).toVar(), blockerCount = float(0).toVar();
    // Unrolled fixed disk: exactly 16 raw loads for search and 16 for filtering.
    for (let i = 0; i < 16; i++) {
      const uv = shadowCoord.xy.add(rotated(i === 0 ? [0,0] : disk[i]).mul(searchRadius)).toVar();
      const depth = load(uv);
      const blocker = inside(uv).and(depth.lessThan(receiverDepth)).select(1,0);
      blockerSum.addAssign(depth.mul(spans.z).mul(blocker));
      blockerCount.addAssign(blocker);
    }
    const blockerDistance = blockerSum.div(blockerCount.max(1));
    const penumbra = angularRadius.mul(receiverDistance.sub(blockerDistance).max(0));
    const filterRadius = penumbra.div(spans.xy).toVar();
    const visibility = float(0).toVar();
    for (const point of disk) {
      const uv = shadowCoord.xy.add(rotated(point).mul(filterRadius)).toVar();
      const lit = load(uv).greaterThanEqual(receiverDepth);
      visibility.addAssign(inside(uv).and(lit.not()).select(0,1));
    }
    // ShadowNode applies intensity and transmitted-shadow color outside this filter.
    return blockerCount.equal(0).or(receiverDepth.lessThan(0))
      .select(float(1), visibility.div(16));
  });
  // ShadowNode invokes this wrapper while setting up its render target. Disable
  // comparison BEFORE that target is uploaded; doing it in deferred Fn setup is
  // too late to configure the native resource reliably. Raw depth also needs
  // nearest filtering on forceWebGL; inherited hardware-PCF linear filtering
  // produced zero depth reads in the Chrome GPU regression test.
  const filter = inputs => {
    const {depthTexture} = inputs;
    if (!depthTexture.isDepthTexture) throw new Error('Node PCSS needs native depth; VSM is unsupported.');
    if (depthTexture.compareFunction !== null) {
      depthTexture.compareFunction = null;
      depthTexture.minFilter = NearestFilter;
      depthTexture.magFilter = NearestFilter;
      depthTexture.needsUpdate = true;
    }
    return evaluate(inputs);
  };
  sun.shadow.filterNode = filter;
  installed.set(sun, filter);
  sun.shadow.needsUpdate = true;
  return true;
}
