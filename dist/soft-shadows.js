import * as THREE from 'three/webgpu';

const MARKER = '// A4_SOFT_SUN_PCSS_V2';
const CALL = 'getShadow( directionalShadowMap[ i ],';
const END = 'vDirectionalShadowCoord[ i ] )';

// Fixed Poisson disk: no frame, screen-space coordinate, or random JS state.
const DISK = [
  [-.94201624,-.39906216],[.94558609,-.76890725],[-.09418410,-.92938870],
  [.34495938,.29387760],[-.91588581,.45771432],[-.81544232,-.87912464],
  [-.38277543,.27676845],[.97484398,.75648379],[.44323325,-.97511554],
  [.53742981,-.47373420],[-.26496911,-.41893023],[.79197514,.19090188],
  [-.24188840,.99706507],[-.81409955,.91437590],[.19984126,.78641367],
  [.14383161,-.14100790]
];
function shadowGLSL(revision) {
  const nativeDepth = revision === '186';
  return `${MARKER} r${revision}
#if NUM_DIR_LIGHT_SHADOWS > 0
${nativeDepth ? `#if !defined( SHADOWMAP_TYPE_BASIC )
#error A4_r186_PCSS_requires_BasicShadowMap_native_depth
#endif` : ''}
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
vec2 a4Disk( int i ) {
${DISK.map(([x,y], i) => `  if ( i == ${i} ) return vec2( ${x}, ${y} );`).join('\n')}
  return vec2( 0.0 );
}
float a4Depth( sampler2D shadowMap, vec2 uv ) {
  ${nativeDepth ? `float depth = texture2D(shadowMap, uv).r;
#ifdef USE_REVERSED_DEPTH_BUFFER
  depth = 1.0 - depth;
#endif
  return depth;` : 'return unpackRGBAToDepth( texture2D(shadowMap, uv) );'}
}
float getSoftSunShadow( sampler2D shadowMap, vec2 shadowMapSize,
  float shadowIntensity, float shadowBias, float shadowRadius,
  vec4 shadowCoord, mat4 shadowMatrix ) {
${nativeDepth ? '#if defined( SHADOWMAP_TYPE_BASIC )' : '#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT )'}
  // Negative radius explicitly opts this directional light into PCSS.
  if ( shadowRadius >= 0.0 ) return getShadow( shadowMap, shadowMapSize,
    shadowIntensity, shadowBias, shadowRadius, shadowCoord );
  vec3 p = shadowCoord.xyz / shadowCoord.w;
  if ( p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z < 0.0 || p.z > 1.0 ) return 1.0;
  // Orthographic matrix rows are orthogonal. Their lengths are inverse world spans.
  vec3 rx = vec3( shadowMatrix[0].x, shadowMatrix[1].x, shadowMatrix[2].x );
  vec3 ry = vec3( shadowMatrix[0].y, shadowMatrix[1].y, shadowMatrix[2].y );
  vec3 rz = vec3( shadowMatrix[0].z, shadowMatrix[1].z, shadowMatrix[2].z );
  vec3 spans = 1.0 / vec3( length(rx), length(ry), length(rz) );
  vec3 local = p - shadowMatrix[3].xyz;
  vec3 worldPosition = rx * local.x * spans.x * spans.x
    + ry * local.y * spans.y * spans.y + rz * local.z * spans.z * spans.z;
  float angle = 6.28318530718 * fract( sin( dot( floor(worldPosition * 16.0),
    vec3(12.9898,78.233,37.719) ) ) * 43758.5453 );
  mat2 rotation = mat2( cos(angle), sin(angle), -sin(angle), cos(angle) );
  // Reconstruct the hash position first, then canonicalize reversed depth to near=0.
  ${nativeDepth ? `#ifdef USE_REVERSED_DEPTH_BUFFER
  p.z = 1.0 - p.z;
#endif` : ''}
  float receiverDepth = p.z + shadowBias;
  // Distances measured from the near plane; the shared origin cancels in separation.
  float receiverDistance = receiverDepth * spans.z;
  float angularRadius = -shadowRadius;
  vec2 searchRadius = angularRadius * max(receiverDistance, 0.0) / spans.xy;
  vec2 halfTexel = 0.5 / shadowMapSize;
  float blockerDistanceSum = 0.0;
  float blockerCount = 0.0;
  for ( int i = 0; i < 16; i ++ ) {
    vec2 uv = p.xy + rotation * (i == 0 ? vec2(0.0) : a4Disk(i)) * searchRadius;
    if ( uv.x >= halfTexel.x && uv.x <= 1.0-halfTexel.x && uv.y >= halfTexel.y && uv.y <= 1.0-halfTexel.y ) {
      float depth = a4Depth(shadowMap, uv);
      if ( depth < receiverDepth ) {
        blockerDistanceSum += depth * spans.z;
        blockerCount += 1.0;
      }
    }
  }
  if ( blockerCount == 0.0 ) return 1.0;
  float blockerDistance = blockerDistanceSum / blockerCount;
  // Directional emitter: angular radius times separation, not a perspective depth ratio.
  float penumbra = angularRadius * max(receiverDistance - blockerDistance, 0.0);
  vec2 filterRadius = penumbra / spans.xy;
  float visibility = 0.0;
  for ( int i = 0; i < 16; i ++ ) {
    vec2 uv = p.xy + rotation * a4Disk(i) * filterRadius;
    if ( uv.x < halfTexel.x || uv.x > 1.0-halfTexel.x || uv.y < halfTexel.y || uv.y > 1.0-halfTexel.y ) visibility += 1.0;
    else visibility += step(receiverDepth, a4Depth(shadowMap, uv));
  }
  return mix(1.0, visibility / 16.0, shadowIntensity);
#else
  return getShadow(shadowMap, shadowMapSize, shadowIntensity, shadowBias, abs(shadowRadius), shadowCoord);
#endif
}
#endif
`;
}

/** r186 needs raw native depth for blocker search. Its PCF comparison sampler cannot
 * provide that depth. Set renderer.shadowMap.type to this before the first render.
 * r186 other lights retain stock Basic filtering; this does not add PCSS to them.
 */
export function getSoftSunShadowMapType(three) {
  const revision = String(three.REVISION);
  if (revision === '170') return three.PCFSoftShadowMap;
  if (revision === '186') return three.BasicShadowMap;
  throw new Error('A4 soft shadows support Three.js r170 and r186 only.');
}

/** Call once before compiling materials. Fails atomically on unsupported chunks/revisions. */
export function installSoftSunShadows(three) {
  getSoftSunShadowMapType(three);
  const revision = String(three.REVISION);
  const chunks = three.ShaderChunk;
  const names = ['shadowmap_pars_fragment', 'lights_fragment_begin', 'shadowmask_pars_fragment'];
  const marked = names.map(name => chunks[name]?.includes(MARKER));
  if (marked.every(Boolean) && chunks[names[0]].includes(`${MARKER} r${revision}`)) return false;
  if (marked.some(Boolean)) throw new Error('A4 partial shadow patch detected.');
  const source = chunks[names[0]];
  const signature = revision === '170' ? 'vec2 cubeToUV(' : 'float getShadow( sampler2DShadow';
  if (!source?.includes(signature) || !/\n#endif\s*$/.test(source)) throw new Error('A4 unsupported shadow chunk.');
  const next = {[names[0]]: source.replace(/\n#endif\s*$/, `\n${shadowGLSL(revision)}\n#endif`)};
  for (const name of names.slice(1)) {
    const chunk = chunks[name];
    if (chunk?.split(CALL).length !== 2 || chunk.split(END).length !== 2) throw new Error(`A4 unsupported ${name}.`);
    next[name] = `${MARKER}\n${chunk.replace(CALL, 'getSoftSunShadow( directionalShadowMap[ i ],').replace(END, 'vDirectionalShadowCoord[ i ], directionalShadowMatrix[ i ] )')}`;
  }
  Object.assign(chunks, next);
  return true;
}

