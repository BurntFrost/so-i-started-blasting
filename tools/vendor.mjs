import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { init, parse } from 'es-module-lexer';

const require = createRequire(import.meta.url);
const packageDir = path.resolve(path.dirname(require.resolve('three')), '..');
const prefix = 'vendor/three/';

// Addons import the bare `three` specifier, so the engine build an addon lands on is
// decided by whoever imported it, not by its own source. Files that import `three`
// are the classic realm (`three.module.js`, the `?renderer=classic` comparison path);
// everything else is the node realm and resolves `three` to `three.webgpu.js`, whose
// core classes are the same objects via the shared `three.core.js`. Without this an
// always-loaded addon such as OrbitControls would pull the classic engine back into
// the default payload.
const CLASSIC = 'classic', NODE = 'node';

function resolveThree(specifier, realm) {
  if (specifier === 'three') return `${prefix}build/${realm === CLASSIC ? 'three.module.js' : 'three.webgpu.js'}`;
  if (specifier === 'three/webgpu') return `${prefix}build/three.webgpu.js`;
  if (specifier === 'three/tsl') return `${prefix}build/three.tsl.js`;
  if (specifier.startsWith('three/addons/')) return `${prefix}examples/jsm/${specifier.slice('three/addons/'.length)}`;
  throw new Error(`Unsupported package import: ${specifier}`);
}

const importsBareThree = imports => imports.some(entry => entry.specifier === 'three');

// Copy only the pinned engine/addon import graph, then let the normal asset
// emitter hash the rewritten modules together with the app's own dependencies.
export async function vendorThree(source) {
  await init;
  const metadata = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  if (metadata.version !== '0.186.0') throw new Error(`Expected Three.js 0.186.0; installed ${metadata.version}. Run npm ci.`);
  const visited = new Map();
  async function rewrite(name, inherited) {
    let text = source.get(name).toString('utf8');
    const [imports] = parse(text, name);
    // An application file declares its own realm; a vendored file inherits the realm of
    // the file that reached it. Only a bare `three` import can resolve two ways, so only
    // those files are pinned to one realm.
    const realm = name.startsWith(prefix) ? inherited : (importsBareThree(imports) ? CLASSIC : NODE);
    const seen = visited.get(name);
    if (seen) {
      // The first visit rewrote the bare specifier away, so whether this file is
      // realm-sensitive has to be remembered rather than re-parsed.
      if (seen.bareThree && seen.realm !== realm) {
        throw new Error(`${name} is reached from both the ${CLASSIC} and ${NODE} engine realms.`);
      }
      return;
    }
    visited.set(name, {realm, bareThree: importsBareThree(imports)});
    const replacements = [];
    for (const entry of imports) {
      if (entry.specifier === undefined) continue;
      const specifier = entry.specifier;
      let dependency;
      if (specifier === 'three' || specifier.startsWith('three/')) dependency = resolveThree(specifier, realm);
      else if (name.startsWith(prefix) && specifier.startsWith('.')) dependency = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
      else continue;
      if (!dependency.startsWith(prefix) || dependency.includes('..')) throw new Error(`Invalid Three.js import: ${specifier}`);
      if (!source.has(dependency)) source.set(dependency, await readFile(path.join(packageDir, dependency.slice(prefix.length))));
      await rewrite(dependency, realm);
      // Dynamic-import spans include their quotes; static spans exclude them.
      replacements.push([entry.start, entry.end, entry.type === 'dynamic' ? JSON.stringify(`/${dependency}`) : `/${dependency}`]);
    }
    for (const [start, end, replacement] of replacements.reverse()) text = text.slice(0, start) + replacement + text.slice(end);
    source.set(name, Buffer.from(text));
  }
  for (const name of [...source.keys()].filter(name => name.endsWith('.js'))) await rewrite(name);
  if ([...source.keys()].some(name => name.startsWith(prefix))) {
    source.set(`${prefix}LICENSE`, await readFile(path.join(packageDir, 'LICENSE')));
    source.set(`${prefix}VERSION`, Buffer.from(`${metadata.version}\n`));
  }
}
