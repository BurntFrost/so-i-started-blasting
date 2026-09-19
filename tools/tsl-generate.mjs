import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export { generateModule } from './tsl-emit.mjs';

export async function generate({ output = new URL('../dist/node-fields.js', import.meta.url), check = false, records } = {}) {
  records ??= JSON.parse(await readFile(new URL('./tsl-captured-programs.json', import.meta.url), 'utf8'));
  const { generateRegistry } = await import('./tsl-registry.mjs');
  const expected = generateRegistry(records);
  if (check) {
    const current = await readFile(output, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (current !== expected) throw new Error('Generated TSL is stale or missing; run node tools/tsl-generate.mjs');
  } else {
    await writeFile(output, expected);
  }
  return expected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), registryIndex = args.indexOf('--registry');
  const registry = registryIndex < 0 ? new URL('./tsl-captured-programs.json', import.meta.url) : args.splice(registryIndex, 2)[1];
  if (!registry || args.some(arg => arg !== '--check')) throw new Error('Usage: node tools/tsl-generate.mjs [--check] [--registry path]');
  const records = JSON.parse(await readFile(registry, 'utf8'));
  if (!Array.isArray(records)) throw new Error('Registry input must be the captureShaderPrograms() array');
  await generate({ check: args.includes('--check'), records });
  console.log(`TSL ${process.argv.includes('--check') ? 'verified' : 'generated'}: dist/node-fields.js`);
}
