import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeProgram } from '../tools/tsl-normalize.mjs';
import { generate, generateModule } from '../tools/tsl-generate.mjs';
import { generateRegistry, shaderProgramKey } from '../tools/tsl-registry.mjs';
import { programs, registryRecords, fieldSource } from '../tools/tsl-programs.mjs';

const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}';
const record = fragmentShader => ({ vertexShader, fragmentShader });

test('generation is deterministic, registry order independent, and runtime contains no compiler', () => {
  const first = generateRegistry(registryRecords);
  assert.equal(first, generateRegistry([...registryRecords].reverse()));
  assert.equal(first, generateRegistry([...registryRecords, registryRecords[0]]));
  assert.match(first, /export function createNodeFields\(/);
  assert.doesNotMatch(first, /addons\/transpiler|new Function|\beval\(|GLSLDecoder|TSLEncoder/);
  assert.equal(generateModule(programs), generateModule(programs));
});

test('check mode detects stale/missing artifacts without writing', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tsl-generation-'));
  const output = path.join(directory, 'node-fields.js');
  try {
    await assert.rejects(generate({ output, check: true }), /stale or missing/);
    await generate({ output }); await generate({ output, check: true });
    await writeFile(output, 'unchanged marker');
    await assert.rejects(generate({ output, check: true }), /stale or missing/);
    assert.equal(await readFile(output, 'utf8'), 'unchanged marker');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('key ignores collector labels/legacy keys, includes exact source and sorted defines', () => {
  const a = { ...registryRecords[0], defines: { A: 1, B: 2 } };
  assert.equal(shaderProgramKey(a), shaderProgramKey({ ...a, key: 'old', label: 'other', defines: { B: 2, A: 1 } }));
  assert.notEqual(shaderProgramKey(a), shaderProgramKey({ ...a, defines: { A: 2, B: 2 } }));
  assert.notEqual(shaderProgramKey(a), shaderProgramKey({ ...a, fragmentShader: a.fragmentShader + '\n' }));
  assert.equal(generateRegistry([registryRecords[0]]), generateRegistry([{ ...registryRecords[0], key: 'legacy' }]));
});

test('commas are preserved in explicit uniform/varying contracts', () => {
  const source = generateRegistry([{ vertexShader: 'varying vec2 a,b;void main(){a=uv;b=uv;gl_Position=vec4(position,1.);}',
    fragmentShader: 'uniform float time,opacity;varying vec2 a,b;void main(){gl_FragColor=vec4(a+b,time,opacity);}', uniforms: ['time', 'opacity'] }], []);
  assert.match(source, /"uniforms":\{"time":"float","opacity":"float"\}/);
  assert.match(source, /"varyings":\{"a":"vec2","b":"vec2"\}/);
  assert.throws(() => generateRegistry([{ ...record('uniform float time,opacity;void main(){gl_FragColor=vec4(time+opacity);}'), uniforms: ['time'] }]), /omit opacity/);
});

test('scope-aware renaming prevents TSL helper collisions and block leakage', () => {
  const input = { name: 'createProbe', source: 'float f(float p){float sub=1.;if(p>0.){float sub=2.;p+=sub;}return sub-p;}' };
  const generated = generateModule([input]);
  assert.doesNotMatch(generated, /const sub\b/);
  assert.match(generated, /shaderLocal\d+_sub/);
  assert.throws(() => generateModule([{ ...input, source: 'float f(float p){if(p>0.){float hidden=2.;}return hidden;}' }]), /unresolved identifier hidden/);
  assert.throws(() => generateModule([{ ...input, source: 'float f(){for(int i=0;i<3;i++){}return float(i);}' }]), /unresolved identifier i/);
});

test('captured helpers share per-factory output and sampler functions stay inline', () => {
  const generated = generateRegistry([record('uniform sampler2D atlas;varying vec2 vUv;void fallback(){gl_FragColor=texture2D(atlas,vUv);}void main(){fallback();gl_FragColor.a*=.5;}')], []);
  assert.match(generated, /const shaderOutput = property\('vec4'\)/);
  assert.match(generated, /shaderOutput\.a\.mulAssign/);
  assert.match(generated, /}, 'void' \);/);
  assert.doesNotMatch(generated, /sampler2D.*return:/);
  const pure = generateModule([{ name: 'createSample', source: 'vec4 sampleColor(sampler2D tex,vec2 uv){return texture2D(tex,uv);}' }]);
  assert.doesNotMatch(pure, /sampler2D.*return:/);
});

test('only opaqueDepth gets a single-evaluation bottom-left UV conversion', () => {
  const program = record('uniform sampler2D opaqueDepth,atlas;varying vec2 vUv;vec2 coords(){return vUv;}void main(){gl_FragColor=texture2D(opaqueDepth,coords())+texture2D(atlas,coords());}');
  const generated = generateRegistry([program], []);
  assert.match(generated, /\.sample\( shaderFunction\d+_offlineOpaqueDepthUv\( shaderFunction\d+_coords\(\)/);
  assert.match(generated, /\.sample\( shaderFunction\d+_coords\(\)/);
  assert.match(generated, /"opaqueDepthUv":"bottom-left-to-top-left"/);
});

test('invalid shader interfaces fail offline instead of silently disappearing', () => {
  for (const source of [
    'void main(){gl_FragColor=vec4(missing);}',
    'uniform float weights[3];void main(){gl_FragColor=vec4(1.);}',
    'void main(){gl_FragDepth=.5;gl_FragColor=vec4(1.);}',
    '#include <unknown_chunk>\nvoid main(){gl_FragColor=vec4(1.);}',
    'void main(){gl_FragColor=missingFunction();}'
  ]) assert.throws(() => generateRegistry([record(source)], []));
  assert.throws(() => generateRegistry([{ ...record('void main(){gl_FragColor=vec4(1.);}'), glslVersion: '300 es' }]), /version/);
  assert.throws(() => normalizeProgram({ name: 'createBad', source: 'uniform float x;float f(){return x;}' }), /explicit/);
});

test('signed literals avoid invalid Number methods; original hash and octave math remain', () => {
  const generated = generateModule([{ name: 'createNegative', source: 'float f(float x){return -.5+x;}' }]);
  assert.doesNotMatch(generated, /\.5\.add/);
  assert.match(generated, /add\( -0\.5,/);
  assert.match(fieldSource, /127\.1,311\.7,74\.7/);
  assert.match(fieldSource, /43758\.5453/);
  assert.match(fieldSource, /noise3\(p\)\*\.57\+noise3\(p\*2\.03\)\*\.28\+noise3\(p\*4\.11\)\*\.15/);
});

test('defines expand offline, and output chunks have an explicit adapter policy', () => {
  const source = generateRegistry([{ ...record('#if ENABLED\nvoid main(){gl_FragColor=vec4(1.);}\n#else\nvoid main(){gl_FragColor=vec4(0.);}\n#endif'), defines: { ENABLED: 1 } }], []);
  assert.doesNotMatch(source, /#if|#define/);
  const output = generateRegistry([record('void main(){gl_FragColor=vec4(1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}')], []);
  assert.match(output, /"outputChunks":\["tonemapping_fragment","colorspace_fragment"\]/);
});

test('locals snapshot bindings and each comma declarator owns storage', () => {
  const generated = generateRegistry([record('uniform vec3 origin;void main(){vec3 p=origin,q=origin;p.y+=.25;q+=vec3(.5);gl_FragColor=vec4(p+q,1.);}')], []);
  assert.match(generated, /_p = shaderInput\d+\.toVar\(\), shaderLocal\d+_q = shaderInput\d+\.toVar\(\)/);
  assert.match(generated, /_p\.y\.addAssign/);
  const parameter = generateModule([{ name: 'createParameter', source: 'float f(vec3 p){p.y+=.25;return p.y;}' }]);
  assert.match(parameter, /_p = shaderLocal\d+_p_immutable\.toVar\(\)/);
});

test('inline early returns lower to guarded continuations without shader Return nodes', () => {
  const { ast } = normalizeProgram({ name: 'createEarly', bindings: { x: 'float' },
    source: 'float f(){if(x<0.)return .25;float v=x;if(v<1.){v+=.5;return v;}v*=2.;return v;}' });
  const fn = ast.body[0];
  assert.equal(fn.layout, false);
  function returns(node) {
    return (node.isReturn ? 1 : 0) + Object.entries(node).reduce((count, [key, value]) => {
      if (key === 'parent' || key === 'linker') return count;
      return count + (Array.isArray(value) ? value : [value]).reduce((n, child) => n + (child?.isASTNode ? returns(child) : 0), 0);
    }, 0);
  }
  assert.equal(returns(fn), 1);
  assert.equal(fn.body.at(-1).isReturn, true);
  assert.throws(() => generateModule([{ name: 'createLoop', bindings: { x: 'float' },
    source: 'float f(){for(int i=0;i<3;i++){if(x>0.)return x;}return 0.;}' }]), /early return in For/);
});

test('all captured programs match the checked-in deterministic artifact', async () => {
  const records = JSON.parse(await readFile(new URL('../tools/tsl-captured-programs.json', import.meta.url), 'utf8'));
  assert.equal(records.length, 51);
  assert.equal(await readFile(new URL('../dist/node-fields.js', import.meta.url), 'utf8'), generateRegistry(records));
});
