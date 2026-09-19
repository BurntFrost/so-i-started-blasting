import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { seekTimeline, settleFrames } from '../capture-media.mjs';
import { frameMetrics, summarize } from './metrics.mjs';

const args=new Map();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
const url=args.get('--url')||'http://127.0.0.1:4175';
const baseline=args.get('--baseline');
const output=path.resolve(args.get('--output')||'outputs/performance/comparison');
const repeats=Number(args.get('--repeats')||2),seconds=Number(args.get('--seconds')||6);
if(!Number.isInteger(repeats)||repeats<1||repeats>10||!Number.isFinite(seconds)||seconds<2||seconds>10)throw new Error('Use 1–10 repeats and 2–10 seconds.');
const profiles=[
  {name:'desktop',viewport:{width:1280,height:800},deviceScaleFactor:1,hasTouch:false,quality:'high'},
  {name:'retina',viewport:{width:1280,height:800},deviceScaleFactor:2,hasTouch:false,quality:'ultra'},
  {name:'phone-emulation',viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,quality:'balanced'},
].filter(p=>!args.get('--profile')||args.get('--profile')===p.name);
const scenes=[{id:'independence-day',start:13,still:18},{id:'deep-impact',start:17,still:22},{id:'interstellar',start:10,still:15}]
  .filter(s=>!args.get('--scene')||args.get('--scene')===s.id);
if(!profiles.length||!scenes.length)throw new Error('Unknown profile or scene.');
const variants=[...(baseline?[{name:'baseline-adaptive',url:baseline}]:[]),{name:'tuned-adaptive',url},
  {name:'current-fixed',url,fixed:true},{name:'prototype-fixed',url,fixed:true,prototype:true}];
const runs=[],comparisons=[];
const safeCommand=(name,params)=>{try{return execFileSync(name,params,{encoding:'utf8'}).trim();}catch{return 'unavailable';}};
const metadata={date:new Date().toISOString(),headless:true,node:process.version,platform:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model,
  memoryGB:os.totalmem()/2**30,power:safeCommand('pmset',['-g','batt']),commit:safeCommand('git',['rev-parse','HEAD']),
  repeats,seconds,matrix:{profiles:profiles.map(p=>p.name),scenes:scenes.map(s=>s.id),variants:variants.map(v=>v.name)},seed:'application seeds unchanged',instrumentation:'rAF, Long Tasks, Event Timing; stats overlay disabled',
  limitations:'Phone profile is viewport/touch/DPR emulation on this Mac. Input-to-second-rAF is a presentation-opportunity proxy, not physical input-to-photon latency. Event Timing omits events below 16 ms and is quantized. No CPU throttling or GPU finish/readback during timing.'};
await mkdir(output,{recursive:true});
let browser;

async function prepare(page,scene){
  await page.locator(`[data-scene-id="${scene.id}"]`).click();
  await seekTimeline(page,scene.start);
  await page.waitForFunction(()=>{
    const d=document.querySelector('#world').dataset;
    return d.authoredAssets==='ready'&&![d.weatherTexture,d.nebulaTexture,d.particleAtlas,d.explosionBake,d.atFieldTexture].includes('loading');
  },null,{timeout:45000});
  await settleFrames(page);
}

