// Matched visual and normal-speed evidence for the web animation rollout.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scenes } from '../dist/scenes.js';
import { SCENES, seekTimeline, settleFrames } from './capture-media.mjs';
const [output='work/scene-authoring/web-rollout/baseline', url='http://127.0.0.1:4180', mode='stills'] = process.argv.slice(2);
const selected=process.env.SCENE_IDS?.split(',') || scenes.filter(s=>s.id!=='deep-impact').map(s=>s.id);
const out=resolve(output), reports=[];
await mkdir(out,{recursive:true});
for(const id of selected){
 const browser=await chromium.launch({channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const hero=SCENES.find(s=>s.id===id).second, record={id,runs:[]};
  for(const phone of [false,true]){
   const label=phone?'phone':'desktop',dir=`${out}/${id}/${label}`;await mkdir(dir,{recursive:true});
   const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:phone?2:1,hasTouch:phone,reducedMotion:'no-preference',...(!phone&&mode==='playback'?{recordVideo:{dir:`${dir}/video`,size:{width:1280,height:900}}}:{})});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGPU|WebGL|WGSL|TSL/.test(m.text()))errors.push(m.text());});
   await page.goto(`${url}/?quality=${phone?'balanced':'high'}`);
   const canvas=page.locator('#world');await page.locator('#world[data-authored-assets="ready"]').waitFor();
   await page.locator(`[data-scene-id="${id}"]`).click();
   await page.waitForFunction(()=>!Object.values(document.querySelector('#world').dataset).includes('loading'));
   await page.evaluate(()=>scrollTo(0,0));
   const seek=async t=>{await seekTimeline(page,t);await settleFrames(page);};
   const frames=[];
   for(const t of [...new Set([0,6,12,18,24,30,hero])].sort((a,b)=>a-b)){
    await seek(t);await page.screenshot({path:`${dir}/${t}.png`});frames.push({time:t,data:await canvas.evaluate(e=>({...e.dataset}))});
   }
   await seek(hero);await canvas.focus();for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.screenshot({path:`${dir}/orbit.png`});await page.locator('#reset-camera').click();
   let playback=null;
   if(!phone&&mode==='playback'){
    await seek(0);
    await page.evaluate(()=>{window.__rolloutIntervals=[];let last;function frame(now){if(window.__rolloutActive&&last)window.__rolloutIntervals.push(now-last);last=now;if(window.__rolloutActive)requestAnimationFrame(frame);}window.__rolloutActive=true;requestAnimationFrame(frame);});
    await page.locator('#play').click();
    await page.waitForFunction(()=>Number(document.querySelector('#progress').value)>=30,null,{timeout:75000});
    playback=await page.evaluate(()=>{window.__rolloutActive=false;const a=window.__rolloutIntervals,b=[...a].sort((x,y)=>x-y);return {samples:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p95:b[Math.floor(b.length*.95)],max:b.at(-1),over25:a.filter(x=>x>25).length,data:{...document.querySelector('#world').dataset}};});
   }
   record.runs.push({label,frames,playback,errors});await context.close();
  }
  reports.push(record);await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify({id,errors:record.runs.flatMap(r=>r.errors),fps:record.runs[0].playback?1000/record.runs[0].playback.mean:null}));
 }finally{await browser.close();}
}
