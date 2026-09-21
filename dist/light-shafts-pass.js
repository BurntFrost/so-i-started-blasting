import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Classic-renderer only. `?renderer=classic` is the offline shader-capture path, so this
// pass and its `three.module.js` engine stay out of the default payload.
const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const material=(uniforms,fragmentShader)=>new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false});

export class LightShaftsPass extends Pass {
  constructor() {
    super();this.enabled=false;
    this.targets=[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false}));
    this.screenPosition=new THREE.Vector3();
    this.mask=material({source:{value:null},emitter:{value:this.screenPosition},threshold:{value:1.1}},`
      uniform sampler2D source;uniform vec3 emitter;uniform float threshold;varying vec2 vUv;
      void main(){vec3 c=texture2D(source,vUv).rgb;float bright=max(max(c.r,c.g),c.b);
        float gate=1.-smoothstep(.12,.35,distance(vUv,emitter.xy));
        gl_FragColor=vec4(c*(max(bright-threshold,0.)/max(bright,.001))*gate,1.);}`);
    // Three six-tap radial passes, like GodRaysGenerateShader, with guarded zero distance
    // and black borders on every side. No temporal jitter or accumulated buffers.
    this.blur=material({source:{value:null},emitter:{value:this.screenPosition},stepSize:{value:1/6}},`
      uniform sampler2D source;uniform vec3 emitter;uniform float stepSize;varying vec2 vUv;
      void main(){vec2 delta=emitter.xy-vUv;float d=length(delta);vec2 stepv=delta/max(d,.00001)*stepSize;
        vec3 c=vec3(0.);for(int i=0;i<6;i++){vec2 q=vUv+stepv*float(i);
          if(float(i)*stepSize<=d && all(greaterThanEqual(q,vec2(0.))) && all(lessThanEqual(q,vec2(1.))))c+=texture2D(source,q).rgb;
        }gl_FragColor=vec4(c/6.,1.);}`);
    this.combine=material({source:{value:null},shafts:{value:null},strength:{value:0}},`
      uniform sampler2D source,shafts;uniform float strength;varying vec2 vUv;
      void main(){vec4 base=texture2D(source,vUv);gl_FragColor=vec4(base.rgb+texture2D(shafts,vUv).rgb*strength,base.a);}`);
    this.quad=new FullScreenQuad(this.mask);
  }
  setSize(width,height){for(const target of this.targets)target.setSize(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)));}
  render(renderer,writeBuffer,readBuffer){
    const previous=renderer.getRenderTarget();
    try {
      this.mask.uniforms.source.value=readBuffer.texture;this.quad.material=this.mask;
      renderer.setRenderTarget(this.targets[0]);this.quad.render(renderer);
      for(let i=0;i<3;i++){
        this.blur.uniforms.source.value=this.targets[i%2].texture;this.blur.uniforms.stepSize.value=Math.pow(6,-i-1);
        this.quad.material=this.blur;renderer.setRenderTarget(this.targets[(i+1)%2]);this.quad.render(renderer);
      }
      this.combine.uniforms.source.value=readBuffer.texture;this.combine.uniforms.shafts.value=this.targets[1].texture;
      this.quad.material=this.combine;renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);
    } finally {renderer.setRenderTarget(previous);}
  }
  dispose(){for(const target of this.targets)target.dispose();for(const mat of [this.mask,this.blur,this.combine])mat.dispose();this.quad.dispose();}
}
