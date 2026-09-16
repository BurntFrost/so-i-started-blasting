import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCinema } from './cinema.js?v=3';
import { createProduction } from './production.js?v=3';
import { createGraphicsTelemetry } from './telemetry.js';
import { reportGraphicsFailure, markGraphicsFailure, showGraphicsFailure } from './runtime-state.js';
import { scenes } from './scenes.js';
import { createTerrestrial } from './terrestrial.js';
import { createCosmic } from './cosmic.js';
import { createSceneAudio } from './audio.js';

const telemetry=createGraphicsTelemetry();
const canvas=document.querySelector('#world');
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); }
catch(error) { reportGraphicsFailure('webgl-init',scenes[0].id); throw markGraphicsFailure(error,'webgl-init'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.3;
const scene=new THREE.Scene();
scene.background=new THREE.Color('#171d22');
scene.fog=new THREE.FogExp2('#171d22',.012);
const camera=new THREE.PerspectiveCamera(45,1,.1,1600);
camera.position.set(125,83,145);
const controls=new OrbitControls(camera,canvas);
controls.target.set(0,30,0);controls.enableDamping=true;controls.minDistance=35;controls.maxDistance=300;controls.maxPolarAngle=Math.PI*.48;
scene.add(new THREE.HemisphereLight(0xbed3e9,0x282015,2));
const sun=new THREE.DirectionalLight(0xffdfb4,3);sun.position.set(-40,60,30);scene.add(sun);
const city=new THREE.Group();scene.add(city);
const buildings=[];
let seed=42;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.8,...extra});
const ground=new THREE.Mesh(new THREE.BoxGeometry(170,2,155),mat('#141b1d'));ground.position.y=-2;city.add(ground);
const roadMaterial=mat('#313939');
for(let n=-4;n<=4;n++){for(const axis of [0,1]){const road=new THREE.Mesh(new THREE.PlaneGeometry(1.7,155),roadMaterial);road.rotation.x=-Math.PI/2;road.position.set(axis?n*17:0,-.92,axis?0:n*17);if(!axis)road.rotation.z=Math.PI/2;city.add(road);}}
const geometry=new THREE.BoxGeometry(1,1,1);geometry.translate(0,.5,0);
const windowPositions=[];
for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(let k=0;k<3;k++){
 const px=x*17+3+(k%2)*6,pz=z*17+3+Math.floor(k/2)*7;
 const h=4+random()*20+(Math.abs(x)<2&&Math.abs(z)<2?random()*20:0),w=3+random()*3,d=3+random()*3;
 const material=mat(new THREE.Color().setHSL(.52,.06,.13+random()*.14));
 const mesh=new THREE.Mesh(geometry,material);mesh.position.set(px,-1,pz);mesh.scale.set(w,h,d);mesh.userData={x:px,z:pz,h,w,d,tilt:(random()-.5)*1.4,delay:Math.hypot(px,pz)/95};city.add(mesh);buildings.push(mesh);
 for(let y=2;y<h-1;y+=2.1)for(let a=-1;a<=1;a++){if(random()>.2)windowPositions.push(px+a*w*.27,y,pz+d/2+.04);if(random()>.2)windowPositions.push(px+w/2+.04,y,pz+a*d*.27);}
}
const winGeo=new THREE.BufferGeometry();winGeo.setAttribute('position',new THREE.Float32BufferAttribute(windowPositions,3));const windows=new THREE.Points(winGeo,new THREE.PointsMaterial({color:'#edc891',size:.45,transparent:true,opacity:.8}));city.add(windows);
const tower=new THREE.Group();const towerBase=new THREE.Mesh(geometry,mat('#5b6160'));towerBase.scale.set(7,44,7);tower.add(towerBase);for(let i=0;i<3;i++){const tier=new THREE.Mesh(geometry,mat('#737a78'));tier.scale.set(6-i*1.5,5,6-i*1.5);tier.position.y=44+i*5;tower.add(tier);}const spire=new THREE.Mesh(new THREE.ConeGeometry(.6,15,8),mat('#a0a8a3'));spire.position.y=66;tower.add(spire);tower.position.set(5,0,3);city.add(tower);
const effects=new THREE.Group();scene.add(effects);
const ship=new THREE.Group();const hullMat=mat('#293b38',{metalness:.7,roughness:.45});
const hull=new THREE.Mesh(new THREE.SphereGeometry(41,80,32),hullMat);hull.scale.y=.15;ship.add(hull);
for(let r=10;r<40;r+=6){const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.55,8,100),mat('#233d37',{emissive:'#4b9a77',emissiveIntensity:.3}));ring.rotation.x=Math.PI/2;ring.position.y=-2.5;ship.add(ring);}
for(let i=0;i<32;i++){const a=i/32*Math.PI*2;const rib=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.4,20),hullMat);rib.position.set(Math.sin(a)*25,-2,Math.cos(a)*25);rib.rotation.y=a;ship.add(rib);const light=new THREE.Mesh(new THREE.SphereGeometry(.45,8,8),new THREE.MeshBasicMaterial({color:'#a3ffce'}));light.position.set(Math.sin(a)*36,-2.4,Math.cos(a)*36);ship.add(light);}
ship.position.set(-8,83,-20);effects.add(ship);
const core=new THREE.Mesh(new THREE.SphereGeometry(3,24,16),new THREE.MeshBasicMaterial({color:'#abffda'}));core.position.y=-5;ship.add(core);
const beam=new THREE.Mesh(new THREE.CylinderGeometry(.9,2,85,24,1,true),new THREE.MeshBasicMaterial({color:'#a5ffce',transparent:true,opacity:.7,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));beam.position.set(-8,40,-20);effects.add(beam);
const blast=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.MeshBasicMaterial({color:'#fff0b4',transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));blast.position.set(-8,3,-20);effects.add(blast);
const shockwave=new THREE.Mesh(new THREE.TorusGeometry(1,.045,8,128),new THREE.MeshBasicMaterial({color:'#ffd19a',transparent:true,opacity:1}));shockwave.rotation.x=Math.PI/2;shockwave.position.set(-8,1,-20);effects.add(shockwave);
const glow=new THREE.PointLight('#b4ffca',0,220,1.3);glow.position.set(-8,30,-20);effects.add(glow);
// One time value drives every effect, making reverse scrubbing deterministic.
const ocean=new THREE.Mesh(new THREE.PlaneGeometry(650,650,80,80),mat('#264451',{metalness:.6,roughness:.28,transparent:true,opacity:.95}));ocean.rotation.x=-Math.PI/2;ocean.position.y=-1.08;effects.add(ocean);
const wave=new THREE.Mesh(new THREE.PlaneGeometry(220,75,90,35),mat('#447783',{metalness:.3,roughness:.3,side:THREE.DoubleSide,transparent:true,opacity:.92}));effects.add(wave);
const waveBase=wave.geometry.attributes.position.array.slice();
const foam=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:'#d8f6f5',size:1.3,transparent:true,opacity:.8}));const foamPositions=new Float32Array(650*3);foam.geometry.setAttribute('position',new THREE.BufferAttribute(foamPositions,3));effects.add(foam);
const meteor=new THREE.Mesh(new THREE.IcosahedronGeometry(5,2),mat('#492e20',{emissive:'#ff5b12',emissiveIntensity:2}));effects.add(meteor);
const tail=new THREE.Mesh(new THREE.ConeGeometry(5,60,24,1,true),new THREE.MeshBasicMaterial({color:'#ffba61',transparent:true,opacity:.38,blending:THREE.AdditiveBlending,depthWrite:false}));effects.add(tail);
const snowCount=3300,snowPositions=new Float32Array(snowCount*3),snowSeeds=[];for(let i=0;i<snowCount;i++)snowSeeds.push([random()*220-110,random()*130,random()*220-110,random()]);
const snowGeo=new THREE.BufferGeometry();snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPositions,3));const snow=new THREE.Points(snowGeo,new THREE.PointsMaterial({color:'#d0e4f3',size:.65,transparent:true,opacity:.8}));effects.add(snow);
const clouds=new THREE.Group();const cloudMat=mat('#5d6b74',{transparent:true,opacity:.14,depthWrite:false});for(let i=0;i<36;i++){const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),cloudMat);cloud.position.set(random()*350-175,100+random()*30,random()*240-160);cloud.scale.set(20+random()*35,3+random()*8,12+random()*20);clouds.add(cloud);}effects.add(clouds);
const landscape=new THREE.Group();scene.add(landscape);const lawn=new THREE.Mesh(new THREE.PlaneGeometry(500,500,50,50),mat('#1d342d'));lawn.rotation.x=-Math.PI/2;lawn.position.y=-.5;landscape.add(lawn);for(let i=0;i<24;i++){const tree=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.5,1,9,7),mat('#282c24'));trunk.position.y=4.5;tree.add(trunk);const leaves=new THREE.Mesh(new THREE.ConeGeometry(4+random()*3,18+random()*7,8),mat('#16312c'));leaves.position.y=16;tree.add(leaves);tree.position.set(-90+random()*180,0,-60-random()*60);landscape.add(tree);}
const debrisCount=300;const debris=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat('#6e5140'),debrisCount);effects.add(debris);const debrisSeeds=Array.from({length:debrisCount},()=>[random()*Math.PI*2,random(),random(),random()]);const dummy=new THREE.Object3D();
const cinema=createCinema({renderer,scene,camera,canvas,sun,buildings,ground,ship,hullMat,core,beam,blast,ocean,wave,meteor,landscape,windows,snow,debris,foam,clouds,glow,telemetry});
scene.environment=cinema.environment;
const terrestrial=createTerrestrial({scene,canvas,camera,buildings,landscape});
const cosmic=createCosmic({scene,canvas,camera});
let production=null,productionRequested=false,authoredWorkPending=false,failed=false;
const productionAssets=new AbortController();
let selected=0,time=0,playing=false,speed=1,previous=0,needsRender=true;
const $=id=>document.getElementById(id),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const audio=createSceneAudio({button:$('sound-toggle'),volumeInput:$('sound-volume'),status:$('sound-status'),player:$('player')});
function syncAudio(discontinuity=false){audio.update({sceneId:scenes[selected].id,time,playing,speed,hidden:document.hidden,failed},{discontinuity});}
const originalColors=buildings.map(b=>b.material.color.clone());
const hemi=scene.children.find(object=>object.isHemisphereLight);
const freeze=new THREE.Color('#c0d6e2');
controls.addEventListener('change',()=>{needsRender=true;});
canvas.addEventListener('atmosphere-ready',()=>{needsRender=true;});
canvas.addEventListener('explosion-ready',()=>{updateWorld();});
canvas.addEventListener('at-field-ready',()=>{updateWorld();});
function resetCamera(){
 const s=scenes[selected];camera.position.set(...s.camera);controls.target.set(...s.target);controls.update();needsRender=true;
}
function syncUI(){
 syncAudio();
 const s=scenes[selected];$('time').textContent='00:'+Math.floor(time).toString().padStart(2,'0');$('progress').value=time;
 const play=$('play'),icon=playing?'Ⅱ':'▶';
 if(play.textContent!==icon)play.textContent=icon;
 play.setAttribute('aria-label',playing?'Pause simulation':'Play simulation');
 $('play-status').textContent=failed?'RENDERER UNAVAILABLE':time===0?'THE CALM BEFORE':time>=30?'END OF SCENE':playing?'SIMULATION RUNNING':'PAUSED';
 $('event-label').textContent=s.phases[time<10?0:time<19?1:2];
 $('blast').innerHTML=time===0?"LET'S DO THIS <span>↗</span>":"BLAST AGAIN <span>↺</span>";
}
function failRenderer(stage){
 if(failed)return;
  failed=true;productionAssets.abort();playing=false;canvas.dataset.renderState='failed';controls.enabled=false;renderer.setAnimationLoop(null);telemetry.idle();
 reportGraphicsFailure(stage,scenes[selected].id);syncUI();showGraphicsFailure(stage);
}
function loadProduction(){
 if(productionRequested||failed||scenes[selected].world==='space')return;
 productionRequested=true;canvas.dataset.authoredAssets='loading';
 let degraded=false;const initiatingScene=scenes[selected].id;
 createProduction({renderer,scene,camera,canvas,city,buildings,ground,ship,core,tower,blast,wave,foam,ocean,landscape,sun,beam,meteor,tail,assetSignal:productionAssets.signal,
  onAssetError(){degraded=true;reportGraphicsFailure('authored-assets',initiatingScene);}
 }).then(result=>{
  if(failed)return;
  production=result;authoredWorkPending=true;
  if(result.environment){scene.environment=result.environment;cinema.environment?.dispose();}
  canvas.dataset.authoredAssets=degraded?'degraded':'ready';
  updateWorld();
 }).catch(()=>{
  if(failed)return;
  canvas.dataset.authoredAssets='degraded';
  reportGraphicsFailure('authored-assets',initiatingScene);
 });
}
function selectScene(index){
 if(!Number.isInteger(index)||index<0||index>=scenes.length)throw new Error(`Scene must be between 0 and ${scenes.length-1}.`);
 telemetry.selectScene(index);selected=index;time=0;playing=false;const s=scenes[index];
 $('scene-title').innerHTML=s.title;$('scene-description').textContent=s.description;$('film-title').textContent=s.film;
 $('film-year').textContent=s.year;$('scenario-type').textContent=s.type;$('scene-location').textContent=s.location;
 $('scene-number').textContent=String(index+1).padStart(2,'0');document.documentElement.style.setProperty('--accent',s.color);
 document.querySelectorAll('.timeline-ticks span').forEach((el,i)=>el.textContent=s.labels[i]);
 document.querySelectorAll('.scene-card').forEach(el=>{const active=el.dataset.sceneId===s.id;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
 canvas.setAttribute('aria-label',`Interactive 3D scene inspired by ${s.film}. Drag to orbit, scroll to zoom, or use arrow keys to orbit.`);
 canvas.dataset.scene=s.id;
 if(!failed){resetCamera();updateWorld();}
 syncUI();
}
function applyEnvironment(s,t){
 const env=s.environment;
 scene.background.set(s.sky);scene.fog.color.set(env.fog);scene.fog.density=env.fogDensity+ease(t/30)*env.fogGrowth;
 sun.position.set(-90,85,-110);sun.intensity=env.sunIntensity;sun.color.set(env.sun);
 hemi.color.set(env.hemi);hemi.groundColor.set('#17191f');hemi.intensity=env.hemiIntensity;
 if(cinema.rim){cinema.rim.color.set(env.rim);cinema.rim.intensity=env.rimIntensity;}
 scene.environmentIntensity=env.environmentIntensity;
 renderer.toneMappingExposure=1.3;
}
function updateWorld(){
 if(failed)return;
 needsRender=true;const t=time,s=scenes[selected],id=s.id,hit=ease((t-13)/10);
 const invasion=id==='independence-day',impact=id==='deep-impact',storm=id==='day-after-tomorrow',nuclear=id==='terminator-2',fault=id==='2012';
 city.visible=s.world==='city';landscape.visible=s.world==='landscape';ship.visible=invasion;
 beam.visible=invasion&&t>9&&t<20;core.scale.setScalar(1+ease(t/13)*1.3);ship.position.y=83+(1-ease(t/10))*9;ship.rotation.y=t*.018;
 beam.material.opacity=clamp((t-9)/3)*clamp((20-t)/3)*.8;beam.scale.x=beam.scale.z=.3+ease((t-9)/4)*2;
 glow.color.set(invasion?'#a7ffd1':'#ff9245');glow.intensity=invasion||impact?Math.sin(clamp((t-10)/13)*Math.PI)*180:0;
 blast.visible=(invasion||impact)&&t>13&&t<26;blast.position.set(invasion?-8:-50,invasion?3:0,invasion?-20:-100);
 const size=.1+hit*(invasion?60:48);blast.scale.set(size,size*.7,size);blast.material.opacity=(1-ease((t-17)/9))*.7;blast.material.color.set(invasion?'#ffdb99':'#fff2d4');
 shockwave.visible=(invasion||impact)&&t>13;shockwave.position.copy(blast.position);shockwave.position.y=2;shockwave.scale.setScalar(1+hit*145);shockwave.material.opacity=1-hit;
 ocean.visible=impact;wave.visible=impact&&t>14;foam.visible=wave.visible;meteor.visible=impact&&t<14;tail.visible=meteor.visible;
 if(impact){
  meteor.position.set(85-t*10,145-t*10,-145+t*3);meteor.rotation.set(t*.3,t*.2,0);tail.position.copy(meteor.position).add(new THREE.Vector3(21,21,-6));
  tail.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(-1,-1,.3).normalize());
  wave.position.set(0,-1.2,-115+ease((t-14)/16)*230);ocean.position.y=-1.08+ease((t-25)/5)*13;
 }
 snow.visible=storm;
 if(storm){
  for(let i=0;i<Math.min(snowCount,snowGeo.drawRange.count);i++){const [x,y,z,r]=snowSeeds[i];snowPositions[i*3]=((x+110+t*(9+hit*34))%220)-110;snowPositions[i*3+1]=(y-t*(6+r*9)%130+130)%130;snowPositions[i*3+2]=((z+110+t*(2+hit*9)+Math.sin(t*1.5+r*20)*4)%220)-110;}
  snowGeo.attributes.position.needsUpdate=true;
 }
 snow.material.opacity=.2+ease(t/15)*.8;clouds.visible=!s.space;cloudMat.opacity=storm?.22+hit*.22:.1;clouds.rotation.y=t*.003;
 if(city.visible){
  buildings.forEach((b,i)=>{
   const u=b.userData;let collapse=0;
   if(invasion)collapse=ease((t-15-u.delay*7)/7);if(impact)collapse=ease((wave.position.z-u.z)/45)*hit;
   if(nuclear)collapse=ease((t-12-u.delay*8)/8);if(fault)collapse=ease((t-8-Math.abs(u.x)*.12)/14);
   b.scale.y=u.h*(1-collapse*.87);b.rotation.z=u.tilt*collapse;b.position.set(u.x,-1,u.z);
   if(fault){b.position.x+=Math.sign(u.x)*collapse*12;b.position.y-=collapse*(4+Math.abs(u.tilt)*10);}
   b.material.color.copy(originalColors[i]);if(storm)b.material.color.lerp(freeze,hit);
  });
  tower.scale.y=invasion?1-hit*.85:1;tower.rotation.z=invasion?hit*.25:0;
  ground.material.color.set(storm?'#6e8494':'#141b1d');
 }
 ground.visible=!fault;windows.visible=invasion?t<17:impact?t<22:true;windows.material.opacity=storm||invasion?.8*(1-hit):.8;
 debris.visible=invasion&&t>14;
 if(debris.visible){
  for(let i=0;i<debris.count;i++){const [a,r,h,w]=debrisSeeds[i],p=clamp((t-14-r*3)/12);dummy.position.set(-8+Math.sin(a)*p*(40+r*95),Math.max(.1,Math.sin(p*Math.PI)*(15+h*55)),-20+Math.cos(a)*p*(40+r*95));dummy.rotation.set(p*10+r,p*7,p*9);dummy.scale.setScalar(.3+w*1.5);dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);}
  debris.instanceMatrix.needsUpdate=true;
 }
 cinema.update(t,s);production?.update(t,s);terrestrial.update(t,s);cosmic.update(t,s);
 // One owner applies all scene lighting and fog after scene-local geometry updates.
 applyEnvironment(s,t);
}
function start(){if(failed)return;time=0;playing=true;syncAudio(true);syncUI();}
document.querySelector('.scene-list').innerHTML=scenes.map((s,i)=>`<button class="scene-card" data-scene="${i}" data-scene-id="${s.id}" aria-pressed="false" style="--scene-color:${s.color}"><span class="card-no">${String(i+1).padStart(2,'0')}</span><div><span class="card-category">${s.category}</span><h2>${s.name}</h2><p>${s.year} <span>·</span> ${s.location}</p><p class="card-visual">${s.visual}</p></div><span class="card-icon">↗</span></button>`).join('');
$('scene-count').textContent=String(scenes.length).padStart(2,'0');$('anthology-count').textContent=`${scenes.length} SCENES / ONE LAST LOOK.`;
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{
 selectScene(scenes.findIndex(s=>s.id===button.dataset.sceneId));
 document.querySelector('.stage').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}));
