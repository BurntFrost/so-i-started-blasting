import {
  ACESFilmicToneMapping, AgXToneMapping, Color, DepthTexture, FloatType,
  HalfFloatType, Layers, LinearSRGBColorSpace, NoBlending, NoToneMapping,
  NodeMaterial, RenderPipeline, RenderTarget, RendererUtils, SRGBColorSpace,
  Vector2, Vector3, Vector4
} from 'three/webgpu';
import {
  Fn, If, Loop, float, vec2, vec3, vec4, mix, uniform, reference, texture, uv,
  normalView, getViewPosition, pass, rtt, renderOutput, screenCoordinate
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { opaqueDepthUniforms } from './render-kit.js';
import { defaultGrade } from './scene-config.js';

// These constants are A5's spatial kernel, not time-dependent sampling offsets.
export const SHAFT_STEPS = Object.freeze([1 / 6, 1 / 36, 1 / 216]);

export function shaftMaskNode(source, emitter) {
  return Fn(() => {
    const p = uv(), c = source.sample(p).rgb;
    const bright = c.r.max(c.g).max(c.b);
    const gate = float(1).sub(p.distance(emitter).smoothstep(.12, .35));
    return vec4(c.mul(bright.sub(1.1).max(0).div(bright.max(.001))).mul(gate), 1);
  })();
}

export function shaftBlurNode(source, emitter, stepSize) {
  return Fn(() => {
    const p = uv(), delta = emitter.sub(p), distance = delta.length();
    const step = delta.div(distance.max(.00001)).mul(stepSize);
    const sum = vec3(0).toVar();
    Loop(6, ({ i }) => {
      const offset = float(i).mul(stepSize), q = p.add(step.mul(float(i)));
      If(offset.lessThanEqual(distance).and(q.greaterThanEqual(vec2(0)).all()).and(q.lessThanEqual(vec2(1)).all()), () => {
        // Explicit LOD keeps the guarded sample valid in WebGPU's non-uniform control flow.
        sum.addAssign(source.sample(q).level(0).rgb);
      });
    });
    return vec4(sum.div(6), 1);
  })();
}

function filmNode(source, u) {
  return Fn(() => {
    const p = uv(), offset = p.sub(.5).mul(u.aberration);
    const base = source.sample(p);
    const color = vec3(source.sample(p.add(offset).clamp(0, 1)).r, base.g, source.sample(p.sub(offset).clamp(0, 1)).b).toVar();
    const luma = color.dot(vec3(.2126, .7152, .0722));
    color.assign(mix(vec3(luma), color, u.saturation).mul(u.tint));
    color.mulAssign(float(1).sub(p.sub(.5).dot(p.sub(.5)).smoothstep(.12, .65).mul(.12)));
    // Match the existing bottom-left gl_FragCoord hash on either backend.
    const pixel = vec2(screenCoordinate.x, u.size.y.sub(screenCoordinate.y));
    const noise = pixel.add(vec2(17.13, 91.7).mul(u.frame)).dot(vec2(12.9898, 78.233)).sin().mul(43758.5453).fract();
    color.addAssign(noise.sub(.5).mul(u.grain));
    return vec4(color.clamp(0, 1), base.a);
  })();
}

// A fixed bilateral filter instead of a temporally jittered denoiser. Normal/depth
// weights keep AO off the sky and stop it bleeding across foreground silhouettes.
function filteredAO(source, depth, normals, inverseProjection, size) {
  return Fn(() => {
    const p = uv(), centerDepth = depth.sample(p).r;
    const result = float(1).toVar();
    If(centerDepth.lessThan(1), () => {
      const z = getViewPosition(p, centerDepth, inverseProjection).z;
      const normal = normals.sample(p).rgb.normalize();
      const total = float(0).toVar(), weightSum = float(0).toVar();
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        const q = p.add(vec2(x, y).div(size)).clamp(0, 1);
        // r186 GLSL explicit-LOD depth sampling incorrectly returns vec4.
        // Depth has no mip chain; ordinary sampling is equivalent here.
        const d = depth.sample(q).r;
        If(d.lessThan(1), () => {
          const dz = getViewPosition(q, d, inverseProjection).z.sub(z).abs();
          const weight = dz.mul(-1).exp().mul(normal.dot(normals.sample(q).level(0).rgb.normalize()).max(0).pow(8));
          total.addAssign(source.sample(q).level(0).r.mul(weight));
          weightSum.addAssign(weight);
        });
      }
      result.assign(total.div(weightSum.max(.00001)));
    });
    return result;
  })();
}

