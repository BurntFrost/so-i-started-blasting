import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('asset-baseline.json', import.meta.url), 'utf8'));
for (const [file, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(new URL(file, root));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error(`Asset baseline mismatch: ${file}. Review the new asset and update tools/asset-baseline.json intentionally.`);
  }
}
console.log(`Verified ${Object.keys(manifest.files).length} asset SHA-256 checksums.`);
