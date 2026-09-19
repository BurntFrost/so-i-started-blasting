import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Fn, float, vec2, vec3, mix, step, smoothstep, reference, renderGroup,
  positionGeometry, positionLocal, normalGeometry, uv, varying, diffuseColor,
  materialEmissive, materialRoughness, materialNormal,
} from 'three/tsl';

// Native TSL equivalents of the existing value noise; all inputs are absolute-time or geometry.
export const surfaceNoise = Fn(([p]) => {
  const hash = q => q.dot(vec3(127.1,311.7,74.7)).sin().mul(43758.5453).fract();
  const i = p.floor().toVar(), f = p.fract().toVar();
  f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  const plane = z => mix(
    mix(hash(i.add(vec3(0,0,z))), hash(i.add(vec3(1,0,z))), f.x),
    mix(hash(i.add(vec3(0,1,z))), hash(i.add(vec3(1,1,z))), f.x), f.y);
  return mix(plane(0), plane(1), f.z);
});
export const surfaceFbm = Fn(([p]) => surfaceNoise(p).mul(.57)
  .add(surfaceNoise(p.mul(2.03)).mul(.28)).add(surfaceNoise(p.mul(4.11)).mul(.15)));
const lawnFbm = Fn(([p]) => surfaceNoise(p).mul(.53)
  .add(surfaceNoise(p.mul(2.03)).mul(.27)).add(surfaceNoise(p.mul(4.07)).mul(.13))
  .add(surfaceNoise(p.mul(8.11)).mul(.07)));

const required = Object.freeze({
  facade: {facadeGrid:'vec2', facadeSeed:'float'}, ocean: {waterTime:'float'}, wave: {waterTime:'float'},
  lawn: {fieldPlots:'float'}, terrain: {terrainTime:'float'},
  funnel: {funnelShape:'vec4', funnelLean:'vec2', funnelTime:'float'},
  mountain: {ashFall:'float'}, ice: {}, rock: {},
});
export const surfaceKinds = Object.freeze(Object.keys(required));

/** Record at the legacy patch site; does not replace the material or its WebGL behavior.
 * Uniform values must be the ORIGINAL {value} holders. For cloned facades, explicitly
 * attachSurface(clone, source.nodeSurface), since Material.clone does not copy this descriptor.
 */
export function attachSurface(material, {kind, uniforms = {}, billow = false}) {
  if (!Object.hasOwn(required, kind)) throw new Error(`Unknown surface kind: ${kind}`);
  for (const key of Object.keys(required[kind])) {
    if (!uniforms[key] || !('value' in uniforms[key])) throw new Error(`${kind} requires uniform ${key}`);
  }
  Object.defineProperty(material, 'nodeSurface', {value: {kind, uniforms, billow}, configurable:true});
  return material;
}

