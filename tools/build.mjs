import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vendorThree } from './vendor.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hashedExtensions = new Set(['.js', '.css', '.glb', '.webp', '.hdr', '.mp3']);
const textExtensions = new Set(['.html', '.js', '.css']);

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

// Local runtime URLs must be literal strings so every dependency can be fingerprinted.
function rewriteReferences(text, rewrite) {
  return text.replace(/(["'`])((?:\/(?!\/)|\.{1,2}\/)[^"'`\r\n]*?)\1|url\(\s*((?:\/(?!\/)|\.{1,2}\/)[^\s)'"`]+)\s*\)/g,
    (match, quote, quotedUrl, cssUrl) => {
      const url = quotedUrl ?? cssUrl;
      const replacement = rewrite(url);
      if (replacement === url) return match;
      return quotedUrl === undefined ? `url(${replacement})` : `${quote}${replacement}${quote}`;
    });
}

export async function build({ sourceDir = path.join(root, 'dist'), outDir = path.join(root, 'build') } = {}) {
  sourceDir = path.resolve(sourceDir);
  outDir = path.resolve(outDir);
  const overlaps = (a, b) => !path.relative(a, b).startsWith(`..${path.sep}`) && path.relative(a, b) !== '..';
  if (overlaps(sourceDir, outDir) || overlaps(outDir, sourceDir)) {
    throw new Error('Source and output directories must be separate, non-nested directories.');
  }
  let files = await listFiles(sourceDir);
  if (!files.includes('index.html')) throw new Error('Static source must contain index.html.');
  const source = new Map(await Promise.all(files.map(async name => [name, await readFile(path.join(sourceDir, name))])));
  await vendorThree(source);
  files = [...source.keys()].sort();
  const emitted = new Map();
  const visiting = new Set();

  function emit(name) {
    if (emitted.has(name)) return emitted.get(name);
    if (visiting.has(name)) throw new Error(`Circular local asset dependency: ${name}`);
    visiting.add(name);
    const extension = path.posix.extname(name);
    let bytes = source.get(name);
    if (textExtensions.has(extension)) {
      const rewritten = rewriteReferences(bytes.toString('utf8'), url => {
        // These scripts are supplied by Vercel at request time, outside the static output.
        if (url.startsWith('/_vercel/')) return url;
        const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/s);
        if (!hashedExtensions.has(path.posix.extname(pathname))) return url;
        if (pathname.includes('${')) throw new Error(`Use literal local asset URLs in ${name}: ${url}`);
        const dependency = pathname.startsWith('/')
          ? pathname.slice(1)
          : path.posix.normalize(path.posix.join(path.posix.dirname(name), pathname));
        if (!source.has(dependency)) throw new Error(`Missing local asset in ${name}: ${url}`);
        return `/${emit(dependency).name}${suffix}`;
      });
      bytes = Buffer.from(rewritten);
    }
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const outputName = hashedExtensions.has(extension)
      ? `immutable/${name.slice(0, -extension.length)}.${digest}${extension}`
      : name;
    const result = { name: outputName, bytes };
    emitted.set(name, result);
    visiting.delete(name);
    return result;
  }

  // Resolve and write the entire graph before replacing the last successful
  // output. Staging on the same filesystem permits rename and rollback.
  for (const name of files) emit(name);
  const manifest = Object.fromEntries(files.filter(name => hashedExtensions.has(path.posix.extname(name)))
    .map(name => [`/${name}`, `/${emitted.get(name).name}`]));
  await mkdir(path.dirname(outDir), { recursive: true });
  const staging = await mkdtemp(`${outDir}.staging-`);
  const previous = path.join(staging, 'previous');
  const next = path.join(staging, 'next');
  let backedUp = false;
  let preserveBackup = false;
  try {
    await mkdir(next);
    for (const output of emitted.values()) {
      const destination = path.join(next, output.name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, output.bytes);
    }
    await writeFile(path.join(next, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    try { await rename(outDir, previous); backedUp = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(next, outDir); }
    catch (error) {
      if (backedUp) {
        try { await rename(previous, outDir); }
        catch (rollbackError) {
          preserveBackup = true;
          throw new AggregateError([error, rollbackError], `Build publish failed; previous output preserved at ${previous}`);
        }
      }
      throw error;
    }
  } finally {
    if (!preserveBackup) await rm(staging, { recursive: true, force: true });
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await build();
  console.log(`Built ${Object.keys(manifest).length} fingerprinted assets into build/.`);
}
