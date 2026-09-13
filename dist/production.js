import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { n=clamp(n); return n*n*(3-2*n); };
const noise = `float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.53+noise(p*2.03)*.27+noise(p*4.07)*.13+noise(p*8.11)*.07;}`;

export async function createProduction(world) {
  const {renderer,scene,camera,canvas,city,buildings,ground,ship,core,tower,blast,
    wave,foam,ocean,planet,landscape,sun,beam,meteor,tail} = world;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const textureLoader=new THREE.TextureLoader();
  const [kit,craft,hdr,...maps]=await Promise.all([
    loader.loadAsync('/assets/city-kit.glb'), loader.loadAsync('/assets/mothership.glb'),
    new RGBELoader().loadAsync('/assets/dusk.hdr'),
    ...['/assets/concrete-albedo.webp','/assets/concrete-normal.webp','/assets/concrete-roughness.webp','/assets/asphalt-albedo.webp','/assets/asphalt-normal.webp','/assets/asphalt-roughness.webp'].map(url=>textureLoader.loadAsync(url))
  ]);
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  maps.forEach((map,i)=>{map.colorSpace=i%3===0?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=anisotropy;});
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromEquirectangular(hdr);pmrem.dispose();
  const oldEnvironment=scene.environment;scene.environment=environment.texture;oldEnvironment?.dispose();
  hdr.mapping=THREE.EquirectangularReflectionMapping;
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
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
  const sky=new THREE.Mesh(new THREE.SphereGeometry(750,64,32),skyMaterial);sky.rotation.y=2.8;sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  sky.onBeforeRender=()=>{sky.position.copy(camera.position);sky.updateMatrixWorld();scene.fog.color.getRGB(skyMaterial.uniforms.air.value,renderer.getRenderTarget()?THREE.LinearSRGBColorSpace:renderer.outputColorSpace);};

  const asphalt=new THREE.MeshStandardMaterial({color:'#77848a',map:maps[3],normalMap:maps[4],roughnessMap:maps[5],roughness:.75,metalness:.15});
  maps.slice(3).forEach(m=>m.repeat.set(45,45));
  ground.material=asphalt;
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
  kit.scene.updateMatrixWorld(true);
  const batches=[],materials=[],templateNames=['Tower_A','Tower_B','Tower_C','Tower_D','Tower_E'];
  const templateParts=[];
  for(const name of templateNames){
    const root=kit.scene.getObjectByName(name);if(!root)throw new Error(`Missing authored model ${name}`);
    const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const parts=[];
    root.traverse(part=>{if(!part.isMesh)return;
      const geometry=part.geometry.clone();
      // Meshopt stores normalized integers; expand before baking world transforms.
      for(const name of ['position','normal','tangent']){const attribute=geometry.getAttribute(name);if(!attribute)continue;const values=new Float32Array(attribute.count*attribute.itemSize);for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=attribute.getComponent(i,c);geometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));}
      geometry.applyMatrix4(part.matrixWorld);geometry.translate(-center.x,-bounds.min.y,-center.z);geometry.scale(1/size.x,1/size.y,1/size.z);
      const mat=part.material.clone();mat.envMapIntensity=1.1;
      if(/stone|concrete|brick/i.test(mat.name)){mat.map=maps[0];mat.normalMap=maps[1];mat.roughnessMap=maps[2];mat.normalScale.set(.35,.35);}
      mat.userData.baseColor=mat.color.clone();mat.userData.baseEmission=mat.emissiveIntensity;
      materials.push(mat);parts.push({geometry,material:mat});
    });templateParts.push(parts);
  }
  buildings.forEach(b=>b.visible=false);
  for(let variant=0;variant<5;variant++){
    const members=buildings.filter((_,i)=>i%5===variant);
    for(const part of templateParts[variant]){
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,members.length);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;city.add(mesh);batches.push({mesh,members});
    }
    const source=buildings[variant].material,lowMaterial=source.clone();lowMaterial.onBeforeCompile=source.onBeforeCompile;lowMaterial.customProgramCacheKey=source.customProgramCacheKey;
    lowMaterial.userData.baseColor=lowMaterial.color.clone();lowMaterial.userData.baseEmission=lowMaterial.emissiveIntensity;materials.push(lowMaterial);
    const lowMesh=new THREE.InstancedMesh(buildings[0].geometry,lowMaterial,members.length);lowMesh.frustumCulled=false;lowMesh.visible=false;city.add(lowMesh);batches.push({mesh:lowMesh,members,low:true});
  }
  // A receding skyline removes the isolated tabletop silhouette.
  let seed=7459;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const backgroundBuildings=[];
  for(let x=-13;x<=13;x++)for(let z=-13;z<=5;z++){
    if(Math.abs(x)<5&&Math.abs(z)<5)continue;
    const b=new THREE.Object3D();b.position.set(x*17+random()*5,-1,z*17+random()*5);b.scale.set(5+random()*6,8+random()*30,5+random()*6);b.updateMatrix();backgroundBuildings.push(b);
  }
  const skyline=new THREE.Group();cityDetails.add(skyline);
  for(let variant=0;variant<5;variant++)for(const part of templateParts[variant]){
    const members=backgroundBuildings.filter((_,i)=>i%5===variant),mesh=new THREE.InstancedMesh(part.geometry,part.material,members.length);
    members.forEach((b,i)=>mesh.setMatrixAt(i,b.matrix));mesh.receiveShadow=true;mesh.computeBoundingSphere();skyline.add(mesh);
  }
  tower.visible=false;
  const landmark=new THREE.Group();landmark.position.copy(tower.position);city.add(landmark);
  templateParts[4].forEach(part=>{const mesh=new THREE.Mesh(part.geometry,part.material);mesh.scale.set(10,72,10);mesh.castShadow=true;mesh.receiveShadow=true;landmark.add(mesh);});
  const previousShipChildren=[...ship.children];previousShipChildren.forEach(child=>child.visible=false);
  const authoredShip=craft.scene;authoredShip.scale.setScalar(1.45);ship.add(authoredShip);
  authoredShip.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;part.material.envMapIntensity=1.5;}});
  core.visible=true;core.scale.setScalar(.5);

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
  const fire=new THREE.Mesh(new THREE.SphereGeometry(1,80,48),fireMaterial);scene.add(fire);
  const cloudRoot=kit.scene.getObjectByName('Tree_A');
  const terrainHeight=(x,z)=>-.5+(Math.sin(x*.022)*Math.cos(z*.027)*5-Math.sin(z*.06)*1.5)*clamp((Math.hypot(x,z)-25)/80);
  if(cloudRoot){
    cloudRoot.updateWorldMatrix(true,true);
    const treeBounds=new THREE.Box3().setFromObject(cloudRoot),treeHeight=treeBounds.max.y-treeBounds.min.y;
    landscape.children.slice(1,-1).forEach((tree,i)=>{tree.children.forEach(c=>c.visible=false);const clone=cloudRoot.clone(true);clone.scale.setScalar((15+i%5*1.3)/treeHeight);clone.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;}});tree.position.y=terrainHeight(tree.position.x,tree.position.z);tree.add(clone);});
  }
  const grass=new THREE.InstancedMesh(new THREE.ConeGeometry(.09,1.3,3),new THREE.MeshStandardMaterial({color:'#6b8057',roughness:1}),9000);
  for(let i=0;i<9000;i++){const x=random()*250-125,z=random()*230-100,scale=.4+random()*1.2;dummy.position.set(x,terrainHeight(x,z)+scale*.65,z);dummy.rotation.set((random()-.5)*.5,random()*6.28,(random()-.5)*.5);dummy.scale.setScalar(scale);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);}landscape.add(grass);
  const lawn=landscape.children[0];lawn.material.color.set('#35482b');lawn.material.roughness=1;
  lawn.material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 terrainPoint;').replace('#include <begin_vertex>','#include <begin_vertex>\nterrainPoint=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 terrainPoint;'+noise).replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=.5+fbm(terrainPoint*.15);');};
  const waveBase=wave.geometry.attributes.position.array.slice();
  // Coordinates are initially planar; the same profile is used by spray below.
  const waveProfile=(v,height,x,t)=>({y:Math.sin(v*Math.PI*.53)*height+(Math.sin(x*.13+t)*1.2)*v,z:Math.sin(v*Math.PI)*24+Math.pow(v,8)*17});
  function update(t,index){
    const quality=canvas.dataset.quality;
    sky.position.copy(camera.position);
    const space=index>=7;
    sky.visible=!space;
    const palette=['#b4c7c4','#bba899','#91afca','#7db9d4','#dba879','#ca9a81','#a297b4','#ffffff','#ffffff','#ffffff'];skyMaterial.uniforms.tint.value.set(palette[index]);skyMaterial.uniforms.exposure.value=index===3?.14:index===2?.3:index===6?.25:.65;skyMaterial.uniforms.storm.value=index>=2?.96:.3;
    sky.rotation.y=2.8+t*.0006;
    scene.environmentIntensity=space?.2:index===2?.6:.72;scene.fog.color.set(index===2?'#718797':index===3?'#283e50':index===4?'#594139':index===5?'#51403e':index===6?'#353340':'#5a6364');scene.fog.density=space?0:index===3?.0018:index===2?.0035+smooth(t/30)*.003:.0024;
    sun.position.set(-90,85,-110);sun.intensity=space?1.5:index===2?1.1:2.7;sun.color.set(space?'#e4ebff':index===3?'#a7cfff':index===2?'#bfdbef':index===6?'#c0b4de':'#ffc596');
    scene.children.find(o=>o.isHemisphereLight).intensity=space?.12:.38;
    ground.material.color.set(index===2?'#afc0c8':'#647077');ground.scale.set(1,1,1);ground.visible=index!==5;cityDetails.visible=index!==1&&index!==5;
    skyline.visible=quality!=='lite';grass.count=quality==='high'?9000:quality==='balanced'?4500:1800;
    for(const b of buildings){b.visible=false;b.updateMatrix();}
    for(const batch of batches){batch.mesh.visible=batch.low?quality==='lite':quality!=='lite';batch.members.forEach((b,i)=>batch.mesh.setMatrixAt(i,b.matrix));batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.castShadow=quality==='high';}
    const frozen=smooth((t-8)/20);for(const mat of materials){mat.color.copy(mat.userData.baseColor);if(index===2)mat.color.lerp(new THREE.Color('#e2edf0'),frozen*.8);mat.emissiveIntensity=mat.userData.baseEmission*(index===2?1-frozen:1);}
    const collapse=index===0?smooth((t-15)/10):index===4?smooth((t-13)/10):index===5?smooth((t-9)/15):0;
    landmark.scale.y=1-collapse*.85;landmark.rotation.z=collapse*.18;
    authoredShip.visible=true;previousShipChildren.forEach(c=>{if(c!==core)c.visible=false;});
    core.material.color.setRGB(.3,2.4,1.4);beam.material.color.setRGB(.22,1.3,.75);
    blast.visible=false;fire.visible=index<2&&t>13&&t<28;fire.position.copy(blast.position);const radius=1+smooth((t-13)/12)*(index===0?48:30);fire.scale.set(radius,radius*.85,radius);fire.position.y+=radius*.22;
    fireUniforms.time.value=t;fireUniforms.fade.value=1-smooth((t-21)/7);fireUniforms.heat.value=1-smooth((t-17)/12)*.78;
    meteor.material.emissiveIntensity=1.4;tail.material.opacity=.15;
    if(index===1){const travel=smooth((t-14)/16),height=22+travel*60;const positions=wave.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){const x=waveBase[i*3]*1.65,v=(waveBase[i*3+1]+37.5)/75,p=waveProfile(v,height,x,t);positions.setXYZ(i,x,p.y,p.z);}positions.needsUpdate=true;wave.geometry.computeVertexNormals();
      const p=foam.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=((i%130)/130*220-110)*1.65,c=waveProfile(1,height,x,t);p.setXYZ(i,x,c.y+Math.sin(i*21+t)*2-(i%5)*.6,wave.position.z+c.z+Math.cos(i*3+t)*3);}p.needsUpdate=true;
    }
    planet.material.uniforms.time.value=t;
    canvas.dataset.authoredAssets='ready';
  }
  update(0,0);
  return {update};
}
