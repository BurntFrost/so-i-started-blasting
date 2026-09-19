import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { EffectComposer, RenderPass, Pass, BloomEffect, EffectPass, ToneMappingEffect, ToneMappingMode, Effect, BlendFunction } from 'postprocessing';

// Three.js passes take (write, read); postprocessing passes take (input, output).
// Keep the existing opaque depth/AO and display-space FXAA/film contracts intact.
class ThreePass extends Pass{
  constructor(pass){super('ThreePass');this.pass=pass;this.needsSwap=pass.needsSwap;}
  render(renderer,input,output,delta){this.pass.renderToScreen=this.renderToScreen;this.pass.render(renderer,output,input,delta);}
  setSize(w,h){this.pass.setSize(w,h);}
  dispose(){this.pass.dispose();}
}

export function createPrototype({renderer,scene,camera,ao,shafts,filmShader}){
  const autoClear=renderer.autoClear;
  const pipeline=new EffectComposer(renderer,{frameBufferType:THREE.HalfFloatType,multisampling:0});
  renderer.autoClear=autoClear;
  pipeline.addPass(new RenderPass(scene,camera));
  const occlusion=new ThreePass(ao);pipeline.addPass(occlusion);
  const lightShafts=new ThreePass(shafts);pipeline.addPass(lightShafts);
  const glow=new BloomEffect({blendFunction:BlendFunction.ADD,intensity:.65,luminanceThreshold:1.1,luminanceSmoothing:.01,levels:5,radius:.65});
  const tone=new ToneMappingEffect({mode:ToneMappingMode.AGX});
  // Finish in display space before the unchanged FXAA and film stages. Encode once.
  const transfer=new Effect('DisplayTransfer','void mainImage(const in vec4 color,const in vec2 uv,out vec4 result){vec3 c=max(color.rgb,vec3(0.));result=vec4(mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c)),color.a);}',{blendFunction:BlendFunction.SRC});
  const finish=new EffectPass(camera,glow,tone,transfer);
  finish.fullscreenMaterial.encodeOutput=false;
  pipeline.addPass(finish);
  const antialias=new ShaderPass(FXAAShader),film=new ShaderPass(filmShader);
  pipeline.addPass(new ThreePass(antialias));pipeline.addPass(new ThreePass(film));
  const bloom={
    enabled:true,
    set strength(value){glow.intensity=value;},
    set radius(value){glow.mipmapBlurPass.radius=value;},
    set threshold(value){glow.luminanceMaterial.threshold=value;},
    setSize(w,h){glow.setSize(w,h);},
  };
  const composer={
    setPixelRatio(){}, // This composer reads the renderer's drawing-buffer dimensions.
    setSize(w,h){pipeline.setSize(w,h);},
    render(){occlusion.enabled=ao.enabled;lightShafts.enabled=shafts.enabled;pipeline.render(0);},
  };
  return {composer,bloom,antialias,film};
}
