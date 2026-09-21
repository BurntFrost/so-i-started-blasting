import * as THREE from 'three/webgpu';

// The offline migration harness visits every factory and captures its final program,
// including atlas augmentation. Runtime node rendering uses generated TSL only.
const materials = new Set();
export function recordSurface(material, descriptor) {
  Object.defineProperty(material, 'nodeSurface', {value: descriptor, configurable: true});
  return material;
}
export function createShaderMaterial(options) {
  const material = new THREE.ShaderMaterial(options);
  materials.add(material);
  material.addEventListener('dispose', () => materials.delete(material));
  return material;
}

export function shaderProgramKey(vertexShader, fragmentShader) {
  const text = vertexShader + '\n---fragment---\n' + fragmentShader;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function captureShaderPrograms() {
  const programs = new Map();
  for (const {vertexShader, fragmentShader, uniforms, defines, glslVersion} of materials) {
    const key = shaderProgramKey(vertexShader, fragmentShader);
    const previous = programs.get(key);
    if (previous && (previous.vertexShader !== vertexShader || previous.fragmentShader !== fragmentShader)) {
      throw new Error(`Shader identity collision: ${key}`);
    }
    programs.set(key, {key, vertexShader, fragmentShader, uniforms: Object.keys(uniforms), defines, glslVersion});
  }
  return [...programs.values()].sort((a, b) => a.key.localeCompare(b.key));
}