async function installMetrics(page){
  await page.evaluate(()=>{
    const samples={frames:[],longTasks:[],events:[],inputToFrame:[],quality:[],recording:false,last:0};
    window.__benchmark=samples;
    for(const type of ['longtask','event']){
      if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
      new PerformanceObserver(list=>{
        for(const e of list.getEntries())if(e.startTime>=samples.start&&e.startTime<=(samples.stop??Infinity)){
          if(type==='longtask')samples.longTasks.push(e.duration);
          else if(e.interactionId&&e.startTime>=samples.interactionStart)samples.events.push({id:e.interactionId,name:e.name,duration:e.duration,inputDelay:e.processingStart-e.startTime});
        }
      }).observe({type,buffered:false,...(type==='event'?{durationThreshold:16}:{})});
    }
    document.querySelector('#progress').addEventListener('input',event=>{
      if(!samples.interacting)return;
      const start=event.timeStamp;
      requestAnimationFrame(()=>requestAnimationFrame(()=>samples.inputToFrame.push(performance.now()-start)));
    });
    function frame(now){
      if(samples.recording){
        if(samples.last)samples.frames.push(now-samples.last);
        const d=document.querySelector('#world').dataset;
        const state=`${d.quality}/${d.resolutionScale||1}/${d.pixelRatio}`;
        if(samples.quality.at(-1)?.state!==state)samples.quality.push({ms:now-samples.start,state});
        samples.last=now;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

async function measure(page,variant,profile,scene,repeat){
  await prepare(page,scene);
  // Warm the shader paths using the same scene before measuring steady playback.
  await page.locator('#play').click();await page.waitForTimeout(1500);await page.locator('#play').click();
  await seekTimeline(page,scene.start);await settleFrames(page);
  await installMetrics(page);
  const startQuality=await page.locator('#world').evaluate(e=>({...e.dataset}));
  const powerStart=safeCommand('pmset',['-g','batt']).split('\n')[0];
  await page.locator('#play').click();
  await page.evaluate(()=>{const b=window.__benchmark;b.start=performance.now();b.recording=true;});
  await page.waitForTimeout(seconds*1000);
  await page.evaluate(()=>{const b=window.__benchmark;b.recording=false;b.stop=performance.now();});
  await page.locator('#play').click();
  // Trusted keyboard input exercises the real timeline handler. These samples are separate from FPS.
  await page.locator('#progress').focus();
  await page.evaluate(()=>{const b=window.__benchmark;b.interactionStart=performance.now();b.interacting=true;b.stop=undefined;});
  for(let i=0;i<10;i++){await page.keyboard.press(i%2?'ArrowLeft':'ArrowRight');await settleFrames(page);}
  await page.evaluate(()=>{window.__benchmark.interacting=false;window.__benchmark.stop=performance.now();});
  await page.waitForTimeout(100);
  const raw=await page.evaluate(()=>{
    const b=window.__benchmark,canvas=document.querySelector('#world'),gl=canvas.getContext('webgl2');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {...b,endQuality:{...canvas.dataset},renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTimerSupported:!!gl.getExtension('EXT_disjoint_timer_query_webgl2')};
  });
  const screenshot=`${profile.name}-${scene.id}-${variant.name}-${repeat}.png`;
  await seekTimeline(page,scene.still);await settleFrames(page);await page.locator('#progress').blur();
  await page.locator('#world').screenshot({path:path.join(output,screenshot),timeout:30000});
  const eventGroups=[...new Set(raw.events.map(e=>e.id))].map(id=>Math.max(...raw.events.filter(e=>e.id===id).map(e=>e.duration)));
  const powerEnd=safeCommand('pmset',['-g','batt']).split('\n')[0];
  const run={profile:profile.name,device:{viewport:profile.viewport,dpr:profile.deviceScaleFactor,touch:profile.hasTouch},scene:scene.id,variant:variant.name,repeat,powerStart,powerEnd,
    screenshot,startQuality,frames:frameMetrics(raw.frames),longTasks:summarize(raw.longTasks),eventDuration:summarize(eventGroups),
    eventInputDelay:summarize(raw.events.map(e=>e.inputDelay)),inputToSecondRAF:summarize(raw.inputToFrame),raw};
  if(!run.frames.count||run.inputToSecondRAF.count!==10)throw new Error(`Missing metrics for ${profile.name}/${scene.id}/${variant.name}`);
  const dprCap={balanced:1.25,high:1.7,ultra:2};
  if(variant.fixed&&raw.quality.some(q=>q.state!==`${profile.quality}/1/${Math.min(profile.deviceScaleFactor,dprCap[profile.quality])}`))throw new Error('Fixed-quality renderer comparison drifted.');
  runs.push(run);
  console.log(`${profile.name} ${scene.id} ${variant.name} #${repeat}: p95=${run.frames.p95.toFixed(1)} ms; >50ms=${run.frames.over50ms}; input proxy=${run.inputToSecondRAF.p95.toFixed(1)} ms`);
  await writeFile(path.join(output,'results.json'),JSON.stringify({metadata,runs,comparisons},null,2));
}

try{
  metadata.builds={};
  for(const address of new Set(variants.map(v=>v.url))){
    const manifest=await (await fetch(new URL('/asset-manifest.json',address))).text();
    metadata.builds[address]=createHash('sha256').update(manifest).digest('hex');
  }
  for(let repeat=1;repeat<=repeats;repeat++)for(const profile of profiles){
    const order=repeat%2?variants:[...variants].reverse();
    for(const variant of order)for(const scene of scenes){
      browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
      if(metadata.browser&&metadata.browser!==browser.version())throw new Error('Browser version changed during comparison.');
      metadata.browser=browser.version();
      const page=await browser.newPage({...profile,reducedMotion:'reduce'}),errors=[];
      page.setDefaultTimeout(20000);
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',e=>{if(e.type()==='error'&&/THREE|WebGL|shader/i.test(e.text()))errors.push(e.text());});
      const address=new URL(variant.url);
      if(variant.fixed)address.searchParams.set('quality',profile.quality);
      if(variant.prototype)address.searchParams.set('renderer','postprocessing');
      await page.goto(address.href,{waitUntil:'domcontentloaded'});
      await page.locator('#world[data-render-state="ready"]').waitFor({timeout:45000});
      try{
        await measure(page,variant,profile,scene,repeat);
        if(errors.length)throw new Error(errors.join('\n'));
      }catch(error){
        metadata.failure={profile:profile.name,variant:variant.name,repeat,message:error.message,errors};
        if(!page.isClosed()){
          metadata.failure.state=await page.locator('#world').evaluate(e=>({...e.dataset})).catch(()=>null);
          await page.screenshot({path:path.join(output,'failure.png'),timeout:5000}).catch(()=>{});
        }
        console.error(JSON.stringify(metadata.failure));throw error;
      }
      await browser.close();browser=null;
    }
  }
}finally{
  await browser?.close();
  metadata.powerAtEnd=safeCommand('pmset',['-g','batt']);
  await writeFile(path.join(output,'results.json'),JSON.stringify({metadata,runs,comparisons},null,2));
}
