import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../tools/build.mjs';

test('profiling and prototype packages are fully excluded from the production build',async t=>{
  const outDir=await mkdtemp(path.join(tmpdir(),'blasting-development-'));
  t.after(()=>rm(outDir,{recursive:true,force:true}));
  const production=await build({outDir});
  assert.ok(!Object.keys(production).some(name=>/stats-gl|postprocessing-prototype|vendor\/postprocessing/.test(name)));
  const stub=await readFile(path.join(outDir,production['/development.js']),'utf8');
  assert.match(stub,/export const development = null/);
  const development=await build({outDir,development:true});
  for(const name of ['/vendor/stats-gl/dist/main.js','/vendor/postprocessing/build/index.js','/postprocessing-prototype.js'])assert.ok(development[name],name);
  for(const name of ['/development.js','/postprocessing-prototype.js','/vendor/stats-gl/dist/main.js','/vendor/postprocessing/build/index.js']){
    const text=await readFile(path.join(outDir,development[name]),'utf8');
    assert.doesNotMatch(text,/(?:from|import\()\s*['"](?:stats-gl|postprocessing|three)['"]/);
    for(const [url] of text.matchAll(/\/immutable\/[^"'`\s)<>?#]+/g))await readFile(path.join(outDir,url.slice(1)));
  }
});
