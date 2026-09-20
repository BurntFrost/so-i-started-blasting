import path from 'node:path';
import { build } from 'esbuild';

// Keep public app module URLs for browser tests and lazy imports. Shared engine
// code becomes split chunks, with unused vendor exports removed by the bundler.
export async function bundleJavaScript(source) {
  const entries = [...source.keys()].filter(name => name.endsWith('.js') && !name.startsWith('vendor/')).sort();
  if (!entries.length) return;
  const outdir = '/blasting-bundle';
  const result = await build({
    entryPoints: entries.map(name => ({ in: name, out: name.slice(0, -3) })), outdir,
    chunkNames: 'chunks/shared-[hash]', bundle: true, splitting: true,
    format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, keepNames: true, legalComments: 'inline', write: false,
    plugins: [{ name: 'static-source', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const specifier = args.path.split(/[?#]/)[0];
        const name = specifier.startsWith('/') ? specifier.slice(1)
          : path.posix.normalize(path.posix.join(path.posix.dirname(args.importer || '/'), specifier)).replace(/^\//, '');
        if (!source.has(name)) throw new Error(`Missing bundled module: ${args.path}`);
        return { path: `/${name}`, namespace: 'static-source' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'static-source' }, args => ({
        contents: source.get(args.path.slice(1)), loader: 'js',
      }));
    } }],
  });
  for (const name of [...source.keys()]) if (name.endsWith('.js')) source.delete(name);
  for (const file of result.outputFiles) source.set(path.posix.relative(outdir, file.path), Buffer.from(file.contents));
  // The engine is now inside shared chunks; the application preloads discover it.
  for (const [name, bytes] of source) if (name.endsWith('.html')) {
    source.set(name, Buffer.from(bytes.toString().replace(/<link\b[^>]*rel="modulepreload"[^>]*href="\/vendor\/[^"\s]+"[^>]*>/g, '')));
  }
}
