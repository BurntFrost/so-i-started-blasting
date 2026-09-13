import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const noise = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.11)*.15;}`;
const vertex = `varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;
void main(){point=position;vec4 mv=modelViewMatrix*vec4(position,1.);viewNormal=normalize(normalMatrix*normal);viewDirection=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
const output = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

// Every transform and shader uniform is a function of time, not accumulated frames.
export function createCosmic({ scene, canvas, camera }) {
  let seed = 77493;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const groups = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  groups.forEach((group, i) => { group.name = ['knowing-solar-flare', 'armageddon-asteroid', 'interstellar-black-hole'][i]; group.visible = false; scene.add(group); });
  const time = { value: 0 };
  const phase = { value: 0 };
  const pointClouds = [];
  const fineDetails = [];
  const metal = new THREE.MeshStandardMaterial({ color: '#b5b5a8', metalness: .76, roughness: .3 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#26313b', metalness: .7, roughness: .48 });
  const emissive = (color, intensity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });

  function atmosphere(radius, color, opacity = .55) {
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(color) }, strength: { value: opacity } }, vertexShader: vertex,
      fragmentShader: `uniform vec3 tint;uniform float strength;varying vec3 viewNormal;varying vec3 viewDirection;
      void main(){float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewDirection))),3.);gl_FragColor=vec4(tint,rim*strength);${output}}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
  }

  function earth(radius, position) {
    const group = new THREE.Group(); group.position.copy(position);
    const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), new THREE.ShaderMaterial({
      uniforms: { time, heat: { value: 0 } }, vertexShader: vertex,
      fragmentShader: `uniform float time,heat;varying vec3 point;varying vec3 viewNormal;${noise}
      void main(){vec3 p=normalize(point);float land=fbm(p*4.7+vec3(.4,2.8,.2));
      float cloud=fbm(p*16.+vec3(time*.018,0.,0.));float terrain=fbm(p*38.);
      vec3 ocean=vec3(.012,.105,.24);vec3 continents=mix(vec3(.035,.13,.067),vec3(.24,.23,.12),terrain);
      vec3 color=mix(ocean,continents,smoothstep(.50,.56,land));
      color=mix(color,vec3(.82,.90,.94),smoothstep(.56,.72,cloud)*.83);
      color=mix(color,vec3(.76,.85,.89),smoothstep(.87,.97,abs(p.y))*.88);
      float light=.11+max(dot(normalize(viewNormal),normalize(vec3(-.65,.5,.8))),0.);
      color=color*light+vec3(1.9,.21,.016)*heat*(.35+.65*noise(p*22.));gl_FragColor=vec4(color,1.);${output}}`
    }));
    const air = atmosphere(radius * 1.04, '#49a9ff'); group.add(surface, air);
    return { group, surface, air };
  }

  function particles(group, count, kind, tint) {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      uniforms: { time, phase, tint: { value: new THREE.Color(tint).multiplyScalar(2) }, pixelRatio: { value: 1 } },
      vertexShader: `attribute vec4 seed;uniform float time,phase,pixelRatio;varying float opacity;varying float warmth;
      void main(){float a=seed.x*6.283185;vec3 p;warmth=seed.z;
      ${kind === 'flare' ? `float distance=fract(seed.y+time*.12);float spread=pow(distance,.7)*(5.+seed.z*19.);
      p=mix(vec3(-15.,53.,-2.),vec3(92.,13.,24.),distance);
      p+=vec3(sin(a)*spread*.25,cos(a)*spread,sin(a)*spread);
      p.y+=sin(distance*3.14159)*14.;opacity=smoothstep(.02,.2,distance)*(1.-smoothstep(.68,1.,distance))*phase;`
      : kind === 'debris' ? `float age=fract(seed.y+time*.055);float spread=8.+age*45.;
      p=vec3(-34.-age*96.,52.+age*25.,-12.-age*40.)+vec3(sin(a)*spread,cos(a)*spread*.5,cos(a*2.)*spread*.6);
      opacity=(1.-age)*(.2+phase*.8);`
      : `float f=fract(seed.y-time*.035);float radius=17.+pow(f,.6)*65.;float angle=a+time*(.2+(1.-f)*1.25);
      p=vec3(cos(angle)*radius,50.+sin(seed.z*6.283185)*(.5+f*6.),sin(angle)*radius);
      opacity=smoothstep(0.,.08,f)*(.3+.7*(1.-f));`}
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.5+seed.w*3.)*pixelRatio*230./max(1.,-mv.z),1.,12.);}`,
      fragmentShader: `uniform vec3 tint;varying float opacity;varying float warmth;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(mix(tint,tint*vec3(1.2,.55,.25),warmth),pow(1.-r,2.)*opacity);${output}}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const cloud = new THREE.Points(geometry, material); cloud.frustumCulled = false; group.add(cloud); pointClouds.push(cloud); return cloud;
  }

  // A shared background starfield remains hidden for every terrestrial scene.
  const starsGeometry = new THREE.BufferGeometry();
  const starPositions = [], starColors = [];
  for (let i = 0; i < 3200; i++) {
    const azimuth = random() * TAU, latitude = Math.acos(random() * 2 - 1), radius = 310 + random() * 300;
    starPositions.push(Math.sin(latitude) * Math.cos(azimuth) * radius, 45 + Math.cos(latitude) * radius, Math.sin(latitude) * Math.sin(azimuth) * radius);
    const c = new THREE.Color().setHSL(.55 + random() * .14, .13 + random() * .4, .58 + random() * .42);
    starColors.push(c.r, c.g, c.b);
  }
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ vertexColors: true, size: 1.15, transparent: true, opacity: .86, sizeAttenuation: true, depthWrite: false, fog: false }));
  stars.visible = false; scene.add(stars);

  // KNOWING: a granular photosphere, rooted magnetic loops, and a directed CME.
  const solar = groups[0];
  const sun = new THREE.Group(); sun.position.set(-35, 54, -8); solar.add(sun);
  const sunSurface = new THREE.Mesh(new THREE.SphereGeometry(31, 80, 56), new THREE.ShaderMaterial({
    uniforms: { time, phase }, vertexShader: vertex,
    fragmentShader: `uniform float time,phase;varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;${noise}
    void main(){vec3 p=normalize(point);float grain=fbm(p*39.+vec3(0.,time*.12,0.));float cells=noise(p*83.+grain*2.);
    float spots=smoothstep(.63,.76,fbm(p*8.));float limb=.48+.52*pow(abs(dot(normalize(viewNormal),normalize(viewDirection))),.35);
    vec3 color=mix(vec3(1.6,.12,.008),vec3(3.7,1.25,.18),smoothstep(.22,.74,grain));
    color*=mix(.74,1.22,cells)*(1.-spots*.72)*limb;gl_FragColor=vec4(color*(1.+phase*.35),1.);${output}}`
  }));
  sun.add(sunSurface, atmosphere(32.8, '#ff9a24', 1.1), atmosphere(36.5, '#e84b0c', .34));
  const loops = new THREE.Group(); sun.add(loops); fineDetails.push(loops);
  const loopMat = emissive('#ff6b15', 3.3);
  for (let i = 0; i < 23; i++) {
    const azimuth = i / 23 * TAU, tilt = (random() - .5) * 1.4;
    const direction = new THREE.Vector3(Math.cos(azimuth), Math.sin(tilt), Math.sin(azimuth)).normalize();
    const tangent = new THREE.Vector3(-Math.sin(azimuth), .35, Math.cos(azimuth)).normalize();
    const points = [], height = 3 + random() * 11, width = 3 + random() * 5;
    for (let j = 0; j <= 32; j++) {
      const a = j / 32 * Math.PI;
      points.push(direction.clone().multiplyScalar(30 + Math.sin(a) * height).addScaledVector(tangent, Math.cos(a) * width));
    }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, .13 + random() * .16, 5, false), loopMat);
    loops.add(mesh);
  }
  const solarEarth = earth(9, new THREE.Vector3(58, 23, 18)); solar.add(solarEarth.group);
  const flare = particles(solar, 10000, 'flare', '#ffac44');
  const solarShock = new THREE.Mesh(new THREE.TorusGeometry(1, .003, 6, 96), new THREE.MeshBasicMaterial({ color: '#ffc46d', transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
  solarShock.position.copy(sun.position); solarShock.rotation.set(0, Math.PI / 2, -.28); solar.add(solarShock);

  // ARMAGEDDON: deformed rock, glowing fault networks, and ballistic fragments.
  const asteroidScene = groups[1];
  const asteroidEarth = earth(25, new THREE.Vector3(56, 37, -70)); asteroidScene.add(asteroidEarth.group);
  const asteroid = new THREE.Group(); asteroidScene.add(asteroid);
  const rockGeometry = new THREE.IcosahedronGeometry(23, 4);
  const positions = rockGeometry.attributes.position;
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const n = Math.sin(x * .23 + z * .11) * Math.cos(y * .37) + Math.sin(z * .46 - x * .13) * .36;
    const scale = 1 + n * .16 + Math.sin(x * 1.2 + y * .9 + z * .7) * .025;
    positions.setXYZ(i, x * scale * 1.3, y * scale * .87, z * scale);
    const c = new THREE.Color().setHSL(.06 + n * .02, .1 + Math.abs(n) * .11, .17 + n * .025);
    colors.push(c.r, c.g, c.b);
  }
  rockGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); rockGeometry.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .93, metalness: .13 });
  rockMat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 rockPoint;').replace('#include <begin_vertex>', '#include <begin_vertex>\nrockPoint=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 rockPoint;' + noise)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=normalize(normal+(vec3(noise(rockPoint*1.8),noise(rockPoint.zxy*1.8),noise(rockPoint.yzx*1.8))-.5)*.42);')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=.7+fbm(rockPoint*2.4)*.65;');
  };
  rockMat.customProgramCacheKey = () => 'cosmic-fractured-rock-v1';
  const rock = new THREE.Mesh(rockGeometry, rockMat); asteroid.add(rock);
  const cracks = new THREE.Group(); asteroid.add(cracks);
  const crackMat = emissive('#ff5d16', 1);
  for (let i = 0; i < 14; i++) {
    const points = [], longitude = random() * TAU;
    for (let j = 0; j <= 14; j++) {
      const latitude = .4 + j / 14 * 2.25, a = longitude + Math.sin(j * 2.7 + i) * .09;
      const x = Math.sin(latitude) * Math.cos(a) * 23, y = Math.cos(latitude) * 23, z = Math.sin(latitude) * Math.sin(a) * 23;
      const n = Math.sin(x * .23 + z * .11) * Math.cos(y * .37) + Math.sin(z * .46 - x * .13) * .36;
      const scale = 1.007 + n * .16 + Math.sin(x * 1.2 + y * .9 + z * .7) * .025;
      points.push(new THREE.Vector3(x * scale * 1.3, y * scale * .87, z * scale));
    }
    cracks.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 42, .1 + random() * .12, 5, false), crackMat));
  }
  const chunkGeometry = new THREE.IcosahedronGeometry(1, 1);
  const fragmentMat = new THREE.MeshStandardMaterial({ color: '#5b4b41', roughness: .89, metalness: .18 });
  const fragments = new THREE.InstancedMesh(chunkGeometry, fragmentMat, 150);
  fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fragments.frustumCulled = false; asteroidScene.add(fragments);
  const fragmentSeeds = Array.from({ length: 150 }, () => ({ a: random() * TAU, y: random() * 2 - 1, speed: 9 + random() * 31, size: .4 + Math.pow(random(), 2) * 3.4, offset: random() }));
  const dummy = new THREE.Object3D();
  particles(asteroidScene, 4300, 'debris', '#df8e55');
  const detonation = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), emissive('#ffe4bd', 4)); asteroidScene.add(detonation);
  const asteroidShock = new THREE.Mesh(new THREE.TorusGeometry(1, .017, 6, 100), emissive('#fcb661', 2)); asteroidScene.add(asteroidShock);

  // INTERSTELLAR: an accretion disk and geometric lensing approximation.
  const blackHoleScene = groups[2];
  const blackHole = new THREE.Group(); blackHole.position.y = 50; blackHoleScene.add(blackHole);
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(16.2, 64, 40), new THREE.MeshBasicMaterial({ color: '#000000', fog: false })); blackHole.add(horizon);
  const disk = new THREE.Mesh(new THREE.RingGeometry(19, 74, 192, 12), new THREE.ShaderMaterial({
    uniforms: { time }, vertexShader: vertex,
    fragmentShader: `uniform float time;varying vec3 point;${noise}
    void main(){float radius=length(point.xy);float r=(radius-19.)/55.;float a=atan(point.y,point.x);
    vec3 p=vec3(cos(a+time*.13)*9.,sin(a+time*.13)*9.,radius*.65);
    float turbulence=fbm(p+vec3(0.,0.,time*.28));float bands=.6+.4*sin(radius*3.2+turbulence*4.);
    float edge=smoothstep(0.,.035,r)*(1.-smoothstep(.7,1.,r));float hot=pow(1.-r,.72);
    vec3 color=mix(vec3(.65,.12,.025),vec3(4.,2.7,1.6),hot);
    float doppler=.55+.85*pow(.5+.5*cos(a-.7),2.);
    gl_FragColor=vec4(color*(.45+turbulence*.85)*bands*doppler,edge*(.62+hot*.3));${output}}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  }));
  disk.rotation.x = -Math.PI / 2; blackHole.add(disk);
  const lens = new THREE.Group(); blackHole.add(lens);
  const halo = new THREE.Mesh(new THREE.RingGeometry(16.9, 34, 160, 8), new THREE.ShaderMaterial({
    uniforms: { time }, vertexShader: vertex,
    fragmentShader: `uniform float time;varying vec3 point;${noise}
    void main(){float radius=length(point.xy);float a=atan(point.y,point.x);float radial=(radius-16.9)/17.1;
    float lens=exp(-radial*5.5)*(.65+.35*sin(radial*90.));float plume=fbm(vec3(cos(a)*8.,sin(a)*8.,radial*8.+time*.15));
    float sides=.3+.7*abs(sin(a));gl_FragColor=vec4(vec3(3.4,1.85,.76)*(.62+plume),lens*sides*.78);${output}}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  })); lens.add(halo);
  const photon = new THREE.Mesh(new THREE.TorusGeometry(16.65, .27, 8, 128), emissive('#fff2d2', 4.3)); lens.add(photon);
  const rearArc = new THREE.Mesh(new THREE.TorusGeometry(25, 2, 9, 120, Math.PI), new THREE.ShaderMaterial({
    uniforms: { time }, vertexShader: vertex,
    fragmentShader: `uniform float time;varying vec3 point;${noise}void main(){float n=fbm(point*.9+time*.09);gl_FragColor=vec4(vec3(2.5,1.05,.35)*(.55+n),.48);${output}}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  })); rearArc.position.z = -2; rearArc.scale.y = 1.12; lens.add(rearArc); fineDetails.push(rearArc);
  particles(blackHoleScene, 7300, 'accretion', '#ffe5ba');
  const craft = new THREE.Group(); blackHoleScene.add(craft);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.1, .34, 6, 36), metal); craft.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    const module = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.05, 1.15), i % 3 === 0 ? darkMetal : metal);
    module.position.set(Math.cos(a) * 4.1, Math.sin(a) * 4.1, 0); module.rotation.z = a; craft.add(module);
    const light = new THREE.Mesh(new THREE.BoxGeometry(.62, .1, .03), emissive('#b7eaff', 2)); light.position.z = .59; module.add(light);
  }
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 8, 6), metal); spine.rotation.x = Math.PI / 2; craft.add(spine);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 2.5), metal); cabin.position.z = 3.3; craft.add(cabin);

  let quality;
  function setQuality() {
    const next = canvas.dataset.quality || 'high'; if (next === quality) return;
    quality = next; const fraction = next === 'lite' ? .28 : next === 'balanced' ? .58 : 1;
    for (const cloud of pointClouds) {
      cloud.geometry.setDrawRange(0, Math.floor(cloud.geometry.attributes.position.count * fraction));
      cloud.material.uniforms.pixelRatio.value = Number(canvas.dataset.pixelRatio) || 1;
    }
    stars.geometry.setDrawRange(0, Math.floor(starPositions.length / 3 * fraction));
    fragments.count = Math.floor(150 * fraction);
    fineDetails.forEach(detail => { detail.visible = next !== 'lite'; });
  }

  function update(seconds, index) {
    const selected = index - 7;
    groups.forEach((group, i) => { group.visible = i === selected; });
    stars.visible = selected >= 0 && selected < 3;
    if (!stars.visible) return;
    setQuality();
    const t = Math.max(0, Math.min(30, seconds)); time.value = t;
    if (selected === 0) {
      phase.value = ease((t - 5) / 8);
      sun.rotation.set(.1, t * .013, -.12); loops.rotation.y = t * .018;
      solarEarth.group.rotation.y = t * .025;
      solarEarth.surface.material.uniforms.heat.value = ease((t - 20) / 10) * 1.1;
      solarEarth.air.material.uniforms.tint.value.set(t > 23 ? '#ff8b39' : '#49a9ff');
      flare.visible = t > 5;
      solarShock.visible = t > 8 && t < 27; solarShock.scale.setScalar(32 + ease((t - 8) / 19) * 99);
      solarShock.material.opacity = (1 - ease((t - 8) / 19)) * .3;
    } else if (selected === 1) {
      const split = ease((t - 16) / 12); phase.value = ease(t / 12);
      asteroid.position.set(-24 + ease(t / 30) * 32, 47 - ease(t / 30) * 6, 14 - ease(t / 30) * 22);
      asteroid.rotation.set(t * .013, t * .038, -.18 + t * .01);
      rock.scale.setScalar(1 - split * .38); cracks.scale.copy(rock.scale);
      crackMat.color.set('#ff641b').multiplyScalar(.2 + ease((t - 9) / 10) * 3.8);
      fragments.visible = t > 16;
      for (let i = 0; i < fragments.count; i++) {
        const f = fragmentSeeds[i], distance = 21 + split * f.speed * 2;
        const r = Math.sqrt(1 - f.y * f.y);
        dummy.position.set(asteroid.position.x + Math.cos(f.a) * r * distance, asteroid.position.y + f.y * distance * .55, asteroid.position.z + Math.sin(f.a) * r * distance);
        dummy.rotation.set(f.offset + t * .09, t * .08 + f.a, t * .045);
        dummy.scale.set(f.size, f.size * .68, f.size * 1.2); dummy.updateMatrix(); fragments.setMatrixAt(i, dummy.matrix);
      }
      fragments.instanceMatrix.needsUpdate = true;
      detonation.visible = t > 16 && t < 21; detonation.position.copy(asteroid.position); detonation.scale.setScalar(.01 + Math.sin(clamp((t - 16) / 5) * Math.PI) * 26);
      asteroidShock.visible = t > 16; asteroidShock.position.copy(asteroid.position); asteroidShock.rotation.set(1.1, .5, .3); asteroidShock.scale.setScalar(1 + split * 90);
      asteroidEarth.group.rotation.y = t * .012;
    } else {
      phase.value = ease(t / 30);
      const angle = -.7 + t * .035, radius = 75 - ease((t - 17) / 13) * 39;
      craft.position.set(Math.cos(angle) * radius, 34 + Math.sin(angle) * 8, Math.sin(angle) * radius);
      craft.rotation.set(.45, t * .025, -.25 + t * .06);
      craft.scale.setScalar(1 - ease((t - 26) / 4) * .7);
      disk.rotation.z = t * .009;
    }
  }

  // The lensed image follows the viewer, including orbiting a paused timeline.
  function updateView() {
    if (groups[2].visible) lens.lookAt(camera.position);
  }

  return { update, updateView };
}