function configure(material, descriptor) {
  const {kind, uniforms, billow} = descriptor;
  const u = Object.fromEntries(Object.entries(required[kind]).map(([key,type]) =>
    [key, reference('value', type, uniforms[key]).setGroup(renderGroup)]));
  // Separate original geometry varyings from positionLocal, which billow/funnel displace.
  const p = varying(positionGeometry), tex = uv();
  let color = base => base, opacity = float(1);
  if (kind === 'facade') {
    const grid = tex.mul(u.facadeGrid), cell = grid.fract();
    const pane = step(.19,cell.x).mul(step(cell.x,.81)).mul(step(.18,cell.y)).mul(step(cell.y,.78));
    const side = step(.5,varying(normalGeometry).y.abs()).oneMinus();
    const lit = step(.68,grid.floor().dot(vec2(12.9898,78.233)).add(u.facadeSeed).sin().mul(43758.5453).fract());
    color = base => base.mul(mix(.5,1.35,pane.mul(side)));
    material.emissiveNode = materialEmissive.add(vec3(.8,.39,.13).mul(lit).mul(pane).mul(side).mul(.48));
  } else if (kind === 'ocean' || kind === 'wave') {
    const t = u.waterTime;
    const crest = surfaceFbm(p.mul(.16).add(vec3(t.mul(.15),0,0)));
    let foam;
    if (kind === 'wave') {
      const lip = smoothstep(.8,.99,tex.y);
      const lace = smoothstep(.52,.74,surfaceFbm(p.mul(vec3(.9,.32,.6)).add(vec3(0,t.mul(-2.5),0))))
        .mul(smoothstep(.35,.85,tex.y));
      const streak = tex.x.mul(210).add(crest.mul(11)).sin().mul(.5).add(.5).pow(8)
        .mul(smoothstep(.55,.9,tex.y)).mul(.32);
      foam = lip.mul(smoothstep(.3,.7,crest).mul(.4).add(.6)).add(lace.mul(.55)).add(streak).clamp(0,1);
      color = () => mix(vec3(.04,.15,.19),vec3(.1,.38,.4),smoothstep(.15,.95,tex.y));
      material.emissiveNode = materialEmissive.add(vec3(.05,.28,.26).mul(smoothstep(.55,.97,tex.y))
        .mul(foam.mul(.8).oneMinus()).mul(crest.mul(.4).add(.6)));
    } else {
      foam = smoothstep(.7,.85,surfaceFbm(p.mul(.12).add(vec3(t.mul(.1),t.mul(.05),0)))).mul(.14);
      color = base => mix(base,vec3(.15,.36,.4),smoothstep(.55,.8,crest).mul(.3));
    }
    const waterColor = color;
    color = base => mix(waterColor(base),vec3(.86,.93,.95),foam);
    material.roughnessNode = mix(materialRoughness,.92,foam);
    const coarse = vec3(surfaceNoise(p.mul(.3).add(vec3(t.mul(.2),0,0))).sub(.5),
      surfaceNoise(p.mul(.4).sub(vec3(0,t.mul(.15),0))).sub(.5),0).mul(.2);
    const fine = vec3(surfaceNoise(p.mul(1.3).add(vec3(0,t.mul(-1.2),0))).sub(.5),
      surfaceNoise(p.mul(1.1).add(vec3(t.mul(.9),0,0))).sub(.5),0).mul(.09);
    material.normalNode = materialNormal.add(coarse).add(fine).normalize();
  } else if (kind === 'lawn') {
    const meadow = lawnFbm(p.mul(.15)).add(.5);
    const plots = smoothstep(.56,.64,lawnFbm(p.mul(.021).add(vec3(3,0,7)))).mul(u.fieldPlots);
    const rows = smoothstep(.3,.7,p.x.mul(.28).add(lawnFbm(p.mul(.04)).mul(1.6)).fract()).mul(.2).add(.8);
    color = base => mix(base.mul(meadow),vec3(.2,.155,.11).mul(rows).mul(lawnFbm(p.mul(.4)).mul(.4).add(.7)),plots);
  } else if (kind === 'terrain') {
    const grain = surfaceFbm(p.mul(4).add(vec3(0,u.terrainTime.mul(-.15),0)));
    color = base => base.mul(mix(.38,1.4,grain));
    material.emissiveNode = materialEmissive.mul(smoothstep(.37,.78,grain)).mul(2);
    if (billow) material._surfacePosition = positionGeometry.mul(surfaceFbm(positionGeometry.mul(5)
      .add(vec3(0,u.terrainTime.mul(-.12),0))).mul(.25).add(.91));
  } else if (kind === 'funnel') {
    // Compute angle in the vertex stage, exactly like the old funnelUv varying.
    const angle = positionGeometry.z.atan(positionGeometry.x), height = positionGeometry.y.add(.5);
    const funnelUv = varying(vec2(angle,height));
    const shape = u.funnelShape, t = u.funnelTime, lean = u.funnelLean;
    const radius = mix(shape.x,shape.y,height.pow(shape.w)).mul(surfaceFbm(vec3(angle.cos().mul(1.5),
      angle.sin().mul(1.5),height.mul(6).sub(t.mul(1.3)))).mul(.35).add(.85));
    material._surfacePosition = vec3(angle.cos().mul(radius),height.mul(shape.z),angle.sin().mul(radius))
      .add(vec3(lean.x,0,lean.y).mul(height).mul(height));
    const spiral = funnelUv.x.add(funnelUv.y.mul(4)).add(t.mul(.5));
    const bands = surfaceFbm(vec3(spiral.cos().mul(2.2),spiral.sin().mul(2.2),funnelUv.y.mul(9).sub(t.mul(1.8))));
    color = base => base.mul(bands.mul(.8).add(.6));
    opacity = bands.mul(.55).add(.55).mul(smoothstep(0,.05,funnelUv.y)).mul(smoothstep(.88,1,funnelUv.y).oneMinus());
  } else if (kind === 'mountain') {
    color = base => mix(base,vec3(.34,.31,.29),u.ashFall);
  } else if (kind === 'ice') {
    const veins = surfaceFbm(p.mul(.11)), frost = smoothstep(.56,.66,veins);
    color = base => mix(base,vec3(.96,.98,1),frost.mul(.55));
    opacity = veins.mul(.5).add(.75);
    material.roughnessNode = materialRoughness.add(frost.mul(.5));
  } else if (kind === 'rock') {
    color = base => base.mul(surfaceFbm(p.mul(2.4)).mul(.65).add(.7));
    material.normalNode = materialNormal.add(vec3(surfaceNoise(p.mul(1.8)),surfaceNoise(p.zxy.mul(1.8)),
      surfaceNoise(p.yzx.mul(1.8))).sub(.5).mul(.42)).normalize();
  }
  // Patch after standard vertex/instance colors, matching <color_fragment> semantics.
  // In particular, full mountain ash must replace vertex colors, not be multiplied by them.
  material._surfaceDiffuse = Fn(() => {
    diffuseColor.rgb.assign(color(diffuseColor.rgb));
    diffuseColor.a.mulAssign(opacity);
  }, 'void');
  material.surfaceUniformNodes = u;
}

class SurfaceMaterial extends MeshStandardNodeMaterial {
  customProgramCacheKey() {
    return `${super.customProgramCacheKey()}:surface:${this.nodeSurface?.kind}:${this.nodeSurface?.billow}`;
  }
  setupPosition(builder) {
    // Match <begin_vertex>: deform local geometry BEFORE instance transforms.
    if (this._surfacePosition) positionLocal.assign(this._surfacePosition);
    return super.setupPosition(builder);
  }
  setupDiffuseColor(builder) {
    super.setupDiffuseColor(builder);
    this._surfaceDiffuse();
  }
  copy(source) {
    super.copy(source);
    if (source.nodeSurface) {
      attachSurface(this, source.nodeSurface);
      configure(this, this.nodeSurface);
    }
    return this;
  }
}

/** Call from the adapter and replace every mesh/material reference that must receive
 * subsequent CPU edits (opacity, color, emissiveIntensity, roughness, etc.). Uniform
 * holders stay shared with the source; regular material scalar properties are copied.
 * Never executes or translates onBeforeCompile. No GLSL/WGSL strings are embedded.
 */
export function createSurfaceMaterial(source) {
  if (!source.nodeSurface) throw new Error('attachSurface must run before createSurfaceMaterial');
  return new SurfaceMaterial().copy(source);
}
