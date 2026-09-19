import * as THREE from 'three';
import { createShaderMaterial } from './shader-program.js';

// Effects render in colour but never in the shared opaque normal/depth buffer.
export const EFFECTS_LAYER = 1;
export function markEffect(object) {
  object.traverse(child => {
    if (child.isMesh || child.isPoints || child.isLine || child.isSprite) {
      child.layers.set(EFFECTS_LAYER); child.castShadow = false;
    }
  });
  return object;
}
// Transparent or additive renderables are effects unless flagged opaqueDepth: water and other physical surfaces that
// must still occlude and stop volume marches despite their alpha.
export function markEffects(root) {
  root.traverse(object => {
    if (object.userData.opaqueDepth) return;
    const materials = [].concat(object.material || []);
    if (object.isPoints || object.isLine || object.isSprite || materials.some(m => m.transparent || m.blending === THREE.AdditiveBlending)) markEffect(object);
  });
  return root;
}
const depthContexts = new WeakMap();
export function opaqueDepthUniforms(canvas) {
  if (!depthContexts.has(canvas)) depthContexts.set(canvas, {
    opaqueDepth: {value: null}, opaqueDepthAvailable: {value: 0},
    opaqueInverseSize: {value: new THREE.Vector2(1, 1)},
    opaqueProjectionInverse: {value: new THREE.Matrix4()}, opaqueCameraWorld: {value: new THREE.Matrix4()},
    opaqueNear: {value: 1}, opaqueFar: {value: 1000}
  });
  return depthContexts.get(canvas);
}
export const opaqueDepthGLSL = `
uniform sampler2D opaqueDepth;
uniform float opaqueDepthAvailable,opaqueNear,opaqueFar;
uniform vec2 opaqueInverseSize;
uniform mat4 opaqueProjectionInverse,opaqueCameraWorld;
vec3 opaqueWorldPoint(vec2 uv,float depth){
  vec4 view=opaqueProjectionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);
  return (opaqueCameraWorld*vec4(view.xyz/view.w,1.)).xyz;
}`;


const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const noise = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.11)*.15;}`;

// Marched volumes, shared by the terrestrial and cosmic renderers. A hull mesh's fragment shader marches a
// closed-form density field keyed to world position and absolute time, so the march is exactly reversible and
// needs no history buffer. Front faces start the ray at the hull surface and the depth test lets the opaque
// scene occlude it; when the camera is inside a hull the material shows its back faces and the march starts at
// the camera. `field` returns (density, share, grain). `terrain` mirrors the landscape height for `terrainCut`.
export const volumeGLSL = `${noise}
float terrain(vec2 xz){return -.5+(sin(xz.x*.022)*cos(xz.y*.027)*5.-sin(xz.y*.06)*1.5)*clamp((length(xz)-25.)/80.,0.,1.);}`;
export const volumeUniforms = (extra, canvas) => ({ ...opaqueDepthUniforms(canvas), time: { value: 0 }, steps: { value: 32 }, inside: { value: 0 }, flash: { value: 0 }, flashPoint: { value: new THREE.Vector3() },
  origin: { value: new THREE.Vector3() }, sunDirection: { value: new THREE.Vector3(-90, 85, -110).normalize() },
  sunColor: { value: new THREE.Color('#b7c4b4').multiplyScalar(1.05) }, skyColor: { value: new THREE.Color('#8da39c') },
  fogColor: { value: new THREE.Color('#46524d') }, fogDensity: { value: .0027 }, ...extra });
export const hullVertex = 'varying vec3 hullPoint;void main(){vec4 world=modelMatrix*vec4(position,1.);hullPoint=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}';
// `declare` adds uniforms and helpers, `span` is the march length from the hull surface, `shade` sets sampleColor,
// `stop` is a condition on the sample point p that ends the march inside an opaque body.
export function marchedVolume({ name, geometry, uniforms, vertexShader = hullVertex, declare = '', field, span, dt, loop, shade, absorb, terrainCut = false, stop = '', renderOrder = 3 }) {
  const material = createShaderMaterial({ uniforms, vertexShader, transparent: true, depthWrite: false,
    fragmentShader: `uniform float time,steps,inside,flash,fogDensity;uniform vec3 origin,sunDirection,sunColor,skyColor,fogColor,flashPoint;varying vec3 hullPoint;
      ${volumeGLSL}
      ${opaqueDepthGLSL}
      ${declare}
      ${field}
      void main(){
        vec3 rayDir=normalize(hullPoint-cameraPosition);
        vec3 start=inside>.5?cameraPosition:hullPoint;
        float span=inside>.5?length(hullPoint-cameraPosition):(${span});
        if(opaqueDepthAvailable>.5){
          vec2 uv=gl_FragCoord.xy*opaqueInverseSize;
          float depth=texture2D(opaqueDepth,uv).x;
          if(depth<1.)span=min(span,dot(opaqueWorldPoint(uv,depth)-start,rayDir));
        }
        if(span<=0.)discard;
        // A per-pixel offset turns step slices into fine noise; it depends only on the pixel, so scrubbing stays exact.
        float dt=clamp(span/steps,${dt}),s=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)*dt;
        float alpha=0.,firstHit=-1.;vec3 col=vec3(0.);
        for(int i=0;i<${loop};i++){
          if(float(i)>=steps||alpha>.97||s>span)break;
          vec3 p=start+rayDir*s;
          ${terrainCut ? 'if(p.y<terrain(p.xz))break;' : ''}${stop ? `if(${stop})break;` : ''}
          vec3 f=field(p,true);
          if(f.x>.002){
            vec3 sampleColor;
            ${shade}
            float a=1.-exp(-f.x*dt*${absorb});
            col+=(1.-alpha)*a*sampleColor;alpha+=(1.-alpha)*a;
            if(firstHit<0.)firstHit=s;
            s+=dt;
          } else s+=dt*1.7;
        }
        if(alpha<.003)discard;
        float dist=length(start+rayDir*max(firstHit,0.)-cameraPosition);
        gl_FragColor=vec4(mix(col/alpha,fogColor,1.-exp(-fogDensity*fogDensity*dist*dist)),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = renderOrder; mesh.visible = false;
  return markEffect(mesh);
}
export function setInside(volume, inside) {
  volume.material.uniforms.inside.value = inside ? 1 : 0; volume.material.side = inside ? THREE.BackSide : THREE.FrontSide;
}
// Per-frame step budget and fog for one volume; the scene configuration wins over the factory's defaults.
export function volumeFrame(volume, t, steps, env, defaults) {
  const u = volume.material.uniforms;
  u.time.value = t; u.steps.value = steps;
  u.fogColor.value.set(env.fog ?? defaults.fog); u.fogDensity.value = (env.fogDensity ?? defaults.fogDensity) + ease(t / 30) * (env.fogGrowth ?? defaults.fogGrowth);
}
