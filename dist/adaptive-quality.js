// Frame intervals are seconds. Ignore idle gaps; recover much more slowly than we degrade.
export function createAdaptiveQuality(level, ceiling) {
  let scaleStep=0, elapsed=0, frames=0, slowFrames=0, fastWindows=0, cooldown=.25, activeBefore=false;
  const scales=[1,.9,.8];
  const clear=()=>{elapsed=0;frames=0;slowFrames=0;};
  function reset(){clear();fastWindows=0;activeBefore=false;}
  return {
    reset,
    setCeiling(next){
      ceiling=next;
      if(level<=ceiling)return null;
      level=ceiling;scaleStep=0;reset();cooldown=.5;
      return {level,scale:1,reason:'viewport'};
    },
    measure(delta,active){
      if(!active||!Number.isFinite(delta)||delta<=0||delta>1){reset();return null;}
      if(!activeBefore){activeBefore=true;return null;}
      if(cooldown>0){cooldown-=delta;return null;}
      elapsed+=delta;frames++;if(delta>.025)slowFrames++;
      if(elapsed<1||frames<6)return null;
      const average=elapsed/frames,slowShare=slowFrames/frames,fps=frames/elapsed;
      clear();
      let reason;
      if(average>1/52||slowShare>.15){
        fastWindows=0;
        if(scaleStep<scales.length-1){scaleStep++;reason='resolution-slow';}
        else if(level>0){level--;scaleStep=0;reason='slow';}
      }else if(average<1/57&&slowShare===0){
        if(++fastWindows>=8){
          if(scaleStep>0){scaleStep--;reason='resolution-headroom';}
          else if(level<ceiling){level++;reason='headroom';}
          fastWindows=0;
        }
      }else fastWindows=0;
      if(reason)cooldown=.5;
      return {level,scale:scales[scaleStep],fps,reason};
    },
  };
}