$('blast').addEventListener('click',start);$('replay').addEventListener('click',start);
$('play').addEventListener('click',()=>{if(failed)return;if(time>=30)time=0;playing=!playing;syncUI();});
$('speed').addEventListener('click',()=>{speed=speed===1?.5:speed===.5?2:1;$('speed').textContent=speed+'×';$('speed').setAttribute('aria-label',`Playback speed: ${speed} times`);syncAudio();});
$('progress').addEventListener('input',event=>{if(failed)return;time=Number(event.target.value);playing=false;updateWorld();syncUI();});
$('reset-camera').addEventListener('click',resetCamera);
$('fullscreen').addEventListener('click',async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await $('player').requestFullscreen();}
 catch{$('fullscreen').title='Fullscreen is unavailable in this browser';}
});
document.addEventListener('fullscreenchange',()=>{
 const active=Boolean(document.fullscreenElement);$('fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');$('fullscreen').setAttribute('aria-pressed',String(active));
});
canvas.addEventListener('keydown',event=>{
 if(failed)return;
 if(event.key===' '){event.preventDefault();$('play').click();}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
  event.preventDefault();const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
  if(event.key==='ArrowLeft')spherical.theta-=.1;if(event.key==='ArrowRight')spherical.theta+=.1;
  if(event.key==='ArrowUp')spherical.phi=Math.max(.15,spherical.phi-.1);if(event.key==='ArrowDown')spherical.phi=Math.min(Math.PI*.48,spherical.phi+.1);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
 }
});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failRenderer('context-lost');});
canvas.addEventListener('webglcontextrestored',()=>location.reload());
function resize(){
 if(failed)return;
 const {clientWidth:w,clientHeight:h}=canvas;if(!w||!h)return;
 cinema.resize();camera.aspect=w/h;camera.fov=w<600?66:45;camera.updateProjectionMatrix();updateWorld();
}
new ResizeObserver(resize).observe(canvas.parentElement);
document.addEventListener('visibilitychange',()=>{previous=0;syncAudio(true);});
addEventListener('pagehide',event=>{if(event.persisted)audio.update({sceneId:scenes[selected].id,time,playing,speed,hidden:true,failed},{discontinuity:true});else audio.dispose();});
addEventListener('pageshow',event=>{if(event.persisted){previous=0;syncAudio(true);}});
let lastTime=-1,lastScene=-1,lastUI=0,firstFrame=true;
renderer.info.autoReset=false;
renderer.setAnimationLoop(now=>{
 if(failed)return;
 const rawDelta=previous?(now-previous)/1000:0,delta=Math.min(rawDelta,.1);previous=now;
 if(document.hidden){cinema.measure(0,false);telemetry.idle();return;}
 if(playing){time=Math.min(30,time+delta*speed);if(time>=30)playing=false;if(now-lastUI>100||!playing){syncUI();lastUI=now;}}
 syncAudio();
 if(time!==lastTime||selected!==lastScene){updateWorld();lastTime=time;lastScene=selected;}
 const moved=controls.update();
 if(!needsRender&&!moved&&!playing){cinema.measure(0,false);telemetry.idle();return;}
 const quality=canvas.dataset.quality;cinema.measure(rawDelta,true);if(quality!==canvas.dataset.quality)updateWorld();
 if(authoredWorkPending&&scenes[selected].world!=='space'){telemetry.markAssetsReady();authoredWorkPending=false;}
 renderer.info.reset();cosmic.updateView();terrestrial.updateView();const renderStarted=performance.now();cinema.render();
 telemetry.frame(now,playing||moved,performance.now()-renderStarted);
 canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.drawCalls=String(renderer.info.render.calls);
 canvas.dataset.renderState='ready';needsRender=false;
 if(firstFrame){firstFrame=false;$('loading').hidden=true;}
 // Optional artwork starts only after the baseline scene has rendered.
 loadProduction();
});
selectScene(0);resize();
const modelContext=document.modelContext;
if(modelContext?.registerTool){const lifecycle=new AbortController();addEventListener('pagehide',()=>lifecycle.abort(),{once:true});try{Promise.resolve(modelContext.registerTool({name:'set_apocalypse_scene',description:`Select a movie-inspired scene and pause its timeline at a chosen second. Scenes: ${scenes.map((s,i)=>`${i} ${s.name}`).join(', ')}.`,inputSchema:{type:'object',properties:{scene:{type:'integer',minimum:0,maximum:scenes.length-1},seconds:{type:'number',minimum:0,maximum:30}},required:['scene','seconds'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(failed)throw new Error('Renderer unavailable; reload to retry.');if(!input||!Number.isInteger(input.scene)||input.scene<0||input.scene>=scenes.length||!Number.isFinite(input.seconds)||input.seconds<0||input.seconds>30)throw new Error(`Supply scene 0–${scenes.length-1} and seconds 0–30.`);selectScene(input.scene);time=input.seconds;updateWorld();syncUI();return{scene:scenes[selected].film,seconds:time,paused:true};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
