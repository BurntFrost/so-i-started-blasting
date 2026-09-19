import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { init, parse } from 'es-module-lexer';

const require = createRequire(import.meta.url);
const packageDir = path.resolve(path.dirname(require.resolve('three')), '..');
const prefix = 'vendor/three/';

function resolveThree(specifier) {
  if (specifier === 'three') return `${prefix}build/three.module.js`;
  if (specifier === 'three/webgpu') return `${prefix}build/three.webgpu.js`;
  if (specifier === 'three/tsl') return `${prefix}build/three.tsl.js`;
  if (specifier.startsWith('three/addons/')) return `${prefix}examples/jsm/${specifier.slice('three/addons/'.length)}`;
  throw new Error(`Unsupported package import: ${specifier}`);
}

// Copy only the pinned engine/addon import graph, then let the normal asset
// emitter hash the rewritten modules together with the app's own dependencies.
export async function vendorThree(source) {
  await init;
  const metadata = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  if (metadata.version !== '0.186.0') throw new Error(`Expected Three.js 0.186.0; installed ${metadata.version}. Run npm ci.`);
  const visited = new Set();
  async function rewrite(name) {
    if (visited.has(name)) return;
    visited.add(name);
    let text = source.get(name).toString('utf8');
    const [imports] = parse(text, name);
    const replacements = [];
    for (const entry of imports) {
      if (entry.specifier === undefined) continue;
      const specifier = entry.specifier;
      let dependency;
      if (specifier === 'three' || specifier.startsWith('three/')) dependency = resolveThree(specifier);
      else if (name.startsWith(prefix) && specifier.startsWith('.')) dependency = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
      else continue;
      if (!dependency.startsWith(prefix) || dependency.includes('..')) throw new Error(`Invalid Three.js import: ${specifier}`);
      if (!source.has(dependency)) source.set(dependency, await readFile(path.join(packageDir, dependency.slice(prefix.length))));
      await rewrite(dependency);
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