const SUN_DIRECTIONS = new WeakMap();

const WORLD_BOUNDS = {
  city: [[-85,-20,-77.5],[85,80,77.5]],
  landscape: [[-130,-20,-150],[130,80,50]]
};

/** Fits all eight world-space corners, including caster height. Call on world/light changes.
 * Custom bounds support other worlds. Space returns false (no terrestrial sun fit).
 * The first fit captures the world-space target-to-sun direction. Later fits reuse it
 * even if simulation resets only sun.position. Pass direction (Vector3) to rebase it.
 * Call after applyEnvironment and before rendering; no target reset is needed.
 * Negative shadow.radius is reserved by this module; other lights keep stock filtering.
 */
export function fitSunShadowFrustum(sun, world, {bounds, padding = 4, angularRadius = .025, direction: requestedDirection} = {}) {
  if (!sun?.isDirectionalLight) throw new TypeError('A4 requires a directional sun.');
  const box = bounds || (WORLD_BOUNDS[world] && new THREE.Box3(
    new THREE.Vector3(...WORLD_BOUNDS[world][0]), new THREE.Vector3(...WORLD_BOUNDS[world][1])));
  if (!box) {
    if (world === 'space') return false;
    throw new RangeError(`Unknown shadow world: ${world}`);
  }
  if (box.isEmpty() || ![...box.min, ...box.max, padding, angularRadius].every(Number.isFinite)
      || padding <= 0 || angularRadius <= 0) throw new RangeError('Invalid A4 shadow bounds or settings.');
  sun.updateWorldMatrix(true, false);
  sun.target.updateWorldMatrix(true, false);
  const position = sun.getWorldPosition(new THREE.Vector3());
  const target = sun.target.getWorldPosition(new THREE.Vector3());
  const direction = (requestedDirection || SUN_DIRECTIONS.get(sun) || position.clone().sub(target)).clone();
  if (![...direction].every(Number.isFinite) || direction.lengthSq() === 0) throw new RangeError('Sun and target must differ.');
  direction.normalize();
  SUN_DIRECTIONS.set(sun, direction.clone());
  const center = box.getCenter(new THREE.Vector3());
  const distance = box.getSize(new THREE.Vector3()).length() / 2 + padding + 1;
  // Translate light and target together, preserving illumination direction.
  const newPosition = center.clone().addScaledVector(direction, distance);
  sun.position.copy(sun.parent ? sun.parent.worldToLocal(newPosition) : newPosition);
  sun.target.position.copy(sun.target.parent ? sun.target.parent.worldToLocal(center.clone()) : center);
  sun.updateWorldMatrix(true, false);
  sun.target.updateWorldMatrix(true, false);
  sun.shadow.updateMatrices(sun);
  const camera = sun.shadow.camera;
  const lightBounds = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    lightBounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  }
  Object.assign(camera, {
    left: lightBounds.min.x-padding, right: lightBounds.max.x+padding,
    bottom: lightBounds.min.y-padding, top: lightBounds.max.y+padding,
    near: Math.max(.01, -lightBounds.max.z-padding), far: -lightBounds.min.z+padding
  });
  camera.updateProjectionMatrix();
  sun.shadow.radius = -angularRadius;
  sun.shadow.updateMatrices(sun);
  sun.shadow.needsUpdate = true;
  return true;
}
