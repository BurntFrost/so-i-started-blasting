import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const files = (await readdir(new URL('../dist/', import.meta.url))).filter(file => file.endsWith('.js')).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../dist/${file}`, import.meta.url))], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Syntax checked ${files.length} dist modules.`);
