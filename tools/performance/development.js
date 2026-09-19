// This module replaces the production null export only in a development build.
export async function development(renderer,canvas){
  const params=new URLSearchParams(location.search);
  const fixedQuality=['lite','balanced','high','ultra'].indexOf(params.get('quality'));
  const cinema=fixedQuality<0?{}:{fixedQuality};
  if(params.get('renderer')==='postprocessing'){
    cinema.createPipeline=(await import('./postprocessing-prototype.js')).createPrototype;
  }
  canvas.dataset.renderer=cinema.createPipeline?'postprocessing':'current';
  if(params.get('stats')!=='1')return {cinema};
  const {default:Stats}=await import('stats-gl');
  const stats=new Stats({trackGPU:true,logsPerSecond:2,graphsPerSecond:10});
  // Classic/fallback WebGL wraps the complete composer in one query. Native
  // WebGPU supplies its renderer-managed timestamp metrics to stats-gl.
  const nativeGPU=renderer.backend?.isWebGPUBackend===true;
  await stats.init(nativeGPU?renderer:renderer.getContext());
  stats.dom.dataset.performanceOverlay='stats-gl';
  document.body.append(stats.dom);
  canvas.dataset.gpuTiming=(nativeGPU?renderer.hasFeature('timestamp-query'):stats.ext)?'available':'unavailable';
  let disposed=false;
  const dispose=()=>{if(!disposed){disposed=true;stats.dispose();stats.dom.remove();}};
  canvas.addEventListener('webglcontextlost',dispose,{once:true});
  addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
  return {cinema,begin(){if(!disposed)stats.begin();},end(){if(!disposed){stats.end();stats.update();}}};
}
