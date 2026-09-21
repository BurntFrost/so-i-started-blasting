import { Vector3 } from 'three/webgpu';

const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

// Absolute-time envelopes are shared by the light and its screen-space shafts.
export function emitterEnvelope(time, emitter) {
  if(!emitter)return 0;
  const [start,attack,release,end]=emitter.window;
  return smooth((time-start)/(attack-start))*(1-smooth((time-release)/(end-release)));
}

export function projectEmitter(position,camera,target=new Vector3()) {
  camera.updateMatrixWorld();
  target.copy(position).applyMatrix4(camera.matrixWorldInverse);
  if(target.z>=-camera.near)return false;
  target.applyMatrix4(camera.projectionMatrix);
  if(target.z < -1 || target.z > 1 || Math.abs(target.x)>1.7 || Math.abs(target.y)>1.7)return false;
  target.set(target.x*.5+.5,target.y*.5+.5,target.z);
  return true;
}

export function emitterScreenFade(screenPosition){
  const edge=2*Math.max(Math.abs(screenPosition.x-.5),Math.abs(screenPosition.y-.5));
  return 1-smooth((edge-.9)/.8);
}
