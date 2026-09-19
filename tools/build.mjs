import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vendorThree } from './vendor.mjs';
import { createReleaseMetadata } from './release-metadata.mjs';

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

// Inspect JavaScript string expressions without treating comments, regexes or
// grouping parentheses as URL boundaries. No expression is evaluated at build time.
function javascriptTokens(text) {
  const tokens = [], controlParentheses = [];
  const pattern = /\s+|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[\w$]+|\+\+|\+=|=>|&&|\|\||\?\?|[^\s]/gy;
  let match, followsControl = false;
  while ((match = pattern.exec(text))) {
    let value = match[0];
    if (/^\s|^\/\*|^\/\//.test(value)) continue;
    const previous = tokens.at(-1)?.value;
    if (value === '/' && (!previous || followsControl || /^(?:[=(:,;!\[{}?+*/%&|^~<>-]|=>|&&|\|\||\?\?|return|throw|case|typeof|void|delete|yield|await|in|of|instanceof)$/.test(previous))) {
      let cursor = pattern.lastIndex, characterClass = false, closed = false;
      for (; cursor < text.length; cursor++) {
        if (/[\r\n]/.test(text[cursor])) break;
        if (text[cursor] === '\\') { cursor++; continue; }
        if (text[cursor] === '[') characterClass = true;
        if (text[cursor] === ']') characterClass = false;
        if (text[cursor] === '/' && !characterClass) { cursor++; closed = true; break; }
      }
      if (closed) {
        while (cursor < text.length && /[a-z]/i.test(text[cursor])) cursor++;
        pattern.lastIndex = cursor;
        value = text.slice(match.index, cursor);
      }
    }
    followsControl = value === ')' && controlParentheses.pop();
    if (value === '(') controlParentheses.push(/^(if|while|for|with|switch|catch)$/.test(previous || ''));
    tokens.push({ value, start: match.index, end: pattern.lastIndex });
  }
  return tokens;
}

function rewriteJavaScriptReferences(text, rewrite) {
  const tokens = javascriptTokens(text), pairs = new Map(), stack = [], parents = [];
  tokens.forEach(({ value }, i) => {
    parents[i] = stack.at(-1);
    if (value === '(' || value === '[') stack.push(i);
    if (value === ')' || value === ']') {
      const open = stack.pop();
      if (open !== undefined) { pairs.set(open, i); pairs.set(i, open); }
    }
  });
  const value = i => tokens[i]?.value;
  const grouping = i => !value(i - 1) || !/^[\w$)'"`\]]/.test(value(i - 1)) || /^(return|throw|yield)$/.test(value(i - 1));
  const operandStart = end => {
    let start = end;
    if (value(end) === ')' || value(end) === ']') {
      start = pairs.get(end) ?? end;
      if (!grouping(start)) start--;
    }
    while (value(start - 1) === '.') start -= 2;
    return start;
  };
  const externalPrefix = (start, end) => {
    while (value(start) === '(' && pairs.get(start) === end && grouping(start)) { start++; end--; }
    let firstEnd = end, firstStart = operandStart(end);
    while (firstStart > start && value(firstStart - 1) === '+') {
      firstEnd = firstStart - 2;
      firstStart = operandStart(firstEnd);
    }
    // Only an uninterrupted addition chain guarantees the first string remains
    // the URL prefix. Logical, comma and conditional expressions do not.
    if (firstStart !== start) return false;
    if (value(start) === '(' && pairs.get(start) === firstEnd && grouping(start)) return externalPrefix(start, firstEnd);
    return start === firstEnd && /^['"`]/.test(value(start) || '')
      && /^(?:https?:\/\/|\/\/|data:|\/_vercel\/)/.test(value(start).slice(1, -1));
  };
  const replacements = [];
  tokens.forEach((token, i) => {
    const quote = token.value[0];
    if (!['"', "'", '`'].includes(quote)) return;
    const url = token.value.slice(1, -1);
    if (!/^(?:\/(?!\/)|\.{1,2}\/)/.test(url)) return;
    let left = i, right = i;
    let concatenated = value(left - 1) === '+' || value(right + 1) === '+';
    while (value(parents[left]) === '(' && grouping(parents[left])) {
      left = parents[left]; right = pairs.get(left);
      concatenated ||= value(left - 1) === '+' || value(right + 1) === '+';
    }
    let firstEnd = right;
    while (value(left - 1) === '+') { firstEnd = left - 2; left = operandStart(firstEnd); }
    if (concatenated && externalPrefix(left, firstEnd)) return;
    const replacement = rewrite(url, concatenated || url.includes('${'));
    if (replacement !== url) replacements.push({ ...token, replacement: `${quote}${replacement}${quote}` });
  });
  for (const { start, end, replacement } of replacements.reverse()) text = text.slice(0, start) + replacement + text.slice(end);
  return text;
}

// Local runtime URLs must be literal strings so every dependency can be fingerprinted.
function rewriteReferences(text, rewrite, javascript = false) {
  if (javascript) return rewriteJavaScriptReferences(text, rewrite);
  return text.replace(/(["'])((?:\/(?!\/)|\.{1,2}\/)[^"'`\r\n]*?)\1|`((?:\/(?!\/)|\.{1,2}\/)[^`]*?)`|url\(\s*((?:\/(?!\/)|\.{1,2}\/)[^\s)'"`]+)\s*\)/g,
    (match, quote, quotedUrl, templateUrl, cssUrl) => {
      const url = quotedUrl ?? templateUrl ?? cssUrl;
      const quoted = cssUrl === undefined;
      const replacement = rewrite(url, url.includes('${'));
      if (replacement === url) return match;
      const delimiter = quote ?? '`';
      return quoted ? `${delimiter}${replacement}${delimiter}` : `url(${replacement})`;
    });
}

export async function build({ sourceDir = path.join(root, 'dist'), outDir = path.join(root, 'build'), development = false } = {}) {
  sourceDir = path.resolve(sourceDir);
  outDir = path.resolve(outDir);
  const overlaps = (a, b) => !path.relative(a, b).startsWith(`..${path.sep}`) && path.relative(a, b) !== '..';
  if (overlaps(sourceDir, outDir) || overlaps(outDir, sourceDir)) {
    throw new Error('Source and output directories must be separate, non-nested directories.');
  }
  let files = await listFiles(sourceDir);
  if (!files.includes('index.html')) throw new Error('Static source must contain index.html.');
  if (files.includes('release.json')) throw new Error('release.json is reserved for deployment identity.');
  const release = createReleaseMetadata();
  const source = new Map(await Promise.all(files.map(async name => [name, await readFile(path.join(sourceDir, name))])));
  if (development) await (await import('./development.mjs')).addDevelopment(source);
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
      const rewritten = rewriteReferences(bytes.toString('utf8'), (url, computed) => {
        // These scripts are supplied by Vercel at request time, outside the static output.
        if (url.startsWith('/_vercel/')) return url;
        if (computed) throw new Error(`Use literal local asset URLs in ${name}: ${url}`);
        const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/s);
        if (!hashedExtensions.has(path.posix.extname(pathname))) return url;
        const dependency = pathname.startsWith('/')
          ? pathname.slice(1)
          : path.posix.normalize(path.posix.join(path.posix.dirname(name), pathname));
        if (!source.has(dependency)) throw new Error(`Missing local asset in ${name}: ${url}`);
        return `/${emit(dependency).name}${suffix}`;
      }, extension === '.js');
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
    if (release) await writeFile(path.join(next, 'release.json'), `${JSON.stringify(release)}\n`);
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
  const development = process.argv.includes('--development');
  const manifest = await build({development,outDir:path.join(root,development?'build-dev':'build')});
  console.log(`Built ${Object.keys(manifest).length} fingerprinted assets into ${development?'build-dev':'build'}/.`);
}