// Beauty already includes fog. Fade post AO with the same view-depth fog factor
// so occlusion cannot draw dark roof silhouettes over fully fogged surfaces.
export function fogAwareAO(occlusion, viewDepth, fog) {
  return Fn(() => {
    const visibility = float(1).toVar();
    If(fog.mode.equal(1), () => {
      visibility.assign(viewDepth.mul(fog.density).pow(2).negate().exp());
    }).ElseIf(fog.mode.equal(2), () => {
      visibility.assign(viewDepth.smoothstep(fog.near, fog.far).oneMinus());
    });
    return mix(float(1), occlusion, visibility);
  })();
}

// Preserve the source's geometry deformation and alpha cuts in the prepass. A
// blanket override material would lose custom vertex/normal/mask node programs.
const surfaceProperties = [
  'side', 'flatShading', 'vertexColors', 'opacity', 'alphaTest', 'alphaHash',
  'map', 'alphaMap', 'normalMap', 'normalMapType', 'normalScale', 'bumpMap', 'bumpScale',
  'displacementMap', 'displacementScale', 'displacementBias', 'clippingPlanes', 'clipIntersection',
  'positionNode', 'vertexNode', 'geometryNode', 'normalNode', 'colorNode', 'opacityNode',
  'alphaTestNode', 'maskNode', 'depthNode'
];

/**
 * r186 WebGPURenderer pipeline, including its forceWebGL backend. Call after init().
 * setSize takes physical pixels; setQuality takes cinema's tier object.
 * update takes bottom-left shaft UVs and FINAL (envelope/edge-faded) strength.
 * grade.ssr enables reflections on layer-0 objects tagged userData.ssrReceiver.
 * Shared depth.nodes uses native top-left UVs (screenUV), not gl_FragCoord UVs.
 * Conventional perspective depth is required by r186's GTAO/SSR addons.
 */
