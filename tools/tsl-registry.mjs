import GLSLDecoder from 'three/addons/transpiler/GLSLDecoder.js';
import { generateModule } from './tsl-emit.mjs';
import { programs } from './tsl-programs.mjs';

// This exact function is emitted into the runtime module. Source text is only
// hashed there, never parsed. Both 32-bit lanes use defined JS integer arithmetic.
export function shaderProgramKey({ vertexShader, fragmentShader, defines = {} }) {
  const source = JSON.stringify([vertexShader, fragmentShader, Object.keys(defines).sort().map(key => [key, defines[key]])]);
  let a = 2166136261, b = 2246822507;
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 3266489909);
  }
  return 'tsl1_' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

const builtins = {
  position: 'vec3', normal: 'vec3', uv: 'vec2', uv1: 'vec2', color: 'vec3',
  modelMatrix: 'mat4', modelViewMatrix: 'mat4', projectionMatrix: 'mat4', viewMatrix: 'mat4',
  normalMatrix: 'mat3', cameraPosition: 'vec3', instanceMatrix: 'mat4',
  gl_FragCoord: 'vec4', gl_PointCoord: 'vec2', gl_PointSize: 'float', gl_FrontFacing: 'bool'
};

function stageProgram(record, stage, id) {
  const original = record[`${stage}Shader`];
  if (typeof original !== 'string' || !original.trim()) throw new Error(`${id}: missing ${stage} source`);
  let source = original.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const outputChunks = [];
  source = source.replace(/#include\s*<([^>]+)>/g, (_, chunk) => {
    if (!['tonemapping_fragment', 'colorspace_fragment'].includes(chunk) || stage !== 'fragment') {
      throw new Error(`${id}: unsupported shader chunk ${chunk}`);
    }
    outputChunks.push(chunk);
    return '';
  });
  // Includes/extensions/version directives cannot be silently discarded by the decoder.
  if (/^\s*#(?!\s*(?:define|undef|ifdef|ifndef|if|elif|else|endif)\b)/m.test(source)) throw new Error(`${id}: unsupported preprocessor directive`);
  const prefix = Object.entries(record.defines || {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
    if (!/^[A-Za-z_]\w*$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || /[\r\n#]/.test(String(value))) throw new Error(`${id}: invalid define ${key}`);
    return value === false ? '' : `#define ${key} ${value === true ? 1 : value}`;
  }).join('\n');
  source = new GLSLDecoder().preprocess(`${prefix}\n${source}`);
  const contract = { uniforms: {}, attributes: {}, varyings: {}, builtins: {} };
  const bindings = {};
  for (const [, kind, type, list] of source.matchAll(/\b(uniform|attribute|varying)\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+([^;]+);/g)) {
    const category = { uniform: 'uniforms', attribute: 'attributes', varying: 'varyings' }[kind];
    for (const value of list.split(',')) {
      const key = value.trim();
      if (!/^[A-Za-z]\w*$/.test(key) || Object.hasOwn(bindings, key)) throw new Error(`${id}: unsupported/duplicate declaration ${key}`);
      bindings[key] = type; contract[category][key] = type;
      if (kind === 'uniform' && record.uniforms && !record.uniforms.includes(key)) throw new Error(`${id}: captured uniforms omit ${key}`);
    }
  }
  for (const [key, type] of Object.entries(builtins)) {
    if (!Object.hasOwn(bindings, key) && new RegExp(`\\b${key}\\b`).test(source)) {
      bindings[key] = type;
      contract[['position', 'normal', 'uv', 'uv1', 'color'].includes(key) ? 'attributes' : 'builtins'][key] = type;
    }
  }
  return { definition: { name: `create_${id}_${stage}`, source, stage, bindings, flipOpaqueDepthUv: true }, contract, outputChunks };
}

export function generateRegistry(records, definitions = programs) {
  const seen = new Map(), stages = [], entries = [];
  for (const record of [...records].sort((a, b) => shaderProgramKey(a).localeCompare(shaderProgramKey(b)))) {
    const id = shaderProgramKey(record);
    const identity = JSON.stringify([record.vertexShader, record.fragmentShader, Object.entries(record.defines || {}).sort()]);
    if (seen.has(id)) {
      if (seen.get(id) !== identity) throw new Error(`Shader key collision: ${id}`);
      continue;
    }
    if (record.glslVersion != null) throw new Error(`${id}: GLSL version overrides need an explicit port`);
    seen.set(id, identity);
    const vertex = stageProgram(record, 'vertex', id), fragment = stageProgram(record, 'fragment', id);
    for (const [key, type] of Object.entries(fragment.contract.varyings)) {
      if (vertex.contract.varyings[key] !== type) throw new Error(`${id}: varying ${key} does not match its vertex declaration`);
    }
    stages.push(vertex.definition, fragment.definition);
    const metadata = { vertex: vertex.contract, fragment: fragment.contract, outputChunks: fragment.outputChunks, opaqueDepthUv: 'bottom-left-to-top-left' };
    entries.push(`  ${JSON.stringify(id)}: {
    interface: ${JSON.stringify(metadata)},
    createProgram(bindings) {
      const vertex = ${vertex.definition.name}(shaderBindings(this.interface.vertex, bindings));
      const fragment = ${fragment.definition.name}(shaderBindings(this.interface.fragment, bindings));
      return { vertex: vertex.main, fragment: fragment.main };
    }
  }`);
  }
  return generateModule([...definitions, ...stages]) + `
// Native adapters supply these nodes; no shader text is interpreted here.
export ${shaderProgramKey.toString()}

function shaderBindings(contract, bindings) {
  const result = {};
  for (const [category, entries] of Object.entries(contract)) {
    for (const key of Object.keys(entries)) {
      const value = bindings[category]?.[key];
      if (!value?.isNode) throw new Error('Missing TSL node binding: ' + category + '.' + key);
      result[key] = value;
    }
  }
  return result;
}

export const nodePrograms = {
${entries.join(',\n')}
};

export function getProgram(options) {
  const key = shaderProgramKey(options);
  const entry = nodePrograms[key];
  if (!entry) throw new Error('Uncompiled shader program: ' + key);
  return entry;
}
`;
}
