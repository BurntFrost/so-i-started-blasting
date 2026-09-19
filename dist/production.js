import * as THREE from 'three';
import { markEffect, markEffects } from './render-kit.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeAsset, loadOptionalAssets } from './asset-loading.js';

const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { n=clamp(n); return n*n*(3-2*n); };
const noise = `float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.53+noise(p*2.03)*.27+noise(p*4.07)*.13+noise(p*8.11)*.07;}`;

export async function createProduction(world) {
  const {renderer,scene,camera,canvas,city,buildings,ground,ship,core,tower,blast,
    wave,foam,landscape,beam,meteor,tail} = world;
  const waveBase=wave.geometry.attributes.position.array.slice();
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const textureLoader=new THREE.TextureLoader();
  const assetStatus = {};
  const assets = [
    ['city-model', () => loader.loadAsync('/assets/city-kit.glb')],
    ['ship-model', () => loader.loadAsync('/assets/mothership.glb')],
    // The 2K panorama is the visible sky, so it downloads only where ULTRA can show it.
    ['sky-hdr', () => new HDRLoader().loadAsync(canvas.dataset.qualityCeiling==='ultra'?'/assets/dusk-2k.hdr':'/assets/dusk.hdr')],
    ...[['concrete-albedo','/assets/concrete-albedo.webp'],['concrete-normal','/assets/concrete-normal.webp'],
      ['concrete-roughness','/assets/concrete-roughness.webp'],['asphalt-albedo','/assets/asphalt-albedo.webp'],
      ['asphalt-normal','/assets/asphalt-normal.webp'],['asphalt-roughness','/assets/asphalt-roughness.webp']]
      .map(([stage, url]) => [stage, () => textureLoader.loadAsync(url)])
  ];
  const results = await loadOptionalAssets(assets.map(([, load]) => load), { signal: world.assetSignal });
  const values = results.map((result, i) => {
    if (result.status === 'fulfilled') { assetStatus[assets[i][0]] = 'ready'; return result.value; }
    const stage = assets[i][0]; assetStatus[stage] = 'failed'; world.onAssetError?.(stage); return null;
  });
  let [kit, craft, hdr, ...maps] = values;
  const templateNames = ['Tower_A','Tower_B','Tower_C','Tower_D','Tower_E'];
  if (kit && templateNames.some(name => !kit.scene.getObjectByName(name))) {
    assetStatus['city-model'] = 'failed'; world.onAssetError?.('city-model'); disposeAsset(kit); kit = null;
  }
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  maps.forEach((map,i)=>{if(!map)return;map.colorSpace=i%3===0?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=anisotropy;});
  let environment = null, sky = null, skyMaterial = null;
  if (hdr) {
  const pmrem=new THREE.PMREMGenerator(renderer);
  environment=pmrem.fromEquirectangular(hdr);pmrem.dispose();
  hdr.mapping=THREE.EquirectangularReflectionMapping;
  skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
    uniforms:{panorama:{value:hdr},tint:{value:new THREE.Color()},air:{value:new THREE.Color()},exposure:{value:1},storm:{value:0}},
    vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D panorama;uniform vec3 tint,air;uniform float exposure,storm;varying vec3 direction;
    void main(){vec3 d=normalize(direction);vec2 uv=vec2(atan(d.z,d.x)/6.283185+.5,asin(clamp(d.y,-1.,1.))/3.141593+.5);
    vec3 c=texture2D(panorama,uv).rgb;float gray=dot(c,vec3(.2126,.7152,.0722));c=mix(c,vec3(gray),storm);
    c=c*tint*exposure;float horizon=1.-smoothstep(.02,.32,d.y);gl_FragColor=vec4(c,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb=mix(gl_FragColor.rgb,air,horizon);
    }`});
  sky=new THREE.Mesh(new THREE.SphereGeometry(750,32,16),skyMaterial);sky.rotation.y=2.8;sky.renderOrder=-10;sky.frustumCulled=false;markEffect(sky);scene.add(sky);
  sky.onBeforeRender=()=>{sky.position.copy(camera.position);sky.updateMatrixWorld();scene.fog.color.getRGB(skyMaterial.uniforms.air.value,renderer.getRenderTarget()?THREE.LinearSRGBColorSpace:renderer.outputColorSpace);};

  }
  const asphalt=new THREE.MeshStandardMaterial({color:'#77848a',map:maps[3],normalMap:maps[4],roughnessMap:maps[5],roughness:.75,metalness:.15});
  maps.slice(3).forEach(m=>m?.repeat.set(45,45));
  ground.material=asphalt;
  let seed=7459;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const cityDetails=new THREE.Group();city.add(cityDetails);
  const paving=new THREE.Mesh(new THREE.PlaneGeometry(590,590),asphalt);paving.rotation.x=-Math.PI/2;paving.position.y=-1.01;paving.receiveShadow=true;cityDetails.add(paving);
  const roadMaterial=new THREE.MeshStandardMaterial({color:'#202b31',roughness:.38,metalness:.18});
  const stripeMaterial=new THREE.MeshStandardMaterial({color:'#bbb39a',roughness:.8});
  const roadGeometry=new THREE.PlaneGeometry(2.5,550);
  const stripeGeometry=new THREE.PlaneGeometry(.12,2.1);
  const stripes=new THREE.InstancedMesh(stripeGeometry,stripeMaterial,2400);cityDetails.add(stripes);
  const dummy=new THREE.Object3D();let stripeIndex=0;
  for(let n=-15;n<=15;n++)for(const axis of [0,1]){
    const road=new THREE.Mesh(roadGeometry,roadMaterial);road.rotation.x=-Math.PI/2;road.position.set(axis?n*17:0,-.94,axis?0:n*17);if(!axis)road.rotation.z=Math.PI/2;road.receiveShadow=true;cityDetails.add(road);
    if(Math.abs(n)<8)for(let j=-19;j<=19;j++){
      dummy.position.set(axis?n*17:j*6,-.92,axis?j*6:n*17);dummy.rotation.set(-Math.PI/2,0,axis?0:Math.PI/2);dummy.scale.set(1,1,1);dummy.updateMatrix();stripes.setMatrixAt(stripeIndex++,dummy.matrix);
    }
  }
  stripes.count=stripeIndex;stripes.instanceMatrix.needsUpdate=true;

  // A template is uploaded once; instance matrices retain every building's collapse.
  const batches=[],materials=[],templateParts=[],skylineTiers=[];
  const skyline=new THREE.Group();cityDetails.add(skyline);
  const landmark=new THREE.Group();landmark.position.copy(tower.position);city.add(landmark);
  const mediumParts = [];
  if (kit) {
  kit.scene.updateMatrixWorld(true);
  for(const name of templateNames){
    const root=kit.scene.getObjectByName(name);
    const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const parts=[];
    root.traverse(part=>{if(!part.isMesh)return;
      const geometry=part.geometry.clone();
      // Meshopt stores normalized integers; expand before baking world transforms.
      for(const name of ['position','normal','tangent']){const attribute=geometry.getAttribute(name);if(!attribute)continue;const values=new Float32Array(attribute.count*attribute.itemSize);for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=attribute.getComponent(i,c);geometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));}
      geometry.applyMatrix4(part.matrixWorld);geometry.translate(-center.x,-bounds.min.y,-center.z);geometry.scale(1/size.x,1/size.y,1/size.z);
      const mat=part.material.clone();mat.envMapIntensity=1.1;
      if(/stone|concrete|brick/i.test(mat.name)){mat.map=maps[0];mat.normalMap=maps[1];mat.roughnessMap=maps[2];mat.normalScale.set(.35,.35);}
      mat.userData.baseColor=mat.color.clone();mat.userData.baseEmission=mat.emissiveIntensity;mat.userData.baseRoughness=mat.roughness;
      materials.push(mat);parts.push({geometry,material:mat});
    });templateParts.push(parts);
  }
  for(let variant=0;variant<5;variant++){
    const members=buildings.filter((_,i)=>i%5===variant);
    for(const part of templateParts[variant]){
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,members.length);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;city.add(mesh);batches.push({mesh,members,tier:'high'});
    }
    const source=buildings[variant].material,lowMaterial=source.clone();lowMaterial.onBeforeCompile=source.onBeforeCompile;lowMaterial.customProgramCacheKey=source.customProgramCacheKey;
    lowMaterial.color.copy(buildings[variant].userData.facadeBaseColor || source.color);
    lowMaterial.userData.baseColor=lowMaterial.color.clone();lowMaterial.userData.baseEmission=lowMaterial.emissiveIntensity;lowMaterial.userData.baseRoughness=lowMaterial.roughness;materials.push(lowMaterial);
    // A few stepped volumes preserve crowns and setbacks without facade geometry.
    const shapes = [
      [[.94,.78,.94,0,.39,0],[.7,.18,.7,0,.87,0],[.18,.04,.18,0,.98,0]],
      [[1,.9,.78,0,.45,0],[.68,.1,.58,0,.95,0]],
      [[1,.68,1,0,.34,0],[.76,.2,.76,0,.78,0],[.48,.12,.48,0,.94,0]],
      [[.76,.94,1,0,.47,0],[1,.24,.6,0,.12,0],[.58,.06,.8,0,.97,0]],
      [[1,.6,1,0,.3,0],[.76,.17,.76,0,.685,0],[.52,.13,.52,0,.835,0],[.28,.07,.28,0,.935,0],[.06,.03,.06,0,.985,0]]
    ][variant];
    const pieces=shapes.map(([x,y,z,px,py,pz])=>new THREE.BoxGeometry(x,y,z).translate(px,py,pz));
    const geometry=mergeGeometries(pieces);pieces.forEach(piece=>piece.dispose());
    mediumParts.push({geometry,material:lowMaterial});
    const mediumMesh=new THREE.InstancedMesh(geometry,lowMaterial,members.length);mediumMesh.frustumCulled=false;mediumMesh.receiveShadow=true;city.add(mediumMesh);batches.push({mesh:mediumMesh,members,tier:'balanced'});
    const lowMesh=new THREE.InstancedMesh(buildings[0].geometry,lowMaterial,members.length);lowMesh.frustumCulled=false;lowMesh.visible=false;city.add(lowMesh);batches.push({mesh:lowMesh,members,tier:'lite'});
  }
  // A receding skyline removes the isolated tabletop silhouette.
  const backgroundBuildings=[];
  for(let x=-13;x<=13;x++)for(let z=-13;z<=5;z++){
    if(Math.abs(x)<5&&Math.abs(z)<5)continue;
    const b=new THREE.Object3D();b.position.set(x*17+random()*5,-1,z*17+random()*5);b.scale.set(5+random()*6,8+random()*30,5+random()*6);b.updateMatrix();backgroundBuildings.push(b);
  }
  for(let variant=0;variant<5;variant++)for(const part of templateParts[variant]){
    const members=backgroundBuildings.filter((_,i)=>i%5===variant),mesh=new THREE.InstancedMesh(part.geometry,part.material,members.length);
    members.forEach((b,i)=>mesh.setMatrixAt(i,b.matrix));mesh.receiveShadow=true;mesh.computeBoundingSphere();skyline.add(mesh);skylineTiers.push({mesh,tier:'high'});
  }
  for(let variant=0;variant<5;variant++){
    const members=backgroundBuildings.filter((_,i)=>i%5===variant),part=mediumParts[variant];
    const mesh=new THREE.InstancedMesh(part.geometry,part.material,members.length);
    members.forEach((b,i)=>mesh.setMatrixAt(i,b.matrix));mesh.computeBoundingSphere();skyline.add(mesh);skylineTiers.push({mesh,tier:'balanced'});
  }
  tower.visible=false;
  templateParts[4].forEach(part=>{const mesh=new THREE.Mesh(part.geometry,part.material);mesh.scale.set(10,72,10);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.tier='high';landmark.add(mesh);});
  const mediumLandmark=new THREE.Mesh(mediumParts[4].geometry,mediumParts[4].material);mediumLandmark.scale.set(10,72,10);mediumLandmark.userData.tier='balanced';landmark.add(mediumLandmark);
  }

  const previousShipChildren=[...ship.children];
  const authoredShip=craft?.scene;
  if (authoredShip) {authoredShip.scale.setScalar(1.45);ship.add(authoredShip);
  authoredShip.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;part.material.envMapIntensity=1.5;}});
  core.visible=true;
  }

  // The fireball has a turbulent surface and cools into dark smoke as it expands.
  const fireUniforms={time:{value:0},fade:{value:1},heat:{value:1}};
  const fireMaterial=new THREE.ShaderMaterial({uniforms:fireUniforms,transparent:true,depthWrite:false,
    vertexShader:`uniform float time;varying vec3 spherePoint;${noise}
    void main(){spherePoint=position;float n=fbm(position*5.+vec3(0.,-time*.7,0.));vec3 p=position*(.84+n*.3);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float time,fade,heat;varying vec3 spherePoint;${noise}
    void main(){float n=fbm(spherePoint*7.+vec3(0.,-time*.6,0.));float hot=smoothstep(.27,.68,n)*heat;
    vec3 c=mix(vec3(.025,.019,.017),vec3(1.7,.13,.005),hot);c=mix(c,vec3(7.,2.8,.3),pow(hot,4.));gl_FragColor=vec4(c,fade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const fire=new THREE.Mesh(new THREE.SphereGeometry(1,80,48),fireMaterial);markEffect(fire);scene.add(fire);
  const cloudRoot=kit?.scene.getObjectByName('Tree_A');
  const terrainHeight=(x,z)=>-.5+(Math.sin(x*.022)*Math.cos(z*.027)*5-Math.sin(z*.06)*1.5)*clamp((Math.hypot(x,z)-25)/80);
  // The authored tree is HIGH-tier geometry (about 5,200 triangles each); lower tiers keep the procedural crowns.
  const trees=[];
  if(cloudRoot){
    cloudRoot.updateWorldMatrix(true,true);
    const treeBounds=new THREE.Box3().setFromObject(cloudRoot),treeHeight=treeBounds.max.y-treeBounds.min.y;
    landscape.children.slice(1).forEach((tree,i)=>{const procedural=tree.children.filter(c=>c.visible);const clone=cloudRoot.clone(true);clone.scale.setScalar((15+i%5*1.3)/treeHeight);clone.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;}});tree.position.y=terrainHeight(tree.position.x,tree.position.z);tree.add(clone);trees.push({procedural,authored:clone});});
  }
  const grass=new THREE.InstancedMesh(new THREE.ConeGeometry(.09,1.3,3),new THREE.MeshStandardMaterial({color:'#6b8057',roughness:1}),9000);
  for(let i=0;i<9000;i++){const x=random()*250-125,z=random()*230-100,scale=.4+random()*1.2;dummy.position.set(x,terrainHeight(x,z)+scale*.65,z);dummy.rotation.set((random()-.5)*.5,random()*6.28,(random()-.5)*.5);dummy.scale.setScalar(scale);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);}landscape.add(grass);
  const lawn=landscape.children[0];lawn.material.color.set('#35482b');lawn.material.roughness=1;
  // Countryside scenes plough part of the meadow into crop rows; the park keeps its lawn.
  const fieldPlots={value:0};
  lawn.material.onBeforeCompile=shader=>{shader.uniforms.fieldPlots=fieldPlots;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 terrainPoint;').replace('#include <begin_vertex>','#include <begin_vertex>\nterrainPoint=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 terrainPoint;uniform float fieldPlots;'+noise).replace('#include <color_fragment>',`#include <color_fragment>
    float meadow=.5+fbm(terrainPoint*.15);
    float plots=smoothstep(.56,.64,fbm(terrainPoint*.021+vec3(3.,0.,7.)))*fieldPlots;
    float rows=.8+.2*smoothstep(.3,.7,fract(terrainPoint.x*.28+fbm(terrainPoint*.04)*1.6));
    diffuseColor.rgb=mix(diffuseColor.rgb*meadow,vec3(.2,.155,.11)*rows*(.7+fbm(terrainPoint*.4)*.4),plots);`);};
  lawn.material.customProgramCacheKey=()=>'production-lawn-v2';
  // Coordinates are initially planar; the same profile is used by spray below.
  const waveProfile=(v,height,x,t)=>({y:Math.sin(v*Math.PI*.53)*height+(Math.sin(x*.13+t)*1.2)*v,z:Math.sin(v*Math.PI)*24+Math.pow(v,8)*17});
  const freezeColor=new THREE.Color('#e6eff3');
  let lastQuality;
  function update(t, config){
    const id=config.id, frozenScene=id==='day-after-tomorrow', cityActive=config.world==='city';
    // ULTRA shares HIGH's authored geometry; only pixel density and shadow resolution differ.
    const requestedQuality=canvas.dataset.quality || 'high';
    const quality=requestedQuality==='ultra'?'high':requestedQuality;
    // ULTRA keeps the authored foreground and landmark, but the receding skyline uses stepped
    // meshes so software WebGL does not multiply hundreds of background facades through every pass.
    const skylineQuality=requestedQuality==='ultra'?'balanced':quality==='high'?'high':'balanced';
    fieldPlots.value=id==='twister'||id==='dantes-peak'?1:0;
    if(sky){
      sky.visible=!config.space;sky.position.copy(camera.position);sky.rotation.y=2.8+t*.0006;
      skyMaterial.uniforms.tint.value.set(config.environment.skyTint);
      skyMaterial.uniforms.exposure.value=config.environment.skyExposure;
      skyMaterial.uniforms.storm.value=config.environment.skyStorm;
    }
    if(quality!==lastQuality){
      for(const batch of batches){batch.mesh.visible=batch.tier===quality;batch.mesh.castShadow=quality==='high';}
      for(const batch of skylineTiers)batch.mesh.visible=batch.tier===skylineQuality;
      landmark.children.forEach(mesh=>mesh.visible=mesh.userData.tier===(quality==='high'?'high':'balanced'));
      grass.count=quality==='high'?9000:quality==='balanced'?4500:1800;
      for(const tree of trees){tree.authored.visible=quality==='high';for(const part of tree.procedural)part.visible=quality!=='high';}
      lastQuality=quality;
    }
    if(cityActive){
      ground.material.color.set(frozenScene?'#c4d3da':'#647077');ground.scale.set(1,1,1);ground.visible=id!=='2012';cityDetails.visible=id!=='deep-impact'&&id!=='2012';
      skyline.visible=quality!=='lite';
      if(kit){
        for(const b of buildings){b.visible=false;b.updateMatrix();}
        for(const batch of batches){
          if(!batch.mesh.visible)continue;
          batch.members.forEach((b,i)=>batch.mesh.setMatrixAt(i,b.matrix));batch.mesh.instanceMatrix.needsUpdate=true;
        }
      }
      const frozen=smooth((t-8)/20);
      for(const mat of materials){mat.color.copy(mat.userData.baseColor);if(frozenScene)mat.color.lerp(freezeColor,frozen*.85);mat.emissiveIntensity=mat.userData.baseEmission*(frozenScene?1-frozen:1);mat.roughness=mat.userData.baseRoughness*(frozenScene?1-frozen*.75:1);}
    }
    const collapse=id==='independence-day'?smooth((t-15)/10):id==='terminator-2'?smooth((t-13)/10):id==='2012'?smooth((t-9)/15):0;
    landmark.scale.y=1-collapse*.85;landmark.rotation.z=collapse*.18;
    if(authoredShip){authoredShip.visible=true;previousShipChildren.forEach(c=>{if(c!==core)c.visible=false;});}
    core.material.color.setRGB(.3,2.4,1.4);beam.material.color.setRGB(.22,1.3,.75);
    blast.visible=false;fire.visible=(id==='independence-day'||id==='deep-impact')&&t>13&&t<28;fire.position.copy(blast.position);const radius=1+smooth((t-13)/12)*(id==='independence-day'?48:30);fire.scale.set(radius,radius*.85,radius);fire.position.y+=radius*.22;
    fireUniforms.time.value=t;fireUniforms.fade.value=1-smooth((t-21)/7);fireUniforms.heat.value=1-smooth((t-17)/12)*.78;
    meteor.material.emissiveIntensity=1.4;tail.material.opacity=.15;
    if(id==='deep-impact'){const travel=smooth((t-14)/16),height=22+travel*60;const positions=wave.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){const x=waveBase[i*3]*1.65,v=(waveBase[i*3+1]+37.5)/75,p=waveProfile(v,height,x,t);positions.setXYZ(i,x,p.y,p.z);}positions.needsUpdate=true;wave.geometry.computeVertexNormals();
      const p=foam.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=((i%130)/130*220-110)*1.65,c=waveProfile(1,height,x,t);p.setXYZ(i,x,c.y+Math.sin(i*21+t)*2-(i%5)*.6,wave.position.z+c.z+Math.cos(i*3+t)*3);}p.needsUpdate=true;
    }
    canvas.dataset.authoredAssets=Object.values(assetStatus).includes('failed')?'degraded':'ready';
  }
  markEffects(cityDetails); markEffects(ship);
  return {update,environment:environment?.texture || null,assetStatus};
}
