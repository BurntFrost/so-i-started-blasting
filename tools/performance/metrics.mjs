export function summarize(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return {count:0,median:null,p95:null,p99:null,max:null};
  const percentile=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
  return {count:sorted.length,median:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sorted.at(-1)};
}

export function frameMetrics(values){
  return {...summarize(values),over25ms:values.filter(v=>v>25).length,over50ms:values.filter(v=>v>50).length};
}
