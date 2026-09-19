import { REVISION } from 'three/webgpu';

// Pin the decoder/AST contract as well as the renderer. C1 owns the dependency bump.
if (REVISION !== '186') throw new Error(`Offline TSL generation requires Three.js r186; found r${REVISION}.`);
const { default: GLSLDecoder } = await import('three/addons/transpiler/GLSLDecoder.js');
const { FunctionCall, FunctionDeclaration, FunctionParameter, Number: Literal, Return, Accessor, Operator, VariableDeclaration, Conditional, Unary } = await import('three/addons/transpiler/AST.js');

const valueTypes = new Set('void bool int uint float vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D'.split(' '));
const builtinCalls = new Set(('abs acos acosh all any asin asinh atan atanh ceil clamp cos cosh cross degrees distance dot equal notEqual lessThan lessThanEqual greaterThan greaterThanEqual exp exp2 floor fract fwidth inverse inverseSqrt length log log2 max min mix mod normalize pow radians reflect refract round sign sin sinh smoothstep sqrt step tan tanh transpose trunc dFdx dFdy texture2D textureLod texelFetch').split(' '));
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;

// Only the checked-in subset is accepted. In particular, Three's decoder silently
// drops some legacy declarations; validate those BEFORE decoding, not afterwards.
export function normalizeProgram({ name, source, bindings = {}, stage, exports: names, inlineFunctions = [], flipOpaqueDepthUv = false }) {
  if (!identifier.test(name)) throw new Error('Invalid factory name');
  if (stage && !['vertex', 'fragment'].includes(stage)) throw new Error(`${name}: invalid shader stage`);
  let text = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  if (/#|\bgl_FragData\b|\bgl_FragDepth\b/.test(text)) throw new Error(`${name}: unsupported directive or depth/MRT output`);
  const bindingNames = Object.keys(bindings);
  for (const key of bindingNames) {
    if (!identifier.test(key) || !valueTypes.has(bindings[key])) throw new Error(`${name}: invalid binding ${key}`);
  }
  const declared = new Set();
  text = text.replace(/\b(uniform|attribute|varying)\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+([^;]+);/g, (_, kind, type, list) => {
    for (const token of list.split(',')) {
      const key = token.trim();
      if (!identifier.test(key) || declared.has(key) || bindings[key] !== type) {
        throw new Error(`${name}: ${kind} ${key} requires one matching explicit ${type} binding`);
      }
      declared.add(key);
    }
    return '';
  });
  if (/\b(uniform|attribute|varying|precision|layout|struct)\b/.test(text)) throw new Error(`${name}: unsupported declaration`);
  const decoder = new GLSLDecoder();
  decoder.keywords = []; // gl_FragCoord must be an adapter input, never an implicit polyfill.
  const ast = decoder.parse(text);
  // r186 emits `-.5.add(node)` for a unary numeric left operand. Treat signed
  // literals as literals so its existing numeric/operator path emits add(-.5,node).
  function signedLiterals(node) {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'linker') continue;
      if (Array.isArray(value)) node[key] = value.map(child => child?.isASTNode ? signedLiterals(child) : child);
      else if (value?.isASTNode) node[key] = signedLiterals(value);
    }
    if (node.isUnary && ['+', '-'].includes(node.type) && node.expression.isNumber) {
      return new Literal(String(Number(node.expression.value) * (node.type === '-' ? -1 : 1)), node.expression.type);
    }
    return node;
  }
  signedLiterals(ast);
  if (flipOpaqueDepthUv) {
    let used = false;
    const helperName = 'offlineOpaqueDepthUv';
    if (ast.body.some(node => node.name === helperName)) throw new Error(`${name}: reserved function ${helperName}`);
    function flip(node) {
      if (node.isFunctionCall && node.name === 'texture2D' && node.params[0]?.property === 'opaqueDepth') {
        node.params[1] = new FunctionCall(helperName, [node.params[1]]);
        used = true;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'parent' || key === 'linker') continue;
        for (const child of Array.isArray(value) ? value : [value]) if (child?.isASTNode) flip(child);
      }
    }
    flip(ast);
    if (used) ast.body.unshift(new FunctionDeclaration('vec2', helperName, [new FunctionParameter('vec2', 'coord')], [
      new Return(new FunctionCall('vec2', [new Accessor('coord.x'), new Operator('-', new Literal('1.', 'float'), new Accessor('coord.y'))]))
    ]));
  }
  const functions = ast.body.filter(node => !node.isComment);
  if (functions.some(node => !node.isFunctionDeclaration)) throw new Error(`${name}: only functions are allowed at module scope`);
  const functionNames = new Map();
  functions.forEach((fn, i) => {
    if (functionNames.has(fn.name)) throw new Error(`${name}: overloaded/duplicate function ${fn.name}`);
    functionNames.set(fn.name, `shaderFunction${i}_${fn.name}`);
  });
  const exported = names || (stage ? ['main'] : [...functionNames.keys()]);
  for (const key of [...exported, ...inlineFunctions]) {
    if (!functionNames.has(key)) throw new Error(`${name}: unknown function ${key}`);
  }
  if (new Set(exported).size !== exported.length) throw new Error(`${name}: duplicate export`);
  let output;
  if (stage) {
    const main = functions.find(fn => fn.name === 'main');
    if (!main || main.type !== 'void' || main.params.length) throw new Error(`${name}: expected void main()`);
    output = stage === 'vertex' ? 'gl_Position' : 'gl_FragColor';
    if (bindings[output]) throw new Error(`${name}: ${output} is the entry result, not a binding`);
    main.type = 'vec4';
    // Helpers such as particleFallback() also write gl_FragColor. A per-factory
    // property lets them share the entry result without leaking it between materials.
    main.body.unshift(new Operator('=', new Accessor(output), new FunctionCall('vec4', [new Literal('0.', 'float')])));
    const returnOutput = node => {
      if (node.isReturn && node.value === null) node.value = new Accessor(output);
      for (const [key, value] of Object.entries(node)) {
        if (key === 'parent' || key === 'linker') continue;
        if (Array.isArray(value)) value.forEach(child => child?.isASTNode && returnOutput(child));
        else if (value?.isASTNode) returnOutput(value);
      }
    };
    main.body.forEach(returnOutput);
    main.body.push(new Return(new Accessor(output)));
  }

  // Rename every declaration, not only today's collisions. Unique names also keep
  // the upstream linker's function-wide lookup from conflating nested GLSL scopes.
  let serial = 0;
  const inputs = new Map(bindingNames.map((key, i) => [key, `shaderInput${i}`]));
  const root = new Map(inputs);
  if (output) root.set(output, 'shaderOutput');
  function lookup(scope, key) {
    if (!scope.has(key)) throw new Error(`${name}: unresolved identifier ${key}; supply an explicit binding`);
    return scope.get(key);
  }
  function declare(node, scope) {
    if (!valueTypes.has(node.type)) throw new Error(`${name}: unsupported type ${node.type}`);
    const old = node.name;
    node.name = `shaderLocal${serial++}_${old}`;
    scope.set(old, node.name);
  }
  function visit(node, scope) {
    if (!node?.isASTNode) return;
    if (node.isVariableDeclaration) {
      if (node.value?.isAccessor && ['true', 'false'].includes(node.value.property)) node.value = new FunctionCall('bool', [node.value]);
      visit(node.value, scope);
      declare(node, scope);
      visit(node.next, scope);
      return;
    }
    if (node.isAccessor) {
      if (['true', 'false'].includes(node.property)) return;
      const [base, ...members] = node.property.split('.');
      node.property = [lookup(scope, base), ...members].join('.');
      return;
    }
    if (node.isFunctionCall) {
      if (functionNames.has(node.name)) node.name = functionNames.get(node.name);
      else if (!builtinCalls.has(node.name) && !valueTypes.has(node.name)) throw new Error(`${name}: unsupported function ${node.name}`);
    }
    if (node.isOperator && node.type === '.') { visit(node.left, scope); return; }
    if (node.isConditional) {
      visit(node.cond, scope);
      const block = new Map(scope);
      node.body.forEach(child => visit(child, block));
      visit(node.elseConditional, scope);
      return;
    }
    if (node.isFor) {
      const block = new Map(scope);
      visit(node.initialization, block); visit(node.condition, block); visit(node.afterthought, block);
      node.body.forEach(child => visit(child, block));
      return;
    }
    if (node.isWhile || node.isSwitch || node.isStructDefinition || node.isString) throw new Error(`${name}: unsupported ${node.constructor.name}`);
    if (node.isStaticElement) return; // Swizzle/member labels are not variable references.
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'linker') continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, scope));
      else if (value?.isASTNode) visit(value, scope);
    }
  }
  for (const fn of functions) {
    const originalName = fn.name;
    const inline = stage || bindingNames.length || inlineFunctions.includes(originalName) || fn.params.some(p => p.type === 'sampler2D');
    // Inline Fn callbacks cannot emit shader Return nodes. Lower early exits to
    // assignments and guard the remaining lexical block, keeping declarations
    // and their uses together. Loop exits are rejected until explicitly supported.
    const hasReturn = node => node?.isASTNode && (node.isReturn || Object.entries(node).some(([key, value]) =>
      key !== 'parent' && key !== 'linker' && (Array.isArray(value) ? value.some(hasReturn) : hasReturn(value))));
    if (inline && (fn.body.slice(0, -1).some(hasReturn) || (!fn.body.at(-1)?.isReturn && hasReturn(fn.body.at(-1))))) {
      const result = `offlineResult${serial}`, done = `offlineDone${serial}`;
      if (text.includes(result) || text.includes(done)) throw new Error(`${name}: reserved return-lowering identifier`);
      function lower(body) {
        const lowered = [];
        for (let i = 0; i < body.length; i++) {
          const node = body[i];
          if (node.isReturn) {
            if (node.value) lowered.push(new Operator('=', new Accessor(result), node.value));
            lowered.push(new Operator('=', new Accessor(done), new Accessor('true')));
            break;
          }
          const exits = hasReturn(node);
          if (exits && !node.isConditional) throw new Error(`${name}: early return in ${node.constructor.name} is unsupported`);
          if (node.isConditional && exits) {
            for (let branch = node; branch; branch = branch.elseConditional) branch.body = lower(branch.body);
          }
          lowered.push(node);
          if (exits && i + 1 < body.length) {
            lowered.push(new Conditional(new Unary('!', new Accessor(done)), lower(body.slice(i + 1))));
            break;
          }
        }
        return lowered;
      }
      fn.body = [new VariableDeclaration('bool', done, new Accessor('false')),
        ...(fn.type === 'void' ? [] : [new VariableDeclaration(fn.type, result)]), ...lower(fn.body),
        ...(fn.type === 'void' ? [] : [new Return(new Accessor(result))])];
    }
    const scope = new Map(root);
    fn.params.forEach(param => declare(param, scope));
    fn.body.forEach(node => visit(node, scope));
    fn.name = functionNames.get(originalName);
    // Captures and opaque texture arguments must remain node-graph functions.
    if (inline) fn.layout = false;
  }
  // Restore parent links after entry-point normalization.
  function parents(node) {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'linker') continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child?.isASTNode) { child.parent = node; parents(child); }
      }
    }
  }
  parents(ast);
  return { ast, inputs, output, exports: exported.map(key => [key, functionNames.get(key)]) };
}
