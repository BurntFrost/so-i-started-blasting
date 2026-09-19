import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const directory=path.resolve(process.argv[2]||'outputs/performance/comparison');
const data=JSON.parse(await readFile(path.join(directory,'results.json'),'utf8'));
const {metadata,runs}=data;
const groups=new Map();
for(const run of runs){
  const key=`${run.profile}|${run.scene}|${run.variant}`;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(run);
}
const range=values=>{
  const valid=values.filter(Number.isFinite);
  if(!valid.length)return 'unavailable';
  const min=Math.min(...valid).toFixed(1),max=Math.max(...valid).toFixed(1);
  return min===max?min:`${min}–${max}`;
};
const rows=[...groups.values()].map(group=>{
  const r=group[0];
  return [r.profile,r.scene,r.variant,group.length,range(group.map(r=>r.frames.p95)),range(group.map(r=>r.frames.p99)),range(group.map(r=>r.frames.max)),
    group.reduce((n,r)=>n+r.frames.over50ms,0),range(group.map(r=>r.inputToSecondRAF.p95)),range(group.map(r=>r.eventDuration.p95)),
    [...new Set(group.map(r=>r.raw.quality.at(-1)?.state))].join(', ')];
});
const headers=['Profile','Scene','Variant','Runs','Frame p95 ms','Frame p99 ms','Worst frame ms','Frames >50 ms (total)','Input proxy p95 ms','Event duration p95 ms','Final tier/scale/DPR'];
const comparisons=[];
for(const current of runs.filter(r=>r.variant==='current-fixed')){
  const prototype=runs.find(r=>r.variant==='prototype-fixed'&&r.profile===current.profile&&r.scene===current.scene&&r.repeat===current.repeat);
  if(!prototype)continue;
  const result=spawnSync('ffmpeg',['-hide_banner','-i',path.join(directory,current.screenshot),'-i',path.join(directory,prototype.screenshot),'-lavfi','ssim','-f','null','-'],{encoding:'utf8'});
  const match=result.stderr?.match(/SSIM.*All:([\d.]+)/);
  comparisons.push({profile:current.profile,scene:current.scene,repeat:current.repeat,ssim:result.status===0&&match?Number(match[1]):null,
    comparablePower:current.powerStart===current.powerEnd&&prototype.powerStart===prototype.powerEnd&&current.powerStart===prototype.powerStart,
    current:current.screenshot,prototype:prototype.screenshot});
}
data.comparisons=comparisons;
await writeFile(path.join(directory,'results.json'),JSON.stringify(data,null,2));
const expected=metadata.matrix?metadata.repeats*metadata.matrix.profiles.length*metadata.matrix.scenes.length*metadata.matrix.variants.length:null;
const notes=[
  `${runs.length}${expected===null?'':`/${expected}`} measured runs; ${metadata.seconds} seconds of playback per run after 1.5 seconds of shader warm-up. Ten trusted keyboard timeline inputs per run.${metadata.failure?' INCOMPLETE: a browser run failed; see results.json.':''}`,
  'Run order reverses on alternate repeats. Each scene starts in a fresh browser process. Fixed variants use identical quality tiers, pixel ratios, scene times and assets. The adaptive comparison permits quality changes and records them.',
  'Frame p95/p99 and interaction columns show the range of per-run percentiles, not a pooled population. Counts above 50 ms are summed over the listed runs.',
  'Input proxy is input-event timestamp to the second requestAnimationFrame callback: a conservative presentation-opportunity proxy. Event duration is the maximum per browser interaction ID; events below 16 ms are absent. Neither column is a field INP score or input-to-photon measurement.',
  'Frame timings measure requestAnimationFrame cadence in headless Chromium, not GPU execution or physical display presentation. Long tasks and individual samples are in results.json. stats-gl is OFF during all comparison timings. GPU timer support is recorded; GPU durations are not benchmarked.',
  'SSIM is FFmpeg similarity of canvas-region screenshots, including overlapping UI, not an aesthetic verdict. The sliders compare matched frames; differences in bloom are expected and need visual review.',
  metadata.limitations,
  `All runs used ${metadata.cpu}, ${metadata.memoryGB} GB RAM; Chrome ${metadata.browser}; ${metadata.platform}. GPU: ${runs[0]?.raw.renderer}.`,
  `Power sources observed: ${[...new Set(runs.flatMap(r=>[r.powerStart,r.powerEnd]))].join('; ')}. Check comparablePower for each visual pair. Thermal state and competing application load were not controlled.`,
];
const markdown=`# Renderer performance comparison\n\n${notes.map(n=>`- ${n}`).join('\n')}\n\n| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map(row=>`| ${row.join(' | ')} |`).join('\n')}\n\n## Matched image comparison\n\n| Profile | Scene | Repeat | SSIM | Same power source |\n| --- | --- | --- | --- | --- |\n${comparisons.map(c=>`| ${c.profile} | ${c.scene} | ${c.repeat} | ${c.ssim??'unavailable'} | ${c.comparablePower} |`).join('\n')}\n\n[Interactive image comparison](./report.html) · [Raw measurements](./results.json)\n`;
await writeFile(path.join(directory,'report.md'),markdown);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renderer performance comparison</title>
<style>body{font:16px/1.5 system-ui;margin:0;background:#11181e;color:#e6edf1}main{max-width:1500px;margin:auto;padding:32px}h1{font-size:32px}p,li{max-width:100ch;color:#bccbd4}a{color:#82cff7}.table{overflow:auto}table{border-collapse:collapse;font-size:13px;white-space:nowrap}th,td{padding:9px 12px;border-bottom:1px solid #34424c;text-align:left}th{background:#23313b}section{margin:40px 0}.pair{position:relative;--split:50%;max-width:1280px;background:#000}.pair img{display:block;width:100%;height:auto}.pair img:last-child{position:absolute;inset:0;clip-path:inset(0 0 0 var(--split))}input{width:min(100%,1280px)}.labels{display:flex;justify-content:space-between;max-width:1280px;font-size:14px}.phone-emulation{max-width:390px}code{color:#b0dfa4}</style>
<main><h1>Renderer performance comparison</h1><p>${escape(metadata.date)} · <a href="results.json">Raw measurements</a> · <a href="report.md">Markdown report</a></p><ul>${notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul>
<div class="table"><table><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<h2>Matched frames</h2><p>Drag each divider to compare the current renderer (left) with the prototype (right). Full-size source images and both repeats are saved alongside this report.</p>
${comparisons.filter(c=>c.repeat===1).map(c=>`<section><h3>${escape(c.profile)} · ${escape(c.scene)}</h3><p>SSIM: ${c.ssim??'unavailable'} · Power source matched: ${c.comparablePower}</p><div class="pair ${escape(c.profile)}" id="${escape(c.profile+c.scene)}"><img loading="lazy" src="${escape(c.current)}" alt="Current renderer"><img loading="lazy" src="${escape(c.prototype)}" alt="Postprocessing prototype"></div><div class="labels"><span>Current renderer</span><span>Postprocessing prototype</span></div><input type="range" min="0" max="100" value="50" aria-label="Compare ${escape(c.profile+' '+c.scene)}" oninput="document.getElementById('${escape(c.profile+c.scene)}').style.setProperty('--split',this.value+'%')"></section>`).join('')}</main></html>`;
await writeFile(path.join(directory,'report.html'),html);
console.log(`Wrote ${path.join(directory,'report.html')} (${runs.length} runs, ${comparisons.length} matched image pairs).`);
