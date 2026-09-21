import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';

const require=createRequire(import.meta.url);
const packages={
  'stats-gl': {entry:'dist/main.js',version:'4.2.3'},
};

// The development graph is injected before the normal Three.js and asset vendoring.
export async function addDevelopment(source){
  await init;
  source.set('development.js',await readFile(new URL('./performance/development.js',import.meta.url)));
  const roots={};
  for(const [name,config] of Object.entries(packages)){
    const root=path.resolve(path.dirname(require.resolve(name)),'..');
    const metadata=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
    if(metadata.version!==config.version)throw new Error(`Expected ${name} ${config.version}; run npm ci.`);
    roots[name]=root;
    source.set(`vendor/${name}/NOTICE`,Buffer.from(`${name} ${metadata.version}\nLicense: ${metadata.license}\nAuthor: ${JSON.stringify(metadata.author)}\nRepository: ${JSON.stringify(metadata.repository)}\n`));
    try{source.set(`vendor/${name}/LICENSE`,await readFile(path.join(root,'LICENSE')));}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const visited=new Set();
  async function rewrite(name){
    if(visited.has(name))return;visited.add(name);
    let text=source.get(name).toString();
    const replacements=[];
    for(const entry of parse(text,name)[0]){
      const specifier=entry.specifier;
      if(!specifier)continue;
      const owner=Object.keys(packages).find(pkg=>name.startsWith(`vendor/${pkg}/`));
      let dependency;
      if(packages[specifier])dependency=`vendor/${specifier}/${packages[specifier].entry}`;
      else if(owner&&specifier.startsWith('.'))dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier));
      else continue;
      const pkg=Object.keys(packages).find(pkg=>dependency.startsWith(`vendor/${pkg}/`));
      if(!pkg||dependency.includes('..'))throw new Error(`Invalid development import: ${specifier}`);
      if(!source.has(dependency))source.set(dependency,await readFile(path.join(roots[pkg],dependency.slice(`vendor/${pkg}/`.length))));
      await rewrite(dependency);
      replacements.push([entry.start,entry.end,entry.type==='dynamic'?JSON.stringify(`/${dependency}`):`/${dependency}`]);
    }
    for(const [start,end,value] of replacements.reverse())text=text.slice(0,start)+value+text.slice(end);
    source.set(name,Buffer.from(text));
  }
  await rewrite('development.js');
}
