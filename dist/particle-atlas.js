import * as THREE from 'three';
import { opaqueDepthUniforms, opaqueDepthGLSL } from './render-kit.js';

// Cell order is top-to-bottom in the authored image. No runtime random numbers.
const puff = Object.freeze([0, 4]), ember = Object.freeze([4, 4]);
const streak = Object.freeze([8, 4]), droplet = Object.freeze([12, 2]), snow = Object.freeze([14, 2]);
export const particleCells = Object.freeze({
  embers: ember, rupture: puff, invasion: puff, vortex: puff, inflow: puff,
  ash: puff, blizzard: snow, spindrift: puff, swarm: ember, plague: puff, ascension: ember,
  flare: ember, ejecta: streak, debris: streak, accretion: streak, streak, stream: puff,
  sparks: ember, smoke: puff, spray: droplet, snow, foam: droplet, windows: ember, stars: ember
});
const contexts = new WeakMap();
export function particleAtlasUniforms(canvas) {
  if (contexts.has(canvas)) return contexts.get(canvas);
  const uniforms = { ...opaqueDepthUniforms(canvas), particleAtlas: { value: null }, particleAtlasReady: { value: 0 }, particleSoftness: { value: 2 } };
  contexts.set(canvas, uniforms);
  canvas.dataset.particleAtlas = 'loading';
  // Reuse the existing optional-asset wake event: both success and failure redraw a paused scene.
  const wake = () => canvas.dispatchEvent?.(new Event('atmosphere-ready'));
  const failed = () => { canvas.dataset.particleAtlas = 'fallback'; wake(); };
  try { new THREE.TextureLoader().loadAsync('/assets/particle-atlas.webp').then(texture => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    uniforms.particleAtlas.value = texture; uniforms.particleAtlasReady.value = 1;
    canvas.dataset.particleAtlas = 'ready'; wake();
  }, failed); } catch { failed(); }
  return uniforms;
}

export const particleFragmentGLSL = `
${opaqueDepthGLSL}
uniform sampler2D particleAtlas;
uniform float particleAtlasReady,particleSoftness;
varying float particleCell,particleAngle;
float particleMask(){
  vec2 p=gl_PointCoord-.5;
  float c=cos(particleAngle),s=sin(particleAngle);
  p=mat2(c,-s,s,c)*p+.5;
  if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.))))return 0.;
  // Half-texel inset and transparent cell gutters prevent neighboring shapes leaking at the edges.
  vec2 cell=vec2(mod(particleCell,4.),3.-floor(particleCell/4.));
  vec2 uv=(cell*256.+vec2(.5)+vec2(p.x,1.-p.y)*255.)/1024.;
  return texture2D(particleAtlas,uv).r;
}
float particleViewDepth(float depth){return opaqueNear*opaqueFar/(opaqueFar-depth*(opaqueFar-opaqueNear));}
float particleDepthFade(){
  if(opaqueDepthAvailable<.5)return 1.;
  float depth=texture2D(opaqueDepth,gl_FragCoord.xy*opaqueInverseSize).x;
  if(depth>=1.)return 1.;
  return smoothstep(0.,max(.001,particleSoftness),particleViewDepth(depth)-particleViewDepth(gl_FragCoord.z));
}`;

// Augment the factory's existing shader; retain its entire procedural fallback and seed-to-motion code.
// motion is the unchanged closed-form body. Evaluating it at time+.04 only chooses streak orientation.
export function applyParticleAtlas(material, { canvas, kind, motion = '', opacity = 'opacity', color = 'tint', output = '' }) {
  const range = particleCells[kind];
  if (!range) throw new Error(`Unknown particle kind: ${kind}`);
  Object.assign(material.uniforms, particleAtlasUniforms(canvas));
  const directional = range === streak && motion;
  const future = directional ? `vec3 particleNext(float time){float a=seed.x*6.283185;vec3 p=vec3(0.);float alpha=0.,opacity=0.,warmth=seed.z;${motion}return p;}` : '';
  material.vertexShader = material.vertexShader.replace('void main()', `varying float particleCell,particleAngle;\n${future}\nvoid main()`)
    .replace(/}\s*$/, `
      particleCell=${range[0]}.+floor(min(seed.w,.999999)*${range[1]}.);
      particleAngle=seed.x*6.283185${range === puff ? '+time*(seed.z-.5)*.35' : ''};
      ${directional ? `vec4 particleFuture=modelViewMatrix*vec4(particleNext(time+.04),1.);
      vec2 particleDirection=particleFuture.xy/max(.001,-particleFuture.z)-mv.xy/max(.001,-mv.z);
      if(dot(particleDirection,particleDirection)>.00000001)particleAngle=atan(-particleDirection.y,particleDirection.x);` : ''}
    }`);
  material.fragmentShader = material.fragmentShader.replace('void main()', 'void particleFallback()');
  material.fragmentShader += `\n${particleFragmentGLSL}\nvoid main(){
    if(particleAtlasReady>.5){gl_FragColor=vec4(${color},particleMask()*${opacity});${output}}
    else{particleFallback();}
    gl_FragColor.a*=particleDepthFade();
  }`;
  return material;
}

// For the existing CPU-positioned PointsMaterial systems. Call after any prior material patches.
// The extra scalar attribute is stable by index, independent of changing positions and the scene RNG.
export function applyParticlePoints(points, canvas, kind) {
  const range = particleCells[kind];
  if (!range) throw new Error(`Unknown particle kind: ${kind}`);
  const values = new Float32Array(points.geometry.attributes.position.count);
  for (let i = 0; i < values.length; i++) values[i] = ((i * 1664525 + 1013904223) >>> 0) / 4294967296;
  points.geometry.setAttribute('particleSeed', new THREE.BufferAttribute(values, 1));
  const uniforms = particleAtlasUniforms(canvas), material = points.material;
  Object.defineProperty(material, 'nodeParticle', {value:{kind,uniforms},configurable:true});
  material.depthWrite = false;
  const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
  const fallback = kind === 'stars' ? '1.-smoothstep(.05,.5,length(gl_PointCoord-.5))' : '1.-smoothstep(.1,1.,length(gl_PointCoord-.5)*2.)';
  material.onBeforeCompile = shader => {
    previous.call(material, shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute float particleSeed;varying float particleCell,particleAngle;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      particleCell=${range[0]}.+floor(min(particleSeed,.999999)*${range[1]}.);particleAngle=particleSeed*6.283185;`);
    shader.fragmentShader = particleFragmentGLSL + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.a*=particleAtlasReady>.5?particleMask():${fallback};
      diffuseColor.a*=particleDepthFade();`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:particle-atlas:${kind}`;
  material.needsUpdate = true;
}
