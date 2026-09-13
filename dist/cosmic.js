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
const vertex = `varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;varying vec3 worldNormal;
void main(){point=position;vec4 mv=modelViewMatrix*vec4(position,1.);viewNormal=normalize(normalMatrix*normal);worldNormal=normalize(mat3(modelMatrix)*normal);viewDirection=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
const output = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

// Every transform and shader uniform is a function of time, not accumulated frames.
export function createCosmic({ scene, canvas, camera }) {
  // ULTRA-capable displays get twice the silhouette tessellation; geometry is built once per module.
  const fine = canvas.dataset.qualityCeiling === 'ultra' ? 2 : 1;
  let seed = 77493;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function group(name) {
    const result = new THREE.Group(); result.name = name; result.visible = false; scene.add(result); return result;
  }
  const time = { value: 0 };
  const phase = { value: 0 };
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  const metal = new THREE.MeshStandardMaterial({ color: '#b5b5a8', metalness: .76, roughness: .3 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#26313b', metalness: .7, roughness: .48 });
  const emissive = (color, intensity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });

  function atmosphere(radius, color, opacity = .55) {
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 48 * fine, 32 * fine), new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(color) }, strength: { value: opacity } }, vertexShader: vertex,
      fragmentShader: `uniform vec3 tint;uniform float strength;varying vec3 viewNormal;varying vec3 viewDirection;
      void main(){float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewDirection))),3.);gl_FragColor=vec4(tint,rim*strength);${output}}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
  }

  // A planet that fills the frame needs finer silhouette tessellation than a distant one.
  function earth(radius, position, detail = 1) {
    const group = new THREE.Group(); group.position.copy(position);
    const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, Math.round(64 * fine * detail), Math.round(40 * fine * detail)), new THREE.ShaderMaterial({
      uniforms: { time, heat: { value: 0 }, frost: { value: 0 } }, vertexShader: vertex,
      fragmentShader: `uniform float time,heat,frost;varying vec3 point;varying vec3 worldNormal;${noise}
      void main(){vec3 p=normalize(point);float land=fbm(p*4.7+vec3(.4,2.8,.2));
      float cloud=fbm(p*16.+vec3(time*.018,0.,0.));float terrain=fbm(p*38.);
      vec3 ocean=vec3(.012,.105,.24);vec3 continents=mix(vec3(.035,.13,.067),vec3(.24,.23,.12),terrain);
      vec3 color=mix(ocean,continents,smoothstep(.50,.56,land));
      color=mix(color,mix(vec3(.5,.62,.78),vec3(.9,.93,.96),terrain)*(.8+.2*smoothstep(.5,.56,land)),frost);
      color=mix(color,vec3(.82,.90,.94),smoothstep(.58,.74,cloud)*.55);
      color=mix(color,vec3(.76,.85,.89),smoothstep(.87,.97,abs(p.y))*.88);
      float daylight=dot(normalize(worldNormal),normalize(vec3(-.65,.5,.8)));
      float light=.035+max(daylight,0.);float night=1.-smoothstep(-.25,.07,daylight);
      float cities=pow(noise(p*175.),14.)*smoothstep(.51,.58,land)*night;
      color=color*light+vec3(.95,.45,.15)*cities*.7+vec3(1.6,.19,.016)*heat*(.35+.65*noise(p*22.));
      gl_FragColor=vec4(color,1.);${output}}`
    }));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.014, 48 * fine, 32 * fine), new THREE.ShaderMaterial({
      uniforms: { time }, vertexShader: vertex,
      fragmentShader: `uniform float time;varying vec3 point;varying vec3 worldNormal;${noise}
      void main(){vec3 p=normalize(point);float broad=fbm(p*6.+vec3(time*.002,0.,0.));
      float wisps=fbm(p*18.+broad*2.);float cloud=smoothstep(.49,.73,wisps);
      float light=.09+max(dot(normalize(worldNormal),normalize(vec3(-.65,.5,.8))),0.);
      gl_FragColor=vec4(vec3(.81,.87,.9)*light,cloud*.65);${output}}`,
      transparent: true, depthWrite: false
    }));
    clouds.name = 'Independent planetary cloud deck'; clouds.userData.fineDetail = true;
    const air = atmosphere(radius * 1.035, '#49a9ff', .42); group.add(surface, clouds, air);
    return { group, surface, clouds, air };
  }

  // Every particle position is a closed-form function of time and its seed; nothing integrates between frames.
  const motion = {
    flare: `float distance=fract(seed.y+time*.12);float spread=pow(distance,.7)*(5.+seed.z*19.);
      p=mix(vec3(-15.,53.,-2.),vec3(92.,13.,24.),distance);
      p+=vec3(sin(a)*spread*.25,cos(a)*spread,sin(a)*spread);
      p.y+=sin(distance*3.14159)*14.;opacity=smoothstep(.02,.2,distance)*(1.-smoothstep(.68,1.,distance))*phase;`,
    debris: `float age=fract(seed.y+time*.055);float spread=8.+age*45.;
      p=vec3(-34.-age*96.,52.+age*25.,-12.-age*40.)+vec3(sin(a)*spread,cos(a)*spread*.5,cos(a*2.)*spread*.6);
      opacity=(1.-age)*(.2+phase*.8);`,
    accretion: `float f=fract(seed.y-time*.035);float radius=17.+pow(f,.6)*65.;float angle=a+time*(.2+(1.-f)*1.25);
      p=vec3(cos(angle)*radius,50.+sin(seed.z*6.283185)*(.5+f*6.),sin(angle)*radius);
      opacity=smoothstep(0.,.08,f)*(.3+.7*(1.-f));`,
    // Kessler fragments stream through the station volume along one shared orbit-crossing direction.
    streak: `float run=fract(seed.y+time*.07*(1.+seed.z*.8));warmth=seed.z*.3;
      p=vec3(0.,40.,0.)+vec3(-.482,0.,-.876)*(seed.x-.5)*220.+vec3(.137,.988,-.075)*(seed.w-.5)*150.+vec3(.8655,-.1558,-.476)*(run*640.-320.);
      opacity=phase*(.08+.35*(1.-abs(run-.5)*2.));`,
    // Siphoned atmosphere follows a bent path from the origin to the target, widening as it goes.
    stream: `float s=fract(seed.y+time*.045*(1.+seed.z*.5));warmth=0.;
      vec3 c=mix(origin,target,.45)+vec3(0.,70.,20.);vec3 path=mix(mix(origin,c,s),mix(c,target,s),s);
      float spread=(2.+s*28.)*(1.-s*.3);p=path+vec3(sin(a)*spread,cos(a)*spread*.6,sin(a*1.7)*spread);
      opacity=phase*smoothstep(0.,.05,s)*(1.-smoothstep(.85,1.,s))*.85;`
  };
  function particles(group, count, kind, tint) {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      uniforms: { time, phase, tint: { value: new THREE.Color(tint).multiplyScalar(2) }, pixelRatio: { value: 1 },
        origin: { value: new THREE.Vector3() }, target: { value: new THREE.Vector3() } },
      vertexShader: `attribute vec4 seed;uniform float time,phase,pixelRatio;uniform vec3 origin,target;varying float opacity;varying float warmth;
      void main(){float a=seed.x*6.283185;vec3 p;warmth=seed.z;
      ${motion[kind]}
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.5+seed.w*3.)*pixelRatio*230./max(1.,-mv.z),1.,12.);}`,
      fragmentShader: `uniform vec3 tint;varying float opacity;varying float warmth;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(mix(tint,tint*vec3(1.2,.55,.25),warmth),pow(1.-r,2.)*opacity);${output}}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const cloud = new THREE.Points(geometry, material); cloud.frustumCulled = false; group.add(cloud); cloud.userData.particleCount = count; return cloud;
  }

  function createStars() {
    seed = 77493;
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
  stars.material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a*=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));');
  };
  stars.visible = false; scene.add(stars);

    return stars;
  }
  function createSolar() {
    seed = 77494;
  // KNOWING: a granular photosphere, rooted magnetic loops, and a directed CME.
  const solar = group('knowing-solar-flare');
  const sun = new THREE.Group(); sun.position.set(-35, 54, -8); solar.add(sun);
  const sunSurface = new THREE.Mesh(new THREE.SphereGeometry(31, 80 * fine, 56 * fine), new THREE.ShaderMaterial({
    uniforms: { time, phase }, vertexShader: vertex,
    fragmentShader: `uniform float time,phase;varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;${noise}
    void main(){vec3 p=normalize(point);float grain=fbm(p*39.+vec3(0.,time*.12,0.));float cells=noise(p*83.+grain*2.);
    float spots=smoothstep(.63,.76,fbm(p*8.));float limb=.48+.52*pow(abs(dot(normalize(viewNormal),normalize(viewDirection))),.35);
    vec3 color=mix(vec3(1.6,.12,.008),vec3(3.7,1.25,.18),smoothstep(.22,.74,grain));
    color*=mix(.74,1.22,cells)*(1.-spots*.72)*limb;gl_FragColor=vec4(color*(1.+phase*.35),1.);${output}}`
  }));
  sun.add(sunSurface, atmosphere(32.8, '#ff9a24', 1.1), atmosphere(36.5, '#e84b0c', .34));
  const loops = new THREE.Group(); sun.add(loops); loops.userData.fineDetail = true;
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

    function update(t) {
      phase.value = ease((t - 5) / 8);
      sun.rotation.set(.1, t * .013, -.12); loops.rotation.y = t * .018;
      solarEarth.group.rotation.y = t * .025;
      solarEarth.clouds.rotation.y = t * .009;
      solarEarth.surface.material.uniforms.heat.value = ease((t - 20) / 10) * 1.1;
      solarEarth.air.material.uniforms.tint.value.set(t > 23 ? '#ff8b39' : '#49a9ff');
      flare.visible = t > 5;
      solarShock.visible = t > 8 && t < 27; solarShock.scale.setScalar(32 + ease((t - 8) / 19) * 99);
      solarShock.material.opacity = (1 - ease((t - 8) / 19)) * .3;
    }
    return { group: solar, update };
  }
  function createAsteroid() {
    seed = 77495;
  // ARMAGEDDON: deformed rock, glowing fault networks, and ballistic fragments.
  const asteroidScene = group('armageddon-asteroid');
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
  const fragments = new THREE.InstancedMesh(chunkGeometry, fragmentMat, 150); fragments.userData.total = 150;
  fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fragments.frustumCulled = false; asteroidScene.add(fragments);
  const fragmentSeeds = Array.from({ length: 150 }, () => ({ a: random() * TAU, y: random() * 2 - 1, speed: 9 + random() * 31, size: .4 + Math.pow(random(), 2) * 3.4, offset: random() }));
  const dummy = new THREE.Object3D();
  particles(asteroidScene, 4300, 'debris', '#df8e55');
  const detonation = new THREE.Mesh(new THREE.SphereGeometry(1, 40 * fine, 24 * fine), new THREE.ShaderMaterial({
    uniforms: { time, fade: { value: 0 } }, vertexShader: vertex,
    fragmentShader: `uniform float time,fade;varying vec3 point;${noise}
    void main(){float turbulence=fbm(point*7.+vec3(0.,-time*.4,0.));
    vec3 fire=mix(vec3(.25,.028,.003),vec3(2.8,1.25,.27),smoothstep(.24,.74,turbulence));
    gl_FragColor=vec4(fire,fade*(.7+turbulence*.3));${output}}`,
    transparent: true, depthWrite: false
  })); asteroidScene.add(detonation);
  const asteroidShock = new THREE.Mesh(new THREE.TorusGeometry(1, .017, 6, 100), emissive('#fcb661', 2)); asteroidScene.add(asteroidShock);

    function update(t) {
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
      detonation.material.uniforms.fade.value = 1 - ease((t - 18) / 3);
      asteroidShock.visible = t > 16; asteroidShock.position.copy(asteroid.position); asteroidShock.rotation.set(1.1, .5, .3); asteroidShock.scale.setScalar(1 + split * 90);
      asteroidEarth.group.rotation.y = t * .012;
      asteroidEarth.clouds.rotation.y = t * .009;
    }
    return { group: asteroidScene, update, fragments };
  }
  function createBlackHole() {
    seed = 77496;
  // INTERSTELLAR: an accretion disk and geometric lensing approximation.
  const blackHoleScene = group('interstellar-black-hole');
  const blackHole = new THREE.Group(); blackHole.position.y = 50; blackHoleScene.add(blackHole);
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(16.2, 64 * fine, 40 * fine), new THREE.MeshBasicMaterial({ color: '#000000', fog: false })); blackHole.add(horizon);
  const disk = new THREE.Mesh(new THREE.RingGeometry(19, 74, 192 * fine, 12 * fine), new THREE.ShaderMaterial({
    uniforms: { time }, vertexShader: vertex,
    fragmentShader: `uniform float time;varying vec3 point;${noise}
    void main(){float radius=length(point.xy);float r=(radius-19.)/55.;float a=atan(point.y,point.x);
    vec3 p=vec3(cos(a+time*.13)*9.,sin(a+time*.13)*9.,radius*.65);
    float turbulence=fbm(p+vec3(0.,0.,time*.28));float bands=.6+.4*sin(radius*3.2+turbulence*4.);
    float edge=smoothstep(0.,.035,r)*(1.-smoothstep(.7,1.,r));float hot=pow(1.-r,.72);
    vec3 color=mix(vec3(.5,.085,.018),vec3(2.8,1.8,.95),hot);
    float doppler=.55+.85*pow(.5+.5*cos(a-.7),2.);
    gl_FragColor=vec4(color*(.45+turbulence*.85)*bands*doppler,edge*(.62+hot*.3));${output}}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  }));
  disk.rotation.x = -Math.PI / 2; blackHole.add(disk);
  const lens = new THREE.Group(); blackHole.add(lens);
  const halo = new THREE.Mesh(new THREE.RingGeometry(16.9, 34, 160 * fine, 8 * fine), new THREE.ShaderMaterial({
    uniforms: { time }, vertexShader: vertex,
    fragmentShader: `uniform float time;varying vec3 point;${noise}
    void main(){float radius=length(point.xy);float a=atan(point.y,point.x);float radial=(radius-16.9)/17.1;
    float lens=exp(-radial*5.5)*(.65+.35*sin(radial*90.));float plume=fbm(vec3(cos(a)*8.,sin(a)*8.,radial*8.+time*.15));
    float sides=.3+.7*abs(sin(a));gl_FragColor=vec4(vec3(3.4,1.85,.76)*(.62+plume),lens*sides*.78);${output}}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  })); lens.add(halo);
  const photon = new THREE.Mesh(new THREE.TorusGeometry(16.65, .27, 8, 128 * fine), emissive('#fff2d2', 4.3)); lens.add(photon);
  const rearArc = new THREE.Mesh(new THREE.TorusGeometry(25, 2, 9, 120 * fine, Math.PI), new THREE.ShaderMaterial({
    uniforms: { time }, vertexShader: vertex,
    fragmentShader: `uniform float time;varying vec3 point;${noise}void main(){float n=fbm(point*.9+time*.09);gl_FragColor=vec4(vec3(2.5,1.05,.35)*(.55+n),.48);${output}}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  })); rearArc.position.z = -2; rearArc.scale.y = 1.12; lens.add(rearArc); rearArc.userData.fineDetail = true;
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

    function update(t) {
      phase.value = ease(t / 30);
      const angle = -.7 + t * .035, radius = 75 - ease((t - 17) / 13) * 39;
      craft.position.set(Math.cos(angle) * radius, 34 + Math.sin(angle) * 8, Math.sin(angle) * radius);
      craft.rotation.set(.45, t * .025, -.25 + t * .06);
      craft.scale.setScalar(1 - ease((t - 26) / 4) * .7);
      disk.rotation.z = t * .009;    }
    return { group: blackHoleScene, update, updateView: () => lens.lookAt(camera.position) };
  }
  function createOrbit() {
    seed = 77497;
  // GRAVITY: a low orbit over the terminator, a station, and a debris cascade tearing it apart.
  const cascade = group('gravity-debris-cascade');
  const home = earth(480, new THREE.Vector3(-210, -160, -560), 1.5); cascade.add(home.group);
  const station = new THREE.Group(); station.name = 'Orbital station'; station.position.set(0, 40, 0); cascade.add(station);
  const panelMaterial = new THREE.MeshStandardMaterial({ color: '#12224d', metalness: .55, roughness: .3, emissive: '#0a1f5c', emissiveIntensity: .5 });
  const foil = new THREE.MeshStandardMaterial({ color: '#cfa64a', metalness: .85, roughness: .42 });
  const white = new THREE.MeshStandardMaterial({ color: '#d8dde2', metalness: .3, roughness: .6 });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const trussHalves = [-1, 1].map(side => {
    const half = new THREE.Group(); half.position.x = side * 17.5; station.add(half);
    const beam = new THREE.Mesh(unit, darkMetal); beam.scale.set(35, 2.2, 2.2); half.add(beam);
    const braces = new THREE.InstancedMesh(unit, metal, 18); half.add(braces);
    for (let i = 0; i < 18; i++) {
      dummy.position.set(-16 + (i % 9) * 4, 0, i < 9 ? 1.1 : -1.1); dummy.rotation.set(0, 0, i < 9 ? .6 : -.6); dummy.scale.set(.3, 3.4, .3);
      dummy.updateMatrix(); braces.setMatrixAt(i, dummy.matrix);
    }
    braces.instanceMatrix.needsUpdate = true;
    return half;
  });
  const hub = new THREE.Group(); station.add(hub);
  for (const [z, length, material] of [[-7, 9, foil], [4, 9, metal], [15, 8, foil]]) {
    const module = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, length, 16 * fine), material);
    module.rotation.x = Math.PI / 2; module.position.z = z; hub.add(module);
  }
  const node = new THREE.Mesh(new THREE.SphereGeometry(2.9, 20 * fine, 14 * fine), darkMetal); node.position.z = -1.5; hub.add(node);
  const radiators = new THREE.InstancedMesh(unit, white, 2); station.add(radiators);
  [-1, 1].forEach((side, i) => { dummy.position.set(side * 7, -5.5, 5); dummy.rotation.set(1.2, 0, 0); dummy.scale.set(9, .2, 6); dummy.updateMatrix(); radiators.setMatrixAt(i, dummy.matrix); });
  radiators.instanceMatrix.needsUpdate = true;
  const panels = new THREE.InstancedMesh(unit, panelMaterial, 8); panels.name = 'Solar wings'; station.add(panels);
  const wingX = [-30, -18, 18, 30];
  const panelSeeds = Array.from({ length: 8 }, (_, i) => ({ detach: 11 + i * .85, vx: (random() - .5) * 6, vy: 2 + random() * 4, vz: (random() - .5) * 6, wx: random() * 2, wy: random() * 2, wz: random() * 2 }));
  const astronaut = new THREE.Group(); astronaut.name = 'Untethered astronaut'; cascade.add(astronaut);
  const suit = new THREE.Mesh(new THREE.CapsuleGeometry(.55, 1.3, 4, 8 * fine), white); astronaut.add(suit);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.5, 12 * fine, 8 * fine), foil); visor.position.y = 1.15; astronaut.add(visor);
  const streamDirection = new THREE.Vector3(1, -.18, -.55).normalize(), lateral = new THREE.Vector3(-.482, 0, -.876), vertical = new THREE.Vector3(.137, .988, -.075);
  const debris = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), darkMetal, 240); debris.name = 'Kessler debris field'; debris.userData.total = 240;
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debris.frustumCulled = false; cascade.add(debris);
  const debrisSeeds = Array.from({ length: 240 }, () => ({ u: random() - .5, v: random() - .5, offset: random(), speed: 150 + random() * 130, size: .3 + Math.pow(random(), 2) * 2.4, spin: random() * TAU }));
  particles(cascade, 3200, 'streak', '#cfd8e6');
  const flashes = [[11.3, -30, 40, 9.5], [14.6, 20, 39, -8], [17.9, 2, 42, 4], [20.5, 30, 40, 9.5]];
  const impact = new THREE.Mesh(new THREE.SphereGeometry(1, 16 * fine, 10 * fine), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.6), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
  cascade.add(impact);
  const impactLight = new THREE.PointLight('#fff1d6', 0, 160, 1.5); cascade.add(impactLight);

    function update(t) {
      phase.value = ease((t - 8) / 3);
      home.group.rotation.y = t * .003; home.clouds.rotation.y = t * .0015;
      const tumble = ease((t - 11) / 19);
      station.rotation.set(tumble * .9, t * .01, tumble * 1.3);
      for (let i = 0; i < 8; i++) {
        const s = panelSeeds[i], loose = ease((t - s.detach) / 1.2), age = Math.max(0, t - s.detach) * loose;
        dummy.position.set(wingX[Math.floor(i / 2)] + s.vx * age, s.vy * age, (i % 2 ? 1 : -1) * 9.5 + s.vz * age);
        dummy.rotation.set(.35 + s.wx * age, s.wy * age, s.wz * age); dummy.scale.set(5.2, .15, 14);
        dummy.updateMatrix(); panels.setMatrixAt(i, dummy.matrix);
      }
      panels.instanceMatrix.needsUpdate = true;
      const snap = ease((t - 14) / 2) * Math.max(0, t - 14), shear = ease((t - 17) / 2) * Math.max(0, t - 17);
      trussHalves[1].position.set(17.5 + snap * 1.2, -snap * .8, 0); trussHalves[1].rotation.z = -.5 * ease((t - 14) / 2) - snap * .12;
      hub.rotation.set(shear * .25, 0, ease((t - 17) / 2) * .4); hub.position.y = -shear * .6;
      const drift = Math.max(0, t - 19);
      astronaut.visible = t > 19;
      astronaut.position.set(2 + drift * 1.6, 43 + drift * .9, 4 + drift * .7); astronaut.rotation.set(drift * .9, drift * .5, drift * 1.3);
      debris.visible = t > 8;
      for (let i = 0; i < debris.count; i++) {
        const s = debrisSeeds[i], along = ((t - 8) * s.speed + s.offset * 520) % 520 - 260;
        dummy.position.set(0, 40, 0).addScaledVector(lateral, s.u * 200).addScaledVector(vertical, s.v * 140).addScaledVector(streamDirection, along);
        dummy.rotation.set(t * 2 + s.spin, s.spin, t * 1.5); dummy.scale.set(s.size, s.size * .7, s.size * 1.3);
        dummy.updateMatrix(); debris.setMatrixAt(i, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      impact.visible = false; impactLight.intensity = 0;
      for (const [at, x, y, z] of flashes) {
        const age = t - at;
        if (age < 0 || age > .45) continue;
        const pulse = Math.sin(clamp(age / .45) * Math.PI);
        impact.visible = true; impact.position.set(x, y, z); impact.scale.setScalar(.5 + pulse * 9);
        impactLight.position.set(x, y, z); impactLight.intensity = pulse * 900;
      }
    }
    return { group: cascade, update, fragments: debris };
  }
  function createEngines() {
    seed = 77498;
  // THE WANDERING EARTH: fusion engines push a frozen Earth past Jupiter, then ignite the gas giant.
  const exodus = group('wandering-earth-jupiter-flyby');
  const jupiterPosition = new THREE.Vector3(-190, 130, -520);
  const jupiter = new THREE.Group(); jupiter.position.copy(jupiterPosition); exodus.add(jupiter);
  const flash = { value: 0 };
  const jupiterSurface = new THREE.Mesh(new THREE.SphereGeometry(300, 96 * fine, 64 * fine), new THREE.ShaderMaterial({
    uniforms: { time, flash }, vertexShader: vertex,
    fragmentShader: `uniform float time,flash;varying vec3 point;varying vec3 worldNormal;varying vec3 viewNormal;varying vec3 viewDirection;${noise}
    void main(){vec3 p=normalize(point);float lon=atan(p.z,p.x);
    float turbulence=fbm(p*3.+vec3(time*.01,0.,0.))*.35;float band=sin(p.y*24.+turbulence*6.);
    vec3 color=mix(vec3(.5,.28,.14),vec3(.85,.74,.55),smoothstep(-.2,.6,band));
    color=mix(color,vec3(.93,.9,.84),smoothstep(.6,.9,fbm(p*12.+turbulence))*.4);
    vec2 spot=vec2(lon-1.2,p.y+.22)*vec2(1.,2.4);float storm=1.-smoothstep(.03,.14,length(spot)+fbm(vec3(spot*20.,time*.05))*.03);
    color=mix(color,vec3(.66,.26,.13),storm);
    float daylight=dot(normalize(worldNormal),normalize(vec3(-.65,.5,.8)));float light=.05+max(daylight,0.)*.85;
    float limb=pow(abs(dot(normalize(viewNormal),normalize(viewDirection))),.45);
    color=color*light*(.55+.45*limb);
    color+=vec3(3.,1.7,.7)*flash*pow(max(dot(normalize(worldNormal),normalize(vec3(.37,-.16,.92))),0.),4.);
    gl_FragColor=vec4(color,1.);${output}}`
  }));
  jupiter.add(jupiterSurface, atmosphere(306, '#e9c49c', .35));
  const earthHome = new THREE.Vector3(14, 42, -6), earthPosition = new THREE.Vector3();
  const home = earth(26, earthHome); home.surface.material.uniforms.frost.value = 1; exodus.add(home.group);
  const toJupiter = new THREE.Vector3().subVectors(jupiterPosition, earthHome).normalize();
  const plume = new THREE.MeshBasicMaterial({ color: new THREE.Color('#4fb4ff').multiplyScalar(1.3), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const plumeCore = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff2ff').multiplyScalar(1.7), transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false });
  const jetGeometry = new THREE.ConeGeometry(1, 1, 6 * fine, 1, true);
  const jets = new THREE.InstancedMesh(jetGeometry, plume, 240), cores = new THREE.InstancedMesh(jetGeometry, plumeCore, 240);
  jets.name = 'Fusion engine plumes'; cores.name = 'Plume cores';
  for (const mesh of [jets, cores]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; exodus.add(mesh); }
  // Engines cluster on the cap facing Jupiter so their exhaust visibly pushes the planet away from it.
  const engineSeeds = [];
  while (engineSeeds.length < 240) {
    const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
    if (direction.lengthSq() > 1 || direction.lengthSq() < .05) continue;
    direction.normalize();
    if (direction.dot(toJupiter) > .2) engineSeeds.push({ direction, phase: random() * TAU, width: .6 + random() * .7 });
  }
  const siphon = particles(exodus, 6500, 'stream', '#9fd4ff');
  const ignition = new THREE.Mesh(new THREE.SphereGeometry(1, 40 * fine, 24 * fine), new THREE.ShaderMaterial({
    uniforms: { time, fade: { value: 0 } }, vertexShader: vertex,
    fragmentShader: `uniform float time,fade;varying vec3 point;${noise}
    void main(){float turbulence=fbm(point*7.+vec3(0.,-time*.4,0.));
    vec3 fire=mix(vec3(.25,.028,.003),vec3(2.8,1.25,.27),smoothstep(.24,.74,turbulence));
    gl_FragColor=vec4(fire,fade*(.7+turbulence*.3));${output}}`,
    transparent: true, depthWrite: false
  })); exodus.add(ignition);
  const shockMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(2.5), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const shock = new THREE.Mesh(new THREE.TorusGeometry(1, .012, 6, 120 * fine), shockMaterial); exodus.add(shock);
  shock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toJupiter);
  const ignitionPoint = jupiterPosition.clone().addScaledVector(toJupiter, -296);

    function update(t) {
      const approach = ease(t / 22), push = ease((t - 23) / 7);
      phase.value = ease((t - 7) / 8) * (1 - ease((t - 23) / 2));
      const power = .35 + ease((t - 14) / 3) * .65 + ease((t - 25) / 3) * .4;
      earthPosition.copy(earthHome).addScaledVector(toJupiter, approach * 40 - push * 75);
      home.group.position.copy(earthPosition); home.group.rotation.y = t * .02; home.clouds.rotation.y = t * .008;
      home.air.material.uniforms.tint.value.set(t > 22 && t < 26 ? '#ffb070' : '#8fd4ff');
      home.surface.material.uniforms.heat.value = Math.sin(clamp((t - 22) / 6) * Math.PI) * .4;
      jupiter.rotation.y = t * .003;
      for (let i = 0; i < engineSeeds.length; i++) {
        const s = engineSeeds[i], length = (5 + 20 * power) * (.85 + .15 * Math.sin(t * 4.3 + s.phase));
        dummy.position.copy(earthPosition).addScaledVector(s.direction, 26 + length * .5);
        dummy.quaternion.setFromUnitVectors(up, s.direction);
        dummy.scale.set(s.width * 1.6, length, s.width * 1.6); dummy.updateMatrix(); jets.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(s.width * .6, length * 1.15, s.width * .6); dummy.updateMatrix(); cores.setMatrixAt(i, dummy.matrix);
      }
      jets.instanceMatrix.needsUpdate = true; cores.instanceMatrix.needsUpdate = true;
      siphon.material.uniforms.origin.value.copy(earthPosition).addScaledVector(toJupiter, 26);
      siphon.material.uniforms.target.value.copy(ignitionPoint);
      const blast = clamp((t - 22) / 5);
      ignition.visible = t > 22 && t < 27; ignition.position.copy(ignitionPoint);
      ignition.scale.setScalar(.01 + Math.sin(blast * Math.PI) * 100); ignition.material.uniforms.fade.value = 1 - ease((t - 24) / 3);
      flash.value = Math.sin(clamp((t - 22) / 4) * Math.PI) * .9;
      shock.visible = t > 22.3; shock.position.copy(ignitionPoint); shock.scale.setScalar(1 + ease((t - 22.3) / 8) * 900);
      shockMaterial.opacity = 1 - ease((t - 22.3) / 8);
    }
    return { group: exodus, update };
  }
  const factories = { knowing: createSolar, armageddon: createAsteroid, interstellar: createBlackHole, gravity: createOrbit, 'wandering-earth': createEngines };
  const loaded = new Map();
  let active, stars;
  function setQuality() {
    const quality = canvas.dataset.quality || 'high', ratio = Number(canvas.dataset.pixelRatio) || 1;
    if (active.quality === quality && active.ratio === ratio) return;
    active.quality = quality; active.ratio = ratio;
    const fraction = quality === 'lite' ? .28 : quality === 'balanced' ? .58 : 1;
    active.group.traverse(object => {
      if (object.userData.particleCount) {
        object.geometry.setDrawRange(0, Math.floor(object.userData.particleCount * fraction));
        object.material.uniforms.pixelRatio.value = ratio;
      }
      if (object.userData.fineDetail) object.visible = quality !== 'lite';
    });
    stars.geometry.setDrawRange(0, Math.floor(stars.geometry.attributes.position.count * fraction));
    if (active.fragments) active.fragments.count = Math.floor(active.fragments.userData.total * fraction);
  }
  function update(seconds, config) {
    const factory = factories[config.id];
    if (active && active !== loaded.get(config.id)) active.group.visible = false;
    if (!factory) { if (stars) stars.visible = false; active = undefined; return; }
    if (!stars) stars = createStars();
    if (!loaded.has(config.id)) loaded.set(config.id, factory());
    const next = loaded.get(config.id);
    if (next !== active) next.quality = undefined;
    active = next; active.group.visible = true; stars.visible = true;
    setQuality();
    const t = Math.max(0, Math.min(30, seconds)); time.value = t;
    active.update(t);
  }
  // The lensed image follows the viewer, including orbiting a paused timeline.
  function updateView() { active?.updateView?.(); }
  return { update, updateView };
}
