import { WebGPURenderer, PMREMGenerator } from 'three/webgpu';
import { createNodePipeline } from './node-pipeline.js';
import { createNodeMaterialAdapter } from './node-materials.js';
import { installNodeSunShadows } from './node-shadows.js';

export async function createNodeRuntime(canvas, forceWebGL = false) {
  const renderer = new WebGPURenderer({canvas,forceWebGL,antialias:false,powerPreference:'high-performance'});
  await renderer.init();
  canvas.dataset.backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
  return {renderer,PMREMGenerator,createNodePipeline,createNodeMaterialAdapter,installNodeSunShadows};
}