export function createNodePipeline({ renderer, scene, camera, canvas, depth = opaqueDepthUniforms(canvas) }) {
  if (renderer.logarithmicDepthBuffer || renderer.reversedDepthBuffer) {
    throw new Error('Node pipeline requires conventional depth for r186 GTAO/SSR.');
  }
  const normalTarget = new RenderTarget(1, 1, { type: HalfFloatType, samples: 0 });
  normalTarget.texture.name = 'Cinema_opaqueNormalsAndSSRMask';
  normalTarget.depthTexture = new DepthTexture(1, 1, FloatType);
  normalTarget.depthTexture.isRenderTargetTexture = true;
  const depthTexture = texture(normalTarget.depthTexture), normals = texture(normalTarget.texture);
  const inverseProjection = reference('value', 'mat4', depth.opaqueProjectionInverse);
  const worldMatrix = reference('value', 'mat4', depth.opaqueCameraWorld);
  const depthNodes = {
    texture: depthTexture,
    available: reference('value', 'float', depth.opaqueDepthAvailable),
    inverseSize: reference('value', 'vec2', depth.opaqueInverseSize),
    near: reference('value', 'float', depth.opaqueNear),
    far: reference('value', 'float', depth.opaqueFar),
    viewPosition: Fn(([p]) => getViewPosition(p, depthTexture.sample(p).r, inverseProjection)),
    worldPosition: Fn(([p]) => worldMatrix.mul(vec4(getViewPosition(p, depthTexture.sample(p).r, inverseProjection), 1)).xyz)
  };
  depth.opaqueDepth.value = normalTarget.depthTexture;
  depth.opaqueDepthAvailable.value = 0;
  depth.nodes = depthNodes;

  const u = {
    size: uniform(new Vector2(1, 1)), emitter: uniform(new Vector2(.5, .5)), strength: uniform(0),
    frame: uniform(0), tint: uniform(new Vector3(1, 1, 1)), saturation: uniform(.94),
    grain: uniform(.012), aberration: uniform(.0012), exposure: uniform(1.6),
    bloomStrength: uniform(.48), bloomRadius: uniform(.65), bloomThreshold: uniform(1.1)
  };
  for (const [name, node] of Object.entries(u)) node.setName(`cinema_${name}`);
  const fog = { mode: uniform(0), density: uniform(0), near: uniform(1), far: uniform(1000) };
  const receiver = uniform(0).onObjectUpdate(({ object }) => object.userData.ssrReceiver === true ? 1 : 0);
  const normalMaterials = new Map();
  function renderOpaque(object, sceneArg, cameraArg, geometry, material, ...rest) {
    if (!object.isMesh || object.layers.isEnabled(1)) return;
    let normalMaterial = normalMaterials.get(material);
    if (!normalMaterial) {
      normalMaterial = material.isNodeMaterial ? material.clone() : new NodeMaterial();
      normalMaterial.name = 'Cinema_opaqueSurface';
      normalMaterial.color = new Color(1, 1, 1);
      normalMaterial.fragmentNode = null;
      normalMaterial.outputNode = vec4(normalView, receiver);
      normalMaterial.lights = false;
      normalMaterial.transparent = false;
      normalMaterial.depthWrite = true;
      normalMaterial.blending = NoBlending;
      normalMaterial.toneMapped = false;
      normalMaterial.fog = false;
      normalMaterials.set(material, normalMaterial);
    }
    for (const property of surfaceProperties) {
      if (material[property] !== undefined) normalMaterial[property] = material[property];
    }
    if (normalMaterial.userData.sourceVersion !== material.version) {
      normalMaterial.userData.sourceVersion = material.version;
      normalMaterial.needsUpdate = true;
    }
    renderer.renderObject(object, sceneArg, cameraArg, geometry, normalMaterial, ...rest);
  }

  let tier = { name: 'HIGH', ao: true, aoScale: 1, bloom: true, film: true };
  let grade = defaultGrade, hasShaft = false, disposed = false, graph = null;
  const drawingSize = new Vector2();
  const viewport = new Vector4(), scissor = new Vector4();

  function buildGraph() {
    if (graph) for (const resource of [...graph.resources].reverse()) resource.dispose();
    const resources = [], sized = [];
    const own = node => { resources.push(node); return node; };
    const toTexture = (node, name, quarter = false) => {
      const target = own(rtt(node, 1, 1, { depthBuffer: false, type: HalfFloatType }));
      // Texture node names are emitted verbatim as shader identifiers.
      target.name = name.replace(/[^a-zA-Z0-9_]/g, '_');
      sized.push({ node: target, quarter });
      return target;
    };
    const scenePass = own(pass(scene, camera, { samples: 0 }));
    scenePass.name = 'Cinema_HDR';
    const layers = new Layers(); layers.enable(1); scenePass.setLayers(layers);
    const color = scenePass.getTextureNode();
    let current = color;
    let gtao = null, reflection = null, bloomPass = null;
    if (tier.ao) {
      gtao = own(ao(depthTexture, normals, camera));
      gtao.radius.value = 6; gtao.thickness.value = 1; gtao.scale.value = 1;
      gtao.samples.value = 16; gtao.useTemporalFiltering = false;
      gtao.resolutionScale = tier.aoScale;
      const occlusion = filteredAO(gtao.getTextureNode(), depthTexture, normals, inverseProjection, u.size);
      const viewDepth = getViewPosition(uv(), depthTexture.sample(uv()).r, inverseProjection).z.negate().max(0);
      current = toTexture(vec4(color.rgb.mul(fogAwareAO(occlusion, viewDepth, fog)), color.a), 'Cinema_GTAO');
    }
    if (tier.ao && grade.ssr === true) {
      reflection = own(ssr(current, depthTexture, normals, {
        camera, stochastic: false, metalnessNode: normals.a, reflectNonMetals: false,
        roughnessNode: float(.32), binaryRefine: true
      }));
      reflection.resolutionScale = .5;
      reflection.maxDistance.value = 180; reflection.thickness.value = 1;
      reflection.intensity.value = .25; reflection.quality.value = .5;
      current = toTexture(vec4(current.rgb.add(reflection.rgb.mul(normals.a)), current.a), 'Cinema_oceanSSR');
    }
    if (tier.ao && hasShaft) {
      let shafts = toTexture(shaftMaskNode(current, u.emitter), 'Cinema_shaftMask', true);
      for (const step of SHAFT_STEPS) shafts = toTexture(shaftBlurNode(shafts, u.emitter, step), `Cinema_shaftBlur.${step}`, true);
      current = toTexture(vec4(current.rgb.add(shafts.rgb.mul(u.strength)), current.a), 'Cinema_shaftCombine');
    }
    if (tier.bloom) {
      bloomPass = own(bloom(current, u.bloomStrength, u.bloomRadius, u.bloomThreshold));
      current = vec4(current.rgb.add(bloomPass.rgb), current.a);
    }
    const mapping = tier.film ? AgXToneMapping : ACESFilmicToneMapping;
    // Explicit exposure node avoids relying on mutable renderer exposure state.
    const mapped = vec4(current.rgb.toneMapping(mapping, u.exposure).rgb, current.a);
    current = renderOutput(mapped, NoToneMapping, SRGBColorSpace);
    if (tier.bloom) {
      current = toTexture(current, 'Cinema_output');
      current = own(fxaa(current));
    }
    if (tier.film) current = filmNode(toTexture(current, 'Cinema_FXAA'), u);
    const pipeline = own(new RenderPipeline(renderer, current));
    pipeline.outputColorTransform = false;
    graph = { pipeline, resources, sized, scenePass, gtao, bloomPass, reflection };
    resizeGraph();
  }

  function resizeGraph() {
    if (!graph) return;
    const { x: w, y: h } = u.size.value;
    graph.scenePass.setSize(w, h);
    graph.gtao?.setSize(w, h);
    for (const { node, quarter } of graph.sized) node.setSize(quarter ? Math.ceil(w / 4) : w, quarter ? Math.ceil(h / 4) : h);
    if (graph.bloomPass) {
      const dpr = renderer.getPixelRatio();
      // BloomNode starts its mip chain at half size, like UnrealBloomPass.
      const scale = tier.name === 'BALANCED' ? .55 / dpr : tier.name === 'ULTRA' ? 1.2 / dpr : 1;
      graph.bloomPass.setResolutionScale(scale * .5);
    }
  }

  function setSize(width, height) {
    if (disposed) return;
    const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height));
    u.size.value.set(w, h);
    normalTarget.setSize(w, h);
    depth.opaqueInverseSize.value.set(1 / w, 1 / h);
    depth.opaqueDepthAvailable.value = 0;
    resizeGraph();
  }

  function setQuality(next) {
    if (disposed) return;
    const changed = tier.name !== next.name || tier.ao !== next.ao || tier.bloom !== next.bloom || tier.film !== next.film || tier.aoScale !== (next.aoScale ?? 1);
    tier = { name: next.name, ao: Boolean(next.ao), aoScale: next.aoScale ?? 1, bloom: Boolean(next.bloom), film: Boolean(next.film) };
    u.exposure.value = tier.film ? grade.exposure : 1.3;
    depth.opaqueDepthAvailable.value = 0;
    if (changed) buildGraph();
  }

  function update(time, nextGrade = defaultGrade, shaftUV = null, strength = 0) {
    if (disposed) return;
    const nextShaft = shaftUV !== null && Number.isFinite(strength) && strength > 0;
    const changed = nextShaft !== hasShaft || (nextGrade.ssr === true) !== (grade.ssr === true);
    grade = { ...defaultGrade, ...nextGrade }; hasShaft = nextShaft;
    if (shaftUV) u.emitter.value.set(shaftUV.x, 1 - shaftUV.y);
    u.strength.value = nextShaft ? strength : 0;
    u.frame.value = Math.floor(time * 24); u.tint.value.fromArray(grade.tint);
    u.saturation.value = grade.saturation; u.grain.value = grade.grain; u.aberration.value = grade.aberration;
    u.exposure.value = tier.film ? grade.exposure : 1.3;
    u.bloomStrength.value = grade.bloomStrength; u.bloomRadius.value = grade.bloomRadius; u.bloomThreshold.value = grade.bloomThreshold;
    if (changed) buildGraph();
  }

  function render() {
    if (disposed) return;
    renderer.getDrawingBufferSize(drawingSize);
    if (!drawingSize.equals(u.size.value)) setSize(drawingSize.x, drawingSize.y);
    const state = RendererUtils.saveRendererAndSceneState(renderer, scene);
    const mask = camera.layers.mask, lighting = renderer.lighting.enabled;
    const extra = {
      xr: renderer.xr.enabled, context: renderer.contextNode, sceneName: scene.name,
      opaque: renderer.opaque, transparent: renderer.transparent,
      color: renderer.autoClearColor, depth: renderer.autoClearDepth, stencil: renderer.autoClearStencil
    };
    renderer.getViewport(viewport); renderer.getScissor(scissor);
    depth.opaqueDepthAvailable.value = 0;
    try {
      fog.mode.value = scene.fog?.isFogExp2 ? 1 : scene.fog?.isFog ? 2 : 0;
      fog.density.value = scene.fog?.density ?? 0;
      fog.near.value = scene.fog?.near ?? 1;
      fog.far.value = scene.fog?.far ?? 1000;
      // Set coordinate system before updating the matrices published to effects.
      if (camera.coordinateSystem !== renderer.coordinateSystem) {
        camera.coordinateSystem = renderer.coordinateSystem; camera.updateProjectionMatrix();
      }
      camera.updateWorldMatrix(true, false);
      depth.opaqueProjectionInverse.value.copy(camera.projectionMatrixInverse);
      depth.opaqueCameraWorld.value.copy(camera.matrixWorld);
      depth.opaqueNear.value = camera.near; depth.opaqueFar.value = camera.far;
      if (tier.ao) {
        scene.background = null; scene.backgroundNode = null; scene.overrideMaterial = null;
        camera.layers.set(0); renderer.lighting.enabled = false; renderer.xr.enabled = false;
        renderer.toneMapping = NoToneMapping; renderer.outputColorSpace = LinearSRGBColorSpace;
        renderer.setMRT(null); renderer.setRenderObjectFunction(renderOpaque);
        renderer.autoClear = true; renderer.autoClearColor = true; renderer.autoClearDepth = true;
        renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(normalTarget);
        renderer.render(scene, camera);
        depth.opaqueDepthAvailable.value = 1;
        RendererUtils.restoreRendererAndSceneState(renderer, scene, state);
        camera.layers.mask = mask; renderer.lighting.enabled = lighting;
        renderer.autoClearColor = extra.color; renderer.autoClearDepth = extra.depth;
      }
      graph.pipeline.render();
    } catch (error) {
      depth.opaqueDepthAvailable.value = 0;
      throw error;
    } finally {
      RendererUtils.restoreRendererAndSceneState(renderer, scene, state);
      camera.layers.mask = mask; renderer.lighting.enabled = lighting; renderer.xr.enabled = extra.xr;
      renderer.contextNode = extra.context; renderer.opaque = extra.opaque; renderer.transparent = extra.transparent;
      renderer.autoClearColor = extra.color; renderer.autoClearDepth = extra.depth; renderer.autoClearStencil = extra.stencil;
      renderer.setViewport(viewport); renderer.setScissor(scissor); scene.name = extra.sceneName;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const resource of [...graph.resources].reverse()) resource.dispose();
    for (const material of normalMaterials.values()) material.dispose();
    normalMaterials.clear(); normalTarget.dispose();
    if (depth.nodes === depthNodes) {
      depth.opaqueDepth.value = null; depth.opaqueDepthAvailable.value = 0;
      delete depth.nodes;
    }
  }

  buildGraph();
  return { render, setSize, setQuality, update, dispose };
}
