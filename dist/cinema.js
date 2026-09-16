import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createAtmosphere } from './atmosphere.js';

const clamp = value => Math.max(0, Math.min(1, value));
const noiseGLSL = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.11)*.15;}`;

// Shared, deterministic geometry and GPU particles keep scrubbing reversible.
export function createCinema(world) {
  const { renderer, scene, camera, canvas, sun, buildings, ground, ship, hullMat,
    core, beam, blast, ocean, wave, meteor, landscape, windows, snow,
    debris, foam, clouds, glow, telemetry } = world;
  const atmosphere = createAtmosphere(world);
  let seed = 90210;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const material = (color, values = {}) => new THREE.MeshStandardMaterial({ color, ...values });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const detailMaterials = [material('#4e5960', {metalness:.65, roughness:.4}), material('#b1a592', {roughness:.75})];
  const roofs = [];

  // Window grids are a surface shader, not thousands of individual meshes.
  buildings.forEach((building, index) => {
    building.userData.facadeBaseColor = building.material.color.clone();
    building.castShadow = true;
    building.receiveShadow = true;
    building.material.metalness = index % 3 === 0 ? .7 : .25;
    building.material.roughness = index % 3 === 0 ? .24 : .62;
    building.material.envMapIntensity = .75;
    const columns = Math.max(3, Math.round(building.userData.w * 2));
    const floors = Math.max(3, Math.round(building.userData.h / 1.5));
    building.material.onBeforeCompile = shader => {
      shader.uniforms.facadeGrid = {value:new THREE.Vector2(columns,floors)};
      shader.uniforms.facadeSeed = {value:index};
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 facadeUv; varying vec3 facadeNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfacadeUv=uv; facadeNormal=normal;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 facadeUv; varying vec3 facadeNormal; uniform vec2 facadeGrid; uniform float facadeSeed;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 grid=facadeUv*facadeGrid;
        vec2 cell=fract(grid); float pane=step(.19,cell.x)*step(cell.x,.81)*step(.18,cell.y)*step(cell.y,.78);
        float side=1.-step(.5,abs(facadeNormal.y));
        float lit=step(.68,fract(sin(dot(floor(grid),vec2(12.9898,78.233))+facadeSeed)*43758.5453));
        diffuseColor.rgb*=mix(.5,1.35,pane*side);`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.8,.39,.13)*lit*pane*side*.48;');
    };
    building.material.customProgramCacheKey = () => 'cinema-facade-v1';
    const roof = new THREE.Group();
    // Child dimensions are normalized to each building's original scale.
    const unit = new THREE.Mesh(box, detailMaterials[index % 2]);
    unit.position.set(0, 1.025, 0); unit.scale.set(.75, .05, .75); roof.add(unit);
    const equipment = new THREE.Mesh(box, detailMaterials[0]);
    equipment.position.set(.12,1.09,-.1); equipment.scale.set(.3,.09,.36); roof.add(equipment);
    if (index % 4 === 0) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04,.06,1,5), detailMaterials[0]);
      mast.position.set(-.22,1.22,.2); mast.scale.set(1,.35,1); roof.add(mast);
    }
    building.add(roof); roofs.push(roof);
  });
  // Facade windows replace the old floating points, which detached during collapse.
  windows.material.opacity = 0;
  ground.receiveShadow = true;
  ground.material.roughness = .32; ground.material.metalness = .35;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  room.dispose(); pmrem.dispose();

  // Layered hull armor, recessed machinery, and luminous engine channels.
  hullMat.color.set('#49616a'); hullMat.roughness = .28; hullMat.metalness = .85;
  const armor = new THREE.Group(); ship.add(armor);
  const armorMat = material('#72888b', {metalness:.85,roughness:.31});
  for (let i=0;i<48;i++) {
    const a=i/48*Math.PI*2;
    const plate=new THREE.Mesh(new THREE.BoxGeometry(3.5,.65,10), armorMat);
    plate.position.set(Math.sin(a)*32,2.6,Math.cos(a)*32); plate.rotation.y=a; armor.add(plate);
  }
  for (const radius of [13,23,33,40]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius,.23,6,96), new THREE.MeshBasicMaterial({color:new THREE.Color('#50daba').multiplyScalar(2)}));
    ring.rotation.x=Math.PI/2; ring.position.y=-3.8; ship.add(ring);
  }
  const reactor = new THREE.Mesh(new THREE.TorusGeometry(6.5,1,12,48), armorMat);
  reactor.rotation.x=Math.PI/2; reactor.position.y=-5; ship.add(reactor);
  core.material.color.setRGB(1.5,4,2.9);
  beam.material.color.setRGB(.65,2.6,1.65);
  beam.material.opacity=.55;

  sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-115,right:115,top:115,bottom:-115,near:.5,far:350});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-.0003; sun.shadow.normalBias=.12;
  const rim = new THREE.DirectionalLight('#7dbeff',2.2);rim.position.set(80,50,-70);scene.add(rim);
  const impactLight = new THREE.PointLight('#ff8138',0,250,1.3);impactLight.position.set(-8,18,-20);scene.add(impactLight);
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;

  // Roughen the asteroid silhouette.
  const rockPosition=meteor.geometry.attributes.position;
  for(let i=0;i<rockPosition.count;i++){
    const x=rockPosition.getX(i),y=rockPosition.getY(i),z=rockPosition.getZ(i);
    const scale=1+Math.sin(x*2.7+y)*Math.cos(z*3.1)*.14;
    rockPosition.setXYZ(i,x*scale,y*scale,z*scale);
  }
  meteor.geometry.computeVertexNormals();meteor.material.roughness=.95;
  // Low rolling terrain and irregular foliage give the park a human scale.
  const lawn=landscape.children[0]; const lp=lawn.geometry.attributes.position;
  for(let i=0;i<lp.count;i++){const x=lp.getX(i),y=lp.getY(i);lp.setZ(i,(Math.sin(x*.022)*Math.cos(y*.027)*5+Math.sin(y*.06)*1.5)*clamp((Math.hypot(x,y)-25)/80));}
  lawn.geometry.computeVertexNormals();lawn.receiveShadow=true;
  landscape.children.slice(1).forEach(tree=>{
    const old=tree.children[1];old.visible=false;
    for(let i=0;i<3;i++){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(5,1),material(i%2?'#253e32':'#354c3a',{roughness:1}));crown.position.set((i-1)*2.8,12+i*2,Math.sin(i)*2);crown.scale.set(1,1.3,1);crown.castShadow=true;tree.add(crown);}
  });

  function particles(count, kind, size, color) {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count*4);
    for(let i=0;i<seeds.length;i++)seeds[i]=random();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
    geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,4));
    const uniforms={time:{value:0},origin:{value:new THREE.Vector3()},size:{value:size},pixelRatio:{value:1},tint:{value:new THREE.Color(color)}};
    const mat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:kind===0?THREE.AdditiveBlending:THREE.NormalBlending,
      vertexShader:`attribute vec4 seed;uniform float time,size,pixelRatio;uniform vec3 origin;varying float opacity;varying float variation;
      void main(){float age=max(0.,time-seed.w*3.);float a=seed.x*6.283185;vec3 p=origin;variation=seed.z;
      ${kind===0?`p+=vec3(sin(a),0.,cos(a))*age*(5.+seed.y*12.);p.y+=age*(10.+seed.z*20.)-age*age*1.9;opacity=step(0.,time-seed.w*3.)*(1.-smoothstep(2.,8.,age))*step(0.,p.y);`:
      kind===1?`p+=vec3(sin(a)*age*3.,age*(2.+seed.z*2.),cos(a)*age*3.);opacity=step(0.,time-seed.w*3.)*smoothstep(0.,2.,age)*(1.-smoothstep(10.,20.,age))*.18;`:
      `p+=vec3((seed.x-.5)*363.,sin(seed.y*13.+time)*3.+seed.z*12.,(seed.y-.5)*10.);opacity=.55;`}
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(size*pixelRatio*(300./max(1.,-mv.z))${kind===1?'*(1.+age*.7)':''},1.,${kind===1?'190.':'32.'});}`,
      fragmentShader:`uniform vec3 tint;varying float opacity;varying float variation;${noiseGLSL}
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;if(r>1.)discard;float a=(1.-smoothstep(.15,1.,r))*opacity;
      ${kind===1?'a*=smoothstep(.15,.65,fbm(vec3(p*5.,variation*10.)));':''}
      gl_FragColor=vec4(tint,a);}`});
    const points=new THREE.Points(geometry,mat);points.frustumCulled=false;scene.add(points);return points;
  }
  const sparks=particles(8500,0,1.5,'#ffad44');sparks.material.uniforms.tint.value.multiplyScalar(2);
  const smoke=particles(340,1,65,'#4b4948');
  const spray=particles(4800,2,1.5,'#d7f4ff');
  snow.material.size=.75;
  // Soft circular snowflakes instead of square point sprites.
  snow.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat r=length(gl_PointCoord-0.5)*2.;diffuseColor.a*=1.-smoothstep(.1,1.,r);');};
  snow.material.needsUpdate=true;
  foam.material.onBeforeCompile=snow.material.onBeforeCompile;foam.material.needsUpdate=true;
  for(const object of [snow,foam,debris])object.frustumCulled=false;

  const waterTime={value:0};
  // Water is dielectric: no metalness, a glossy surface that reflects the sky, two octaves of flowing normals, a
  // deep-to-shallow gradient up the wave face, turquoise backlight through the thin curl and rough foam lace.
  const waveColor=`diffuseColor.rgb=mix(vec3(.04,.15,.19),vec3(.1,.38,.4),smoothstep(.15,.95,waterUv.y));
        float lip=smoothstep(.8,.99,waterUv.y);
        float lace=smoothstep(.52,.74,fbm(waterPoint*vec3(.9,.32,.6)+vec3(0.,-waterTime*2.5,0.)))*smoothstep(.35,.85,waterUv.y);
        float streak=pow(.5+.5*sin(waterUv.x*210.+waterCrest*11.),8.)*smoothstep(.55,.9,waterUv.y)*.32;
        waterFoam=clamp(lip*(.6+.4*smoothstep(.3,.7,waterCrest))+lace*.55+streak,0.,1.);`;
  const oceanColor=`diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.15,.36,.4),smoothstep(.55,.8,waterCrest)*.3);
        waterFoam=smoothstep(.7,.85,fbm(waterPoint*.12+vec3(waterTime*.1,waterTime*.05,0.)))*.14;`;
  const waterNormals=`#include <normal_fragment_maps>
        normal=normalize(normal+vec3(noise(waterPoint*.3+vec3(waterTime*.2,0.,0.))-.5,noise(waterPoint*.4-vec3(0.,waterTime*.15,0.))-.5,0.)*.2+vec3(noise(waterPoint*1.3+vec3(0.,-waterTime*1.2,0.))-.5,noise(waterPoint*1.1+vec3(waterTime*.9,0.,0.))-.5,0.)*.09);`;
  for(const mesh of [ocean,wave]){
    mesh.material.color.set('#0e3441');mesh.material.metalness=0;mesh.material.roughness=mesh===wave?.2:.19;mesh.material.envMapIntensity=mesh===wave?.9:1.1;
    mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.waterTime=waterTime;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waterPoint;varying vec2 waterUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nwaterPoint=position;waterUv=uv;');
      let fragment=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float waterTime;varying vec3 waterPoint;varying vec2 waterUv;float waterFoam=0.;float waterCrest=0.;'+noiseGLSL)
        .replace('#include <normal_fragment_maps>',waterNormals)
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.92,waterFoam);')
        .replace('#include <color_fragment>','#include <color_fragment>\nwaterCrest=fbm(waterPoint*.16+vec3(waterTime*.15,0.,0.));\n'+(mesh===wave?waveColor:oceanColor)+'\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.93,.95),waterFoam);');
      if(mesh===wave)fragment=fragment.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.05,.28,.26)*smoothstep(.55,.97,waterUv.y)*(1.-waterFoam*.8)*(.6+.4*waterCrest);');
      shader.fragmentShader=fragment;
    };
    mesh.material.customProgramCacheKey=()=>mesh===wave?'cinema-wave-foam-v3':'cinema-ocean-v3';
    mesh.material.needsUpdate=true;
  }

  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.65,.65,1.1);composer.addPass(bloom);composer.addPass(new OutputPass());
  // FXAA smooths the offscreen geometry after output conversion without MSAA renderbuffers.
  const antialias=new ShaderPass(FXAAShader);composer.addPass(antialias);
  // Reuse the existing finishing pass; LITE still renders directly with native AA.
  antialias.material.uniforms.filmTint={value:new THREE.Vector3(1,1,1)};
  antialias.material.uniforms.filmSaturation={value:.96};
  antialias.material.fragmentShader='uniform vec3 filmTint;uniform float filmSaturation;\n'+antialias.material.fragmentShader.replace(/}\s*$/,`
    float filmLuma=dot(gl_FragColor.rgb,vec3(.2126,.7152,.0722));
    gl_FragColor.rgb=mix(vec3(filmLuma),gl_FragColor.rgb,filmSaturation)*filmTint;
    vec2 filmPosition=vUv-.5;gl_FragColor.rgb*=1.-smoothstep(.12,.65,dot(filmPosition,filmPosition))*.12;
  }`);
  // Spray sprites thin out where the crest volume takes over at HIGH and ULTRA.
  const tiers=[{name:'LITE',dpr:1,particles:.3,spray:.3,shadows:false,bloom:false,shadowMap:2048},{name:'BALANCED',dpr:1.25,particles:.6,spray:.6,shadows:false,bloom:true,shadowMap:2048},{name:'HIGH',dpr:1.7,particles:1,spray:.45,shadows:true,bloom:true,shadowMap:2048},{name:'ULTRA',dpr:2,particles:1,spray:.45,shadows:true,bloom:true,shadowMap:4096}];
  const phone=()=>matchMedia('(pointer: coarse)').matches||canvas.clientWidth<600;
  // ULTRA renders native Retina/4K pixels, so it unlocks only on dense desktop displays; FPS still governs it.
  const ceilingFor=()=>phone()?1:devicePixelRatio>=1.5?3:2;
  // Asset resolution and tessellation are chosen once, from the startup ceiling. The runtime ceiling may
  // fall below it (phone width) but never rise above it, so ULTRA is never rendered without ULTRA assets.
  const assetCeiling=ceilingFor();
  canvas.dataset.qualityCeiling=tiers[assetCeiling].name.toLowerCase();
  let ceiling=assetCeiling,quality=ceiling,frameTotal=0,frameCount=0,fastWindows=0,cooldown=0;
  const badge=document.querySelector('.render-label');
  function setQuality(next,reason='initial'){
    quality=next;const tier=tiers[next];renderer.setPixelRatio(Math.min(devicePixelRatio,tier.dpr));renderer.shadowMap.enabled=tier.shadows;
    if(sun.shadow.mapSize.x!==tier.shadowMap){sun.shadow.mapSize.set(tier.shadowMap,tier.shadowMap);sun.shadow.map?.dispose();sun.shadow.map=null;}
    bloom.enabled=tier.bloom;canvas.dataset.antialias=tier.bloom?'fxaa':'native';roofs.forEach((roof,i)=>roof.visible=next>0||i%3===0);armor.visible=next>0;
    for(const p of [sparks,smoke,spray]){p.geometry.setDrawRange(0,Math.floor(p.geometry.attributes.position.count*(p===spray?tier.spray:tier.particles)));p.material.uniforms.pixelRatio.value=renderer.getPixelRatio();}
    snow.geometry.setDrawRange(0,Math.floor(snow.geometry.attributes.position.count*tier.particles));debris.count=Math.floor(300*tier.particles);
    canvas.dataset.quality=tier.name.toLowerCase();canvas.dataset.pixelRatio=String(renderer.getPixelRatio());
    telemetry.setQuality(canvas.dataset.quality,reason);
    if(badge)badge.textContent=`AUTO / ${tier.name}`;
    resize();cooldown=3;fastWindows=0;
  }
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);
    antialias.material.uniforms.resolution.value.set(1/(w*renderer.getPixelRatio()),1/(h*renderer.getPixelRatio()));
    if(quality===1)bloom.setSize(Math.round(w*.55),Math.round(h*.55));
    // Bloom is a blur, so ULTRA keeps it near HIGH's pixel count instead of quadrupling the mip chain.
    else if(quality===3)bloom.setSize(Math.round(w*1.2),Math.round(h*1.2));
    const nextCeiling=Math.min(assetCeiling,ceilingFor());if(nextCeiling!==ceiling){ceiling=nextCeiling;if(quality>ceiling)setQuality(ceiling,'viewport');}
  }
  function measure(delta,active){
    if(!active||delta<=0||delta>1){frameTotal=0;frameCount=0;return;}
    if(cooldown>0){cooldown-=delta;return;}
    frameTotal+=delta;frameCount++;if(frameTotal<3)return;
    const fps=frameCount/frameTotal;canvas.dataset.fps=String(Math.round(fps));frameTotal=0;frameCount=0;
    if(fps<38&&quality>0)setQuality(quality-1,'slow');
    else if(fps>57&&quality<ceiling){if(++fastWindows>=4)setQuality(quality+1,'headroom');}
    else fastWindows=0;
  }
  function update(t,config){
    const id=config.id, impact=id==='independence-day'||id==='deep-impact';
    windows.visible=false;clouds.visible=false;
    atmosphere.update(t,config);
    waterTime.value=t;
    const age=t-13;
    sparks.visible=impact&&age>0&&age<(id==='deep-impact'?4:12);smoke.visible=impact&&age>0;
    for(const p of [sparks,smoke]){p.material.uniforms.time.value=age;p.material.uniforms.origin.value.set(id==='independence-day'?-8:-50,3,id==='independence-day'?-20:-100);}
    const travel=clamp((t-14)/16),smoothTravel=travel*travel*(3-2*travel);
    spray.visible=id==='deep-impact'&&t>14;spray.material.uniforms.time.value=t;spray.material.uniforms.origin.value.set(0,Math.sin(Math.PI*.53)*(22+smoothTravel*60),wave.position.z+17);
    impactLight.intensity=impact?Math.sin(clamp(age/12)*Math.PI)*1700:0;
    impactLight.position.copy(sparks.material.uniforms.origin.value);impactLight.position.y=18;
    glow.intensity*=7;
    if(blast.visible){blast.material.opacity*=.45;blast.material.color.multiplyScalar(2.5);}
    bloom.strength=id==='day-after-tomorrow'?.22:id==='day-the-earth-stood-still'?.38:id==='interstellar'?.12:id==='gravity'?.18:config.space?.25:.48;
    bloom.radius=config.space?.35:.65;
    const icy=id==='day-after-tomorrow',warm=id==='terminator-2'||id==='2012';
    antialias.material.uniforms.filmTint.value.set(icy?.96:1,1,warm?.96:1);
    antialias.material.uniforms.filmSaturation.value=icy?.88:config.space?.97:.94;
    canvas.dataset.cinematicLook=tiers[quality].bloom?'graded':'native';
    // Keep the alien craft inside the narrow phone framing.
    if(phone()&&id==='independence-day')ship.position.y-=12;
    ground.material.envMapIntensity=id==='day-after-tomorrow'?.2:.6;
  }
  setQuality(quality);
  return {update,resize,measure,environment:environment.texture,rim,render:()=>{if(tiers[quality].bloom)composer.render();else renderer.render(scene,camera);}};
}
