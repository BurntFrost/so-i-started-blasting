import * as THREE from 'three';
import { createBakedExplosion } from './baked-explosion.js';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const tau = Math.PI * 2;
const noise = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.11)*.15;}`;

// Fixed geometry, seeded variation, and absolute-time poses make reverse scrubbing exact.
export function createTerrestrial({ scene, canvas }) {
  // ULTRA-capable displays get twice the silhouette tessellation; geometry is built once per module.
  const fine = canvas.dataset.qualityCeiling === 'ultra' ? 2 : 1;
  let seed = 20121991;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra });
  const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending });
  const sphere = new THREE.IcosahedronGeometry(1, 2);
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const delta = new THREE.Vector3();
  const color = new THREE.Color();
  const fireColor = new THREE.Color('#ffa22b');
  const segmentStart = new THREE.Vector3(), segmentEnd = new THREE.Vector3();
  function group(name) {
    const result = new THREE.Group(); result.name = name; result.visible = false; scene.add(result); return result;
  }
  function instances(parent, geometry, material, count, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(mesh); return mesh;
  }
  function pose(mesh, i, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  function segment(mesh, i, start, end, radius) {
    delta.subVectors(end, start); const length = delta.length();
    dummy.position.copy(start).addScaledVector(delta, .5);
    dummy.quaternion.setFromUnitVectors(up, delta.normalize()); dummy.scale.set(radius, length, radius);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  function texturedMaterial(base, hot, strength, billow = false) {
    const material = mat(base, { roughness: .92, emissive: hot, emissiveIntensity: strength });
    const clock = { value: 0 };
    material.onBeforeCompile = shader => {
      shader.uniforms.terrainTime = clock;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 terrainPoint;' + (billow ? 'uniform float terrainTime;\n' + noise : ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainPoint=position;' + (billow ? '\ntransformed*=.91+fbm(position*5.+vec3(0.,-terrainTime*.12,0.))*.25;' : ''));
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 terrainPoint;uniform float terrainTime;\n' + noise)
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat grain=fbm(terrainPoint*4.+vec3(0.,-terrainTime*.15,0.));diffuseColor.rgb*=mix(.38,1.4,grain);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance*=smoothstep(.37,.78,grain)*2.;');
    };
    material.customProgramCacheKey = () => billow ? 'terrestrial-billowing-surface-v2' : 'terrestrial-turbulent-surface-v1';
    return { material, clock };
  }
  // Every particle position is a closed-form function of time and its seed; nothing integrates between frames.
  const motion = {
    embers: `float age=max(0.,time-5.-seed.w*5.);float speed=9.+seed.y*10.;
      p=vec3(-18.+cos(a)*age*speed,12.+age*(14.+seed.z*15.)-age*age*1.3,-27.+sin(a)*age*speed);
      alpha=step(5.+seed.w*5.,time)*(1.-smoothstep(4.,14.,age))*step(.5,p.y);`,
    rupture: `float age=max(0.,time-4.-seed.w*11.);float z=(seed.x-.5)*165.;float fault=sin(z*.045)*10.+sin(z*.16)*2.;
      p=vec3(fault+(seed.y-.5)*age*4.,age*(3.+seed.z*4.),z+sin(a)*age*.65);
      alpha=step(4.+seed.w*11.,time)*smoothstep(0.,2.,age)*(1.-smoothstep(9.,23.,age))*.22;`,
    invasion: `float age=mod(time*.7+seed.w*17.,17.);p=vec3((seed.x-.5)*170.+sin(age*.3+seed.y)*4.,seed.z*19.+age*.6,(seed.y-.5)*170.);
      alpha=smoothstep(0.,4.,time)*sin(age/17.*3.14159)*.23;`,
    // Dust lifted into the funnel spirals around the moving base and leans with the vortex, then settles as it ropes out.
    vortex: `float age=time-12.5-seed.w*3.;float lift=smoothstep(0.,4.,age);float settle=smoothstep(26.,30.,time);
      float h=(1.+seed.z*seed.z*72.*lift)*(1.-settle*.85);float r=(4.+seed.y*26.)*(.35+.65*lift)*(1.+h*.02);
      float angle=a+time*(2.6+seed.y*1.4)+h*.05;vec2 bend=lean*(h/95.)*(h/95.);
      p=vec3(origin.x+bend.x+cos(angle)*r,origin.y+h,origin.z+bend.y+sin(angle)*r);
      alpha=step(0.,age)*(1.-smoothstep(58.,78.,h))*(1.-settle*.8)*.32;`,
    ash: `float fall=mod(seed.z*150.+time*(9.+seed.w*7.),150.);p=vec3((seed.x-.5)*330.,150.-fall,(seed.y-.5)*330.-40.);
      alpha=smoothstep(10.,18.,time)*smoothstep(0.,8.,fall)*smoothstep(0.,8.,150.-fall)*(.5+.5*seed.y)*.26;`
  };
  function particles(parent, kind, count, tint, size) {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const uniforms = { time: { value: 0 }, size: { value: size }, ratio: { value: 1 }, tint: { value: new THREE.Color(tint) },
      origin: { value: new THREE.Vector3() }, lean: { value: new THREE.Vector2() } };
    const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
      blending: kind === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 seed;uniform float time,size,ratio;uniform vec3 origin;uniform vec2 lean;varying float alpha;varying float variation;
      void main(){float a=seed.x*6.283185;vec3 p=vec3(0.);variation=seed.w;
      ${motion[kind]}
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(size*ratio*240./max(1.,-mv.z),1.,${kind === 'embers' ? '12.' : '100.'});}`,
      fragmentShader: `uniform vec3 tint;varying float alpha;varying float variation;${noise}
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;if(r>1.)discard;
      float a=(1.-smoothstep(.05,1.,r))*alpha;
      ${kind === 'embers' ? '' : 'a*=smoothstep(.18,.6,fbm(vec3(p*5.,variation*13.)));'}
      gl_FragColor=vec4(tint,a);}` });
    const mesh = new THREE.Points(geometry, material); mesh.frustumCulled = false; parent.add(mesh);
    return { mesh, count, uniforms };
  }

  function createNuclear() {
    seed = 20121991;
  // TERMINATOR 2: an incandescent ground burst becomes a rolling mushroom cap.
  const nuclear = group('Terminator 2 — nuclear firestorm');
  const cloudSurface = texturedMaterial('#443732', '#ff7619', 1.6, true);
  const cloud = instances(nuclear, sphere, cloudSurface.material, 72, 'Rolling mushroom cloud lobes');
  const nuclearCore = new THREE.Mesh(new THREE.SphereGeometry(1, 32 * fine, 20 * fine), glow(new THREE.Color(2.8, .85, .1), .7));
  nuclearCore.name = 'Nuclear fireball'; nuclear.add(nuclearCore);
  const shockMaterial = glow('#ffc77c', .8);
  const shock = new THREE.Mesh(new THREE.TorusGeometry(1, .035, 8, 100 * fine), shockMaterial);
  shock.rotation.x = Math.PI / 2; shock.position.set(-18, 1.3, -27); nuclear.add(shock);
  const pressureMaterial = new THREE.MeshBasicMaterial({ color: '#b29b84', transparent: true, opacity: .2, depthWrite: false });
  const pressure = new THREE.Mesh(new THREE.TorusGeometry(1, .065, 8, 100 * fine), pressureMaterial);
  pressure.rotation.x = Math.PI / 2; pressure.position.set(-18, 2, -27); nuclear.add(pressure);
  const nuclearLight = new THREE.PointLight('#ff9437', 0, 230, 1.5);
  nuclearLight.position.set(-18, 23, -27); nuclear.add(nuclearLight);
  const warhead = new THREE.Mesh(new THREE.ConeGeometry(.4, 3, 9), mat('#85827c', { metalness: .9, roughness: .3 }));
  warhead.rotation.z = Math.PI; warhead.position.set(-18, 110, -27); nuclear.add(warhead);
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(.08, .36, 30, 6), glow('#f9dcbe', .55)); nuclear.add(trail);
  const embers = particles(nuclear, 'embers', 2600, new THREE.Color(3, 1.1, .15), 1.8);
  const lobeSeeds = Array.from({ length: 72 }, () => ({ angle: random() * tau, radial: random(), size: .7 + random() * .6, twist: random() * tau }));
  const baked = createBakedExplosion({ canvas, cloud, core: nuclearCore });

  function updateNuclear(t, detail) {
    const ignition = ease((t - 4) / 2), rise = ease((t - 8) / 20), early = 1 - ease((t - 10) / 7);
    const growth = ease((t - 5) / 7);
    cloud.count = detail === 0 ? 36 : detail === 1 ? 54 : 72;
    cloud.visible = t > 4;
    cloudSurface.clock.value = t; cloudSurface.material.emissiveIntensity = .2 + early * 1.9;
    for (let i = 0; i < cloud.count; i++) {
      const s = lobeSeeds[i];
      // Interleave cap and stem at every quality level to preserve the silhouette.
      const stem = i % 3 === 0;
      const a = s.angle + t * (stem ? .045 : .028);
      const radius = stem ? (3 + s.radial * 5) * growth : (9 + s.radial * 25) * growth;
      const y = stem ? 5 + s.radial * (21 + rise * 40) : 17 + rise * 49 + Math.sin(s.radial * Math.PI) * 10;
      const size = (stem ? 5 + growth * 3 : 4 + growth * 9) * s.size * ignition;
      pose(cloud, i, -18 + Math.cos(a) * radius, y, -27 + Math.sin(a) * radius,
        size * (stem ? .82 : 1.23), size * (stem ? 1.25 : .85), size, t * .06 + s.twist, a, s.twist);
      color.set(stem ? '#433b35' : '#766252').lerp(fireColor, early * (1 - s.radial) * .85);
      cloud.setColorAt(i, color);
    }
    cloud.instanceMatrix.needsUpdate = true; cloud.instanceColor.needsUpdate = true;
    nuclearCore.visible = t > 4 && t < 21;
    nuclearCore.position.set(-18, 12 + rise * 43, -27);
    nuclearCore.scale.setScalar(Math.max(.01, (5 + growth * 23) * ignition));
    nuclearCore.material.opacity = ignition * early * .58;
    const radius = 1 + Math.max(0, t - 6) * 11;
    shock.scale.set(radius, radius, 1 + ease((t - 6) / 12) * 8);
    shockMaterial.opacity = ease((t - 5) / 1.5) * (1 - ease((t - 14) / 6)) * .9;
    pressure.scale.set(radius * .89, radius * .89, 8 + growth * 15);
    pressureMaterial.opacity = ignition * (1 - ease((t - 16) / 10)) * .19;
    nuclearLight.intensity = (ignition * early * 900 + rise * 100) * (detail === 0 ? .65 : 1);
    warhead.visible = t < 5; trail.visible = warhead.visible;
    warhead.position.y = 110 - clamp(t / 5) * 103;
    trail.position.set(-18, warhead.position.y + 17, -27);
    baked.update(t);
  }
    return { group: nuclear, update: updateNuclear, particles: embers };
  }
  function createRupture() {
    seed = 20120012;
  // 2012: the street surface splits into lifted crust plates and a jagged abyss.
  const rupture = group('2012 — continental rupture');
  const basalt = texturedMaterial('#514945', '#8e3010', .08);
  const plates = instances(rupture, new THREE.CylinderGeometry(1, 1.22, 1, 5), basalt.material, 42, 'Fractured basalt plates');
  plates.castShadow = true; plates.receiveShadow = true;
  const plateSeeds = Array.from({ length: 42 }, (_, i) => ({ z: -77 + ((Math.floor(i / 2) * 8) % 21) * 7.7,
    side: i % 2 ? 1 : -1, width: 4 + random() * 7, height: 3 + random() * 6, phase: random() * tau }));
  const faultRows = 80, faultLength = 480;
  const crustMaterial = texturedMaterial('#373735', '#4b2416', .04).material;
  crustMaterial.flatShading = true;
  crustMaterial.side = THREE.DoubleSide;
  const crust = [-1, 1].map(side => {
    const geometry = new THREE.BufferGeometry(), indices = [];
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((faultRows + 1) * 12), 3));
    for (let row = 0; row < faultRows; row++) {
      const a = row * 4, b = a + 4;
      indices.push(a, b, a + 1, a + 1, b, b + 1,
        a, a + 2, b, b, a + 2, b + 2,
        a + 1, b + 1, a + 3, a + 3, b + 1, b + 3,
        a + 2, a + 3, b + 2, b + 2, a + 3, b + 3);
    }
    indices.push(0, 1, 2, 1, 3, 2);
    const end = faultRows * 4; indices.push(end, end + 2, end + 1, end + 1, end + 2, end + 3);
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, crustMaterial);
    mesh.name = side < 0 ? 'Western continental crust' : 'Eastern continental crust';
    mesh.receiveShadow = true; mesh.frustumCulled = false; rupture.add(mesh);
    return { mesh, side };
  });
  const chasmGeometry = new THREE.PlaneGeometry(1, 1, 1, faultRows);
  const chasm = new THREE.Mesh(chasmGeometry, new THREE.MeshBasicMaterial({ color: '#070404', side: THREE.DoubleSide }));
  chasm.name = 'Jagged continental chasm'; rupture.add(chasm);
  const faultGeometry = new THREE.PlaneGeometry(1, 1, 1, faultRows);
  const faultMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } }, vertexShader: 'varying vec2 faultUv;void main(){faultUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float time;varying vec2 faultUv;${noise}
    void main(){float veins=fbm(vec3(faultUv*vec2(7.,45.),time*.15));float edge=pow(abs(faultUv.x-.5)*2.,2.);
    float pulse=.7+.3*sin(faultUv.y*40.-time*1.8);
    vec3 hot=mix(vec3(.4,.025,.001),vec3(3.,.75,.03),veins*edge*pulse);
    gl_FragColor=vec4(hot,(.2+edge*.8)*smoothstep(0.,4.,time));}` });
  const fault = new THREE.Mesh(faultGeometry, faultMaterial); rupture.add(fault);
  const rubble = instances(rupture, rock, mat('#71645a', { roughness: .95 }), 150, 'Airborne earthquake masonry');
  const rubbleSeeds = Array.from({ length: 150 }, () => ({ x: (random() - .5) * 55, z: (random() - .5) * 158,
    speed: 2 + random() * 5, launch: 4 + random() * 17, spin: random() * tau, size: .25 + random() * 1.3 }));
  const rupturedRoad = new THREE.Group(); rupturedRoad.name = 'Buckled elevated freeway'; rupture.add(rupturedRoad);
  const roadSurface = mat('#323438', { roughness: .86 });
  const roadPaint = mat('#e2d0a0', { roughness: .8 });
  const railMaterial = mat('#8a9294', { metalness: .7, roughness: .45 });
  const roadSlabs = Array.from({ length: 11 }, () => new THREE.Object3D());
  const roadDecks = instances(rupturedRoad, box, roadSurface, 11, 'Broken freeway decks');
  const roadRails = instances(rupturedRoad, box, railMaterial, 22, 'Freeway guardrails');
  const roadStripes = instances(rupturedRoad, box, roadPaint, 11, 'Freeway lane markings');
  const roadSupports = instances(rupturedRoad, box, basalt.material, 11, 'Freeway concrete supports');
  roadDecks.castShadow = true;
  function roadPart(mesh, i, slab, x, y, z, sx, sy, sz) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix(); dummy.matrix.premultiply(slab.matrix); mesh.setMatrixAt(i, dummy.matrix);
  }
  const faultLight = new THREE.PointLight('#ff5426', 0, 130, 1.7); faultLight.position.set(0, 10, 15); rupture.add(faultLight);
  const faultDust = particles(rupture, 'rupture', 650, '#967b67', 36);

  function updateRupture(t, detail) {
    const opening = ease((t - 3) / 23), violence = ease((t - 6) / 16);
    basalt.clock.value = t; faultMaterial.uniforms.time.value = t;
    for (const { mesh, side } of crust) {
      const p = mesh.geometry.attributes.position;
      for (let row = 0; row <= faultRows; row++) {
        const z = faultLength * (.5 - row / faultRows);
        const center = Math.sin(z * .045) * 10 + Math.sin(z * .16) * 2;
        const inner = center + side * (.35 + opening * (9 + Math.sin(z * .11) * 3));
        const a = row * 4;
        p.setXYZ(a, inner, -1.05, z); p.setXYZ(a + 1, side * 320, -1.05, z);
        p.setXYZ(a + 2, inner + side * 9, -80, z); p.setXYZ(a + 3, side * 320, -80, z);
      }
      p.needsUpdate = true; mesh.geometry.computeVertexNormals();
    }
    for (const mesh of [chasm, fault]) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const row = Math.floor(i / 2), z = faultLength * (.5 - row / faultRows);
        const center = Math.sin(z * .045) * 10 + Math.sin(z * .16) * 2;
        const halfWidth = .35 + opening * (9 + Math.sin(z * .11) * 3);
        p.setXYZ(i, center + (i % 2 ? 1 : -1) * halfWidth, mesh === chasm ? .12 : .18, z);
      }
      p.needsUpdate = true;
    }
    plates.count = detail === 0 ? 28 : 42;
    for (let i = 0; i < plates.count; i++) {
      const s = plateSeeds[i];
      const local = ease((t - 3 - (s.z + 77) * .045) / 18);
      const center = Math.sin(s.z * .045) * 10 + Math.sin(s.z * .16) * 2;
      pose(plates, i, center + s.side * (s.width + local * 11), -2 + local * (s.height + 3), s.z,
        s.width, s.height, 5.7, local * Math.sin(s.phase) * .55, s.phase, s.side * local * .58);
    }
    plates.instanceMatrix.needsUpdate = true;
    rubble.count = detail === 0 ? 45 : detail === 1 ? 90 : 150;
    for (let i = 0; i < rubble.count; i++) {
      const s = rubbleSeeds[i], age = Math.max(0, t - s.launch);
      const alive = t >= s.launch && age < 8;
      const lift = Math.max(0, age * s.speed - age * age * .7);
      const size = alive ? s.size : .001;
      pose(rubble, i, s.x + Math.sign(s.x) * age * 1.7, 1 + lift, s.z + Math.sin(s.spin) * age,
        size, size * .7, size * 1.25, age + s.spin, age * .7, age * 1.4);
    }
    rubble.instanceMatrix.needsUpdate = true;
    roadSlabs.forEach((slab, i) => {
      const distance = Math.abs(i - 5), bend = ease((t - 6 - distance * 1.1) / 15);
      slab.position.y = 7 + bend * (distance < 2 ? 17 - distance * 6 : Math.sin(i) * 4);
      slab.position.x = -75 + i * 15 + Math.sign(i - 5) * bend * 7;
      slab.position.z = 47;
      slab.rotation.z = bend * (i < 5 ? -.12 : .14) * (distance < 3 ? 3 : 1);
      slab.rotation.x = bend * Math.sin(i * 1.7) * .16;
      slab.updateMatrix();
      roadPart(roadDecks, i, slab, 0, 0, 0, 14.6, 2, 9);
      roadPart(roadRails, i * 2, slab, 0, 2, -3.8, 14.7, .5, .2);
      roadPart(roadRails, i * 2 + 1, slab, 0, 2, 3.8, 14.7, .5, .2);
      roadPart(roadStripes, i, slab, 0, 1.02, 0, 8, .03, .15);
      roadPart(roadSupports, i, slab, 0, -4, 0, 2, 6, 5);
    });
    for (const mesh of [roadDecks, roadRails, roadStripes, roadSupports]) mesh.instanceMatrix.needsUpdate = true;
    roadRails.visible = detail > 0;
    faultLight.intensity = 90 + violence * 420;
  }
    return { group: rupture, update: updateRupture, particles: faultDust };
  }
  function createInvasion() {
    seed = 20052005;
  // WAR OF THE WORLDS: three independent walkers with posed limbs and scanning rays.
  const invasion = group('War of the Worlds — tripod invasion');
  const machine = mat('#526065', { metalness: .94, roughness: .27 });
  const darkMachine = mat('#182025', { metalness: .8, roughness: .43 });
  const lensMaterial = glow(new THREE.Color(.4, 1.2, 3.5));
  const walkers = [];
  const walkersLayout = [[20, 12, 1], [-46, -36, .82], [46, -63, .69]];
  walkersLayout.forEach(([x, z, scale], index) => {
    const walker = new THREE.Group(); walker.name = `Articulated tripod ${index + 1}`;
    walker.scale.setScalar(scale); invasion.add(walker);
    const head = new THREE.Group(); walker.add(head);
    const carapace = new THREE.Mesh(new THREE.SphereGeometry(1, 24 * fine, 14 * fine), machine); carapace.scale.set(13, 5.1, 8);
    carapace.castShadow = true; head.add(carapace);
    const underbody = new THREE.Mesh(sphere, darkMachine); underbody.position.y = -2.3; underbody.scale.set(9, 4, 6); head.add(underbody);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(7.5, 2.6, 3), machine); crown.position.y = 4.5; crown.rotation.y = Math.PI / 6; head.add(crown);
    const plating = instances(head, box, machine, 12, 'Radial tripod armor');
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * tau; pose(plating, i, Math.sin(a) * 10, -.8, Math.cos(a) * 5.6, 2, .65, 3, .14, a, 0);
    }
    plating.instanceMatrix.needsUpdate = true;
    const eyes = instances(head, sphere, lensMaterial, 3, 'Triangular optical array');
    for (let i = 0; i < 3; i++) pose(eyes, i, (i - 1) * 2.7, -1.7 + (i === 1 ? 1 : 0), 7.2, .72, .46, .28);
    eyes.instanceMatrix.needsUpdate = true;
    const limbs = instances(walker, cylinder, machine, 24, 'Hydraulic leg segments and claws');
    const joints = instances(walker, sphere, darkMachine, 9, 'Tripod articulated joints');
    const cables = instances(walker, cylinder, darkMachine, 15, 'Hanging mechanical tendrils');
    const ray = new THREE.Mesh(cylinder, glow(new THREE.Color(.45, 1.25, 3.6), .6)); walker.add(ray);
    const rayHalo = new THREE.Mesh(cylinder, glow('#899dff', .1)); walker.add(rayHalo);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(3, 24), glow('#bbd5ff', .8)); scorch.rotation.x = -Math.PI / 2; walker.add(scorch);
    const rayLight = new THREE.PointLight('#9ebdff', 0, 55, 1.6); walker.add(rayLight);
    const positions = Array.from({ length: 12 }, () => new THREE.Vector3());
    walkers.push({ walker, head, limbs, joints, cables, plating, ray, rayHalo, scorch, rayLight, positions, x, z, scale, index });
  });
  const weedMaterial = mat('#5b151a', { roughness: .85, emissive: '#7d1018', emissiveIntensity: .3 });
  const weed = instances(invasion, new THREE.ConeGeometry(.8, 1, 5), weedMaterial, 360, 'Spreading red weed');
  const weedSeeds = Array.from({ length: 360 }, () => ({ x: (random() - .5) * 164, z: (random() - .5) * 150,
    size: .8 + random() * 2.6, angle: random() * tau, threshold: random() }));
  const invasionDust = particles(invasion, 'invasion', 480, '#9c8988', 27);

  function updateInvasion(t, detail) {
    const waking = ease(t / 5), assault = ease((t - 7) / 4);
    walkers.forEach(w => {
      w.walker.visible = detail > 0 || w.index < 2;
      if (!w.walker.visible) return;
      const stride = t * .55 + w.index * 2;
      w.walker.position.set(w.x + Math.sin(stride * .3) * 5, 0, w.z + t * .42);
      w.walker.rotation.y = -.22 + Math.sin(t * .12 + w.index) * .2;
      w.head.position.set(0, 48 + waking * 12 + Math.sin(stride * 2) * 1.2, 0);
      w.head.rotation.z = Math.sin(stride) * .035;
      let limb = 0, joint = 0;
      for (let leg = 0; leg < 3; leg++) {
        const a = leg / 3 * tau + Math.PI, swing = stride + leg * tau / 3;
        const hip = w.positions[leg * 3], knee = w.positions[leg * 3 + 1], foot = w.positions[leg * 3 + 2];
        hip.set(Math.sin(a) * 5, w.head.position.y - 3, Math.cos(a) * 4);
        knee.set(Math.sin(a + .18) * 18, 29 + Math.sin(swing) * 3, Math.cos(a + .18) * 17 + Math.cos(swing) * 2);
        foot.set(Math.sin(a) * 27, Math.max(0, Math.sin(swing)) * 5 + .5, Math.cos(a) * 25 + Math.cos(swing) * 5);
        segment(w.limbs, limb++, hip, knee, 1.05); segment(w.limbs, limb++, knee, foot, .65);
        segmentStart.set(hip.x + 1.15, hip.y - 2, hip.z + .4);
        segmentEnd.set(knee.x + 1.15, knee.y + 1, knee.z + .4);
        segment(w.limbs, limb++, segmentStart, segmentEnd, .23);
        for (const p of [hip, knee, foot]) pose(w.joints, joint++, p.x, p.y, p.z, 1.5, 1.25, 1.5, 0, a);
        for (let toe = 0; toe < 3; toe++) {
          segmentEnd.set(foot.x + Math.sin(a + (toe - 1) * .65) * 4,
            Math.max(.2, foot.y - 1), foot.z + Math.cos(a + (toe - 1) * .65) * 4);
          segment(w.limbs, limb++, foot, segmentEnd, .32);
        }
      }
      w.limbs.count = limb; w.joints.count = joint;
      w.limbs.instanceMatrix.needsUpdate = true; w.joints.instanceMatrix.needsUpdate = true;
      w.cables.visible = detail > 0; w.plating.visible = detail > 0;
      for (let cable = 0; cable < 5; cable++) {
        const a = cable * tau / 5, x = Math.sin(a) * 4, z = Math.cos(a) * 3;
        for (let part = 0; part < 3; part++) {
          const y = w.head.position.y - 5 - part * 5;
          segmentStart.set(x + Math.sin(t * .8 + cable + part * .5) * part, y, z);
          segmentEnd.set(x + Math.sin(t * .8 + cable + (part + 1) * .5) * (part + 1), y - 5, z + part * .35);
          segment(w.cables, cable * 3 + part, segmentStart, segmentEnd, .19);
        }
      }
      w.cables.instanceMatrix.needsUpdate = true;
      const source = w.positions[9].set(0, w.head.position.y - 1.5, 7);
      const target = w.positions[10].set(12 + Math.sin(t * .31 + w.index * 2) * 24, .55, 31 + Math.cos(t * .22 + w.index) * 12);
      delta.subVectors(target, source); const length = delta.length();
      const beamPower = assault * (.58 + .42 * ease(Math.sin(t * 1.6 + w.index)));
      for (const [beam, width] of [[w.ray, .24], [w.rayHalo, 1.2]]) {
        beam.position.copy(source).addScaledVector(delta, .5);
        beam.quaternion.setFromUnitVectors(up, segmentEnd.copy(delta).normalize()); beam.scale.set(width, length, width);
        beam.visible = beamPower > .02; beam.material.opacity = beamPower * (beam === w.ray ? .7 : .13);
      }
      w.scorch.position.copy(target); w.scorch.scale.setScalar(1 + beamPower * .7); w.scorch.material.opacity = beamPower * .8;
      w.rayLight.position.copy(target).y += 2; w.rayLight.intensity = detail === 0 ? 0 : beamPower * 130;
    });
    weed.count = detail === 0 ? 120 : detail === 1 ? 220 : 360;
    for (let i = 0; i < weed.count; i++) {
      const s = weedSeeds[i], growth = ease((t - 10 - s.threshold * 8) / 10);
      pose(weed, i, s.x, .1 + s.size * growth, s.z, s.size * growth, s.size * 2 * growth + .001,
        s.size * growth, Math.sin(t * .3 + s.angle) * .2, s.angle, Math.sin(s.angle) * .3);
    }
    weed.instanceMatrix.needsUpdate = true;
  }
    return { group: invasion, update: updateInvasion, particles: invasionDust };
  }
  // Mirrors the lawn displacement applied in cinema.js so ground objects sit on the rolling terrain.
  const terrainHeight = (x, z) => -.5 + (Math.sin(x * .022) * Math.cos(z * .027) * 5 - Math.sin(z * .06) * 1.5) * clamp((Math.hypot(x, z) - 25) / 80);
  const boltMaterial = glow(new THREE.Color(2.4, 2.9, 3.6), 1);
  function bolt(parent, start, end, name) {
    const points = [];
    for (let i = 0; i <= 9; i++) {
      const f = i / 9, jitter = i === 0 || i === 9 ? 0 : 16;
      points.push(new THREE.Vector3(start.x + (end.x - start.x) * f + (random() - .5) * jitter, start.y + (end.y - start.y) * f,
        start.z + (end.z - start.z) * f + (random() - .5) * jitter));
    }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, .45, 4, false), boltMaterial);
    mesh.name = name; mesh.visible = false; mesh.frustumCulled = false; mesh.userData.tip = new THREE.Vector3(end.x, end.y + 10, end.z);
    parent.add(mesh); return mesh;
  }
  // Each strike shows its bolt for a sixth of a second while its flash fades over a third.
  function strike(t, strikes, bolts, light) {
    let flash = 0, active;
    for (const mesh of bolts) mesh.visible = false;
    for (const [at, index] of strikes) {
      const age = t - at;
      if (age < 0 || age > .34) continue;
      bolts[index].visible = age < .16; flash = Math.max(flash, 1 - age / .34); active = bolts[index];
    }
    light.intensity = flash * light.userData.peak;
    if (active) light.position.copy(active.userData.tip);
  }
  function createTornado() {
    seed = 19961996;
  // TWISTER: a rotating wall cloud lowers an F5 funnel that crosses a farmstead.
  const outbreak = group('Twister — F5 outbreak');
  const base = t => [-95 + t * 4, -95 + t * 2.2];
  const funnelSurface = (() => {
    const material = mat('#3a3733', { roughness: 1, transparent: true, opacity: .92, side: THREE.DoubleSide, depthWrite: false });
    const shape = { value: new THREE.Vector4(4, 60, 100, 1.7) }, lean = { value: new THREE.Vector2() }, clock = { value: 0 };
    material.onBeforeCompile = shader => {
      shader.uniforms.funnelShape = shape; shader.uniforms.funnelLean = lean; shader.uniforms.funnelTime = clock;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 funnelShape;uniform vec2 funnelLean;uniform float funnelTime;varying vec2 funnelUv;' + noise)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        float h=position.y+.5;float a=atan(position.z,position.x);funnelUv=vec2(a,h);
        float r=mix(funnelShape.x,funnelShape.y,pow(h,funnelShape.w))*(.85+fbm(vec3(cos(a)*1.5,sin(a)*1.5,h*6.-funnelTime*1.3))*.35);
        transformed=vec3(cos(a)*r,h*funnelShape.z,sin(a)*r)+vec3(funnelLean.x,0.,funnelLean.y)*h*h;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float funnelTime;varying vec2 funnelUv;' + noise)
        .replace('#include <color_fragment>', `#include <color_fragment>
        float spiral=funnelUv.x+funnelUv.y*4.+funnelTime*.5;
        float bands=fbm(vec3(cos(spiral)*2.2,sin(spiral)*2.2,funnelUv.y*9.-funnelTime*1.8));
        diffuseColor.rgb*=.6+bands*.8;diffuseColor.a*=(.55+bands*.55)*smoothstep(0.,.05,funnelUv.y)*(1.-smoothstep(.88,1.,funnelUv.y));`);
    };
    material.customProgramCacheKey = () => 'terrestrial-funnel-v1';
    return { material, shape, lean, clock };
  })();
  const funnelGeometry = new THREE.CylinderGeometry(1, 1, 1, 48 * fine, 36, true);
  const funnel = new THREE.Mesh(funnelGeometry, funnelSurface.material); funnel.name = 'Condensation funnel'; funnel.frustumCulled = false; outbreak.add(funnel);
  const core = new THREE.Mesh(funnelGeometry, funnelSurface.material); core.name = 'Funnel core'; core.frustumCulled = false; core.scale.set(.5, 1, .5); outbreak.add(core);
  const cloudSurface = texturedMaterial('#3a4441', '#000000', 0, true);
  const wall = instances(outbreak, sphere, cloudSurface.material, 40, 'Rotating wall cloud');
  const wallSeeds = Array.from({ length: 40 }, () => ({ angle: random() * tau, radial: random(), size: .75 + random() * .5, twist: random() * tau }));
  const dustSurface = texturedMaterial('#6b6052', '#000000', 0, true);
  const dust = instances(outbreak, sphere, dustSurface.material, 24, 'Ground debris cloud');
  const dustSeeds = Array.from({ length: 24 }, () => ({ angle: random() * tau, radial: random(), size: .7 + random() * .6, twist: random() * tau }));
  const planks = instances(outbreak, box, mat('#7d6a55', { roughness: .9 }), 140, 'Airborne farm debris');
  const plankSeeds = Array.from({ length: 140 }, () => ({ angle: random() * tau, radial: random(), height: random(), pickup: random(), spin: random() * tau, size: .5 + random() * 1.5 }));
  const farm = new THREE.Group(); farm.name = 'Farmstead'; farm.position.set(-30, terrainHeight(-30, -58), -58); outbreak.add(farm);
  // A triangular prism whose ridge runs along x, apex one unit up and eaves half a unit down.
  const prism = new THREE.CylinderGeometry(1, 1, 1, 3, 1); prism.rotateY(Math.PI / 2); prism.rotateZ(Math.PI / 2);
  const siding = mat('#ddd6c6', { roughness: .8 }), shingle = mat('#4f3b32', { roughness: .95 }), barnRed = mat('#8e2d25', { roughness: .85 });
  const steel = mat('#a9b0b4', { metalness: .55, roughness: .5 });
  const part = (parent, geometry, material, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const house = new THREE.Group(); house.name = 'Farmhouse'; farm.add(house);
  const houseBody = part(house, box, siding, 0, 2.75, 0, 12, 5.5, 9);
  const houseRoof = part(house, prism, shingle, 0, 6.65, 0, 13, 3.4 / 1.5, 5.5 / .866);
  const chimney = part(house, box, mat('#7a3b2e'), 3.2, 7.4, 1.5, 1, 2.6, 1);
  const barn = new THREE.Group(); barn.name = 'Barn'; barn.position.set(21, 0, 8); farm.add(barn);
  const barnBody = part(barn, box, barnRed, 0, 4.5, 0, 14, 9, 20);
  const barnRoof = part(barn, prism, shingle, 0, 10.5, 0, 21, 4.5 / 1.5, 8.5 / .866); barnRoof.rotation.y = Math.PI / 2;
  const silo = new THREE.Group(); silo.name = 'Grain silo'; silo.position.set(34, 0, -3); farm.add(silo);
  part(silo, cylinder, steel, 0, 8.5, 0, 3.5, 17, 3.5); part(silo, sphere, steel, 0, 17, 0, 3.5, 2.2, 3.5);
  const windmill = new THREE.Group(); windmill.name = 'Windpump'; windmill.position.set(-17, 0, 11); farm.add(windmill);
  part(windmill, new THREE.ConeGeometry(1.6, 16, 4), steel, 0, 8, 0, 1, 1, 1);
  const wheel = new THREE.Group(); wheel.position.set(0, 16.5, 1.2); windmill.add(wheel);
  part(wheel, new THREE.TorusGeometry(2.6, .12, 5, 20), steel, 0, 0, 0, 1, 1, 1);
  for (let i = 0; i < 4; i++) part(wheel, box, steel, 0, 0, 0, 5.2, .5, .08).rotation.z = i * Math.PI / 4;
  const fence = instances(farm, box, mat('#8c7b64', { roughness: .9 }), 50, 'Fence line');
  const bolts = [bolt(outbreak, new THREE.Vector3(-20, 100, -95), new THREE.Vector3(-4, terrainHeight(-4, -112), -112), 'Lightning strike east'),
    bolt(outbreak, new THREE.Vector3(-70, 100, -30), new THREE.Vector3(-82, terrainHeight(-82, -8), -8), 'Lightning strike west'),
    bolt(outbreak, new THREE.Vector3(30, 100, -70), new THREE.Vector3(46, terrainHeight(46, -86), -86), 'Lightning strike north')];
  const strikes = [[11.2, 0], [16.6, 1], [21.3, 2]];
  const flashLight = new THREE.PointLight('#cfe0ff', 0, 300, 1.4); flashLight.userData.peak = 1300; outbreak.add(flashLight);
  const funnelDust = particles(outbreak, 'vortex', 1500, '#8a7e70', 20);

  function updateTornado(t, detail) {
    const down = ease((t - 8) / 5), spread = ease((t - 13) / 6), ropeOut = ease((t - 26) / 4);
    const [bx, bz] = base(t), ground = terrainHeight(bx, bz), height = 25 + down * 75, wobble = 1 + ropeOut * 3;
    const lx = -7 + Math.sin(t * .6) * 6 * wobble, lz = -3.5 + Math.cos(t * .45) * 5 * wobble;
    funnelSurface.shape.value.set((3 + spread * 11) * (1 - ropeOut * .85), 42 + spread * 24, height, 1.6 + ropeOut * .6);
    funnelSurface.lean.value.set(lx, lz); funnelSurface.clock.value = t;
    // The funnel hangs from the wall cloud; its top stays at the ceiling while the tip descends.
    for (const mesh of [funnel, core]) mesh.position.set(bx, 100 + ground - height, bz);
    core.visible = detail > 0;
    cloudSurface.clock.value = t; dustSurface.clock.value = t;
    wall.count = detail === 0 ? 24 : 40;
    const cx = bx + lx, cz = bz + lz;
    for (let i = 0; i < wall.count; i++) {
      // A wide, flat rotating slab under the ceiling; its underside stays above the funnel top.
      const s = wallSeeds[i], a = s.angle + t * (.06 + (1 - s.radial) * .16), r = 16 + s.radial * 72;
      pose(wall, i, cx + Math.cos(a) * r, 102 + ground + Math.sin(s.twist + t * .2) * 3 + s.radial * 8, cz + Math.sin(a) * r,
        32 * s.size, 7 * s.size, 32 * s.size, s.twist, a, s.twist * .3);
    }
    wall.instanceMatrix.needsUpdate = true;
    dust.visible = t > 12.6;
    for (let i = 0; i < dust.count; i++) {
      const s = dustSeeds[i], a = s.angle + t * (1.8 + s.radial), r = (6 + s.radial * 16) * (.4 + spread * .6) * (1 - ropeOut * .7);
      const size = (5 + spread * 6) * s.size * (1 - ropeOut * .6);
      pose(dust, i, bx + Math.cos(a) * r, ground + 2 + s.radial * 7, bz + Math.sin(a) * r, size * 1.3, size * .8, size * 1.3, t * .4 + s.twist, a, s.twist);
    }
    dust.instanceMatrix.needsUpdate = true;
    planks.count = detail === 0 ? 60 : detail === 1 ? 100 : 140;
    for (let i = 0; i < planks.count; i++) {
      const s = plankSeeds[i], age = t - 12.5 - s.pickup * 3, lift = ease(age / 4), settle = ease((t - 26) / 4);
      const h = (1 + s.height * s.height * 60 * lift) * (1 - settle * .85), r = (5 + s.radial * 24) * (.35 + .65 * lift) * (1 + h * .02);
      const angle = s.angle + t * (2.4 + s.radial * 1.2) + h * .05, bend = (h / 95) ** 2, size = age > 0 ? s.size : .001;
      pose(planks, i, bx + lx * bend + Math.cos(angle) * r, ground + h, bz + lz * bend + Math.sin(angle) * r,
        size * 3, size * .3, size * .9, t * 3 + s.spin, angle, t * 2);
    }
    planks.instanceMatrix.needsUpdate = true;
    const hit = ease((t - 15.4) / 2.2), hitBarn = ease((t - 15.9) / 2.2);
    houseRoof.position.set(hit * Math.cos(t * 2.7) * 18, 6.65 + hit * 40, hit * Math.sin(t * 2.7) * 18);
    houseRoof.rotation.set(hit * t * 2.2, hit * t * 1.1, hit * .9);
    houseBody.scale.y = 5.5 * (1 - hit * .85); houseBody.position.y = houseBody.scale.y / 2; houseBody.rotation.z = hit * .55;
    chimney.position.y = 7.4 - hit * 4; chimney.rotation.x = hit * 1.2;
    barnRoof.position.set(hitBarn * Math.sin(t * 2.4) * 22, 10.5 + hitBarn * 46, hitBarn * Math.cos(t * 2.4) * 22);
    barnRoof.rotation.set(hitBarn * t * 1.7, Math.PI / 2 + hitBarn * t * 1.3, hitBarn * 1.1);
    barnBody.scale.y = 9 * (1 - hitBarn * .8); barnBody.position.y = barnBody.scale.y / 2; barnBody.rotation.x = hitBarn * .4;
    silo.rotation.set(0, hit * .5, hit * 1.42);
    wheel.rotation.z = t * (2 + ease((t - 8) / 6) * 14); windmill.rotation.x = hit * 1.3;
    for (let i = 0; i < 25; i++) {
      const pull = ease((t - 14.8 - i * .06) / 1.4), x = -44 + i * 2.5;
      pose(fence, i, x + pull * (Math.sin(i) * 30 + 10), .8 + pull * (15 + (i % 7) * 6), 24 + pull * Math.cos(i * 1.3) * 25,
        .3, 1.6, .3, pull * t * 2, pull * i, pull * t * 1.5);
      pose(fence, 25 + i, x + 1.25 + pull * (Math.cos(i) * 28 - 6), 1.2 + pull * (12 + (i % 5) * 7), 24 + pull * Math.sin(i * 1.7) * 22,
        2.5, .12, .12, pull * t * 1.7, pull * i * .7, pull * t * 2.3);
    }
    fence.instanceMatrix.needsUpdate = true;
    strike(t, strikes, bolts, flashLight);
    funnelDust.uniforms.origin.value.set(bx, ground, bz); funnelDust.uniforms.lean.value.set(lx, lz);
  }
    return { group: outbreak, update: updateTornado, particles: funnelDust };
  }
  function createEruption() {
    seed = 19971997;
  // DANTE'S PEAK: a stratovolcano's Plinian column, ballistic lava bombs and a pyroclastic surge down the flank.
  const eruption = group("Dante's Peak — Plinian eruption");
  const vent = new THREE.Vector3(-60, 0, -250);
  const flank = (x, z) => { const d = Math.hypot(x - vent.x, z - vent.z); return d < 32 ? 88 : Math.max(120 * (1 - d / 130), terrainHeight(x, z)); };
  const ash = { value: 0 };
  const mountainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true });
  mountainMaterial.onBeforeCompile = shader => {
    shader.uniforms.ashFall = ash;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float ashFall;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.34,.31,.29),ashFall);');
  };
  mountainMaterial.customProgramCacheKey = () => 'terrestrial-ashfall-v1';
  function peak(radius, height, craterDepth, x, z, name) {
    const geometry = new THREE.ConeGeometry(radius, height, 72 * fine, 26, false); geometry.translate(0, height / 2, 0);
    const p = geometry.attributes.position, colors = [], snowLine = height * .7, treeLine = height * .34;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), angle = Math.atan2(pz, px);
      const ridge = Math.sin(angle * 7 + py * .05) * .5 + Math.sin(angle * 3 - py * .02) * .3 + Math.sin(angle * 17 + py * .11) * .2;
      const scale = 1 + ridge * .09 * clamp((py - 4) / 30), crater = ease((py - height * .75) / (height * .25));
      p.setXYZ(i, px * scale, py - crater * craterDepth + Math.sin(px * .13 + pz * .17) * 1.5 * clamp((py - 8) / 40), pz * scale);
      const n = Math.sin(px * .07 + pz * .05) * Math.cos(py * .09), band = py + n * 8;
      const c = band > snowLine ? new THREE.Color().setHSL(.58, .05, .84 + n * .05)
        : band > treeLine ? new THREE.Color().setHSL(.07 + n * .01, .12 + Math.abs(n) * .08, .21 + n * .04)
          : new THREE.Color().setHSL(.3, .18, .13 + n * .03);
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mountainMaterial); mesh.name = name; mesh.position.set(x, -1, z); mesh.receiveShadow = true; eruption.add(mesh); return mesh;
  }
  peak(130, 120, 34, vent.x, vent.z, 'Stratovolcano'); peak(84, 64, 0, 98, -268, 'Neighbouring ridge');
  const craterMaterial = glow(new THREE.Color(3, .9, .15), 0);
  const craterGlow = new THREE.Mesh(new THREE.CircleGeometry(24, 24), craterMaterial); craterGlow.name = 'Rising magma';
  craterGlow.rotation.x = -Math.PI / 2; craterGlow.position.set(vent.x, 87, vent.z); eruption.add(craterGlow);
  const columnSurface = texturedMaterial('#38332f', '#ff6a1c', 1.3, true);
  const column = instances(eruption, sphere, columnSurface.material, 72, 'Plinian eruption column');
  const columnSeeds = Array.from({ length: 72 }, () => ({ angle: random() * tau, radial: random(), size: .75 + random() * .5, twist: random() * tau }));
  const bombs = instances(eruption, rock, mat('#2a1610', { emissive: '#ff4d10', emissiveIntensity: 2.4, roughness: .9 }), 64, 'Ballistic lava bombs');
  const bombSeeds = Array.from({ length: 64 }, () => ({ launch: 6 + random() * 17, angle: random() * tau, lateral: 6 + random() * 30, vertical: 42 + random() * 40, size: .7 + random() * 2.2, spin: random() * tau }));
  const surgeSurface = texturedMaterial('#6a645e', '#ff7a2a', .4, true);
  const surge = instances(eruption, sphere, surgeSurface.material, 54, 'Pyroclastic surge front');
  const surgeSeeds = Array.from({ length: 54 }, (_, i) => ({ fan: (random() - .5) * 1.5, reach: .55 + random() * .45, trail: i % 3 === 0 ? 1 : .55 + random() * .4, size: .8 + random() * .5, twist: random() * tau }));
  const surgeHeading = Math.atan2(1, .15);
  const bolts = [bolt(eruption, new THREE.Vector3(vent.x + 26, 150, vent.z - 14), new THREE.Vector3(vent.x + 8, 92, vent.z + 6), 'Volcanic lightning east'),
    bolt(eruption, new THREE.Vector3(vent.x - 30, 175, vent.z + 10), new THREE.Vector3(vent.x - 9, 94, vent.z - 5), 'Volcanic lightning west'),
    bolt(eruption, new THREE.Vector3(vent.x + 12, 215, vent.z + 28), new THREE.Vector3(vent.x + 3, 96, vent.z + 12), 'Volcanic lightning south')];
  const strikes = [[9.4, 0], [12.1, 1], [17.7, 2], [23.5, 1]];
  const flashLight = new THREE.PointLight('#dfe6ff', 0, 320, 1.4); flashLight.userData.peak = 1600; eruption.add(flashLight);
  const ventLight = new THREE.PointLight('#ff7a2a', 0, 420, 1.3); ventLight.position.set(vent.x, 100, vent.z); eruption.add(ventLight);
  const ashFall = particles(eruption, 'ash', 1100, '#7f776f', 4.5);

  function updateEruption(t, detail) {
    const rise = ease((t - 6) / 16), growth = ease((t - 6) / 4), early = 1 - ease((t - 9) / 9);
    const front = ease((t - 13) / 17), hot = 1 - ease((t - 17) / 9);
    ash.value = ease((t - 12) / 14) * .75;
    craterMaterial.opacity = ease((t - 3) / 3) * (.55 + Math.sin(t * 4) * .15);
    column.visible = t > 6; column.count = detail === 0 ? 40 : detail === 1 ? 56 : 72;
    columnSurface.clock.value = t; columnSurface.material.emissiveIntensity = .15 + early * 1.4;
    for (let i = 0; i < column.count; i++) {
      const s = columnSeeds[i], stem = i % 3 !== 0, a = s.angle + t * (stem ? .3 : .12), fraction = s.radial;
      // Two thirds of the lobes form the rising stem; the rest spread into the umbrella at its top.
      const y = stem ? 86 + fraction * rise * 210 : 80 + rise * 210 + Math.sin(fraction * Math.PI) * 18;
      const radius = stem ? (6 + fraction * 12 + rise * 6) * growth : (14 + fraction * 96) * rise;
      const size = (stem ? 9 + rise * 9 + fraction * 4 : 12 + rise * 20) * s.size * growth;
      pose(column, i, vent.x + Math.cos(a) * radius, y, vent.z + Math.sin(a) * radius,
        size * (stem ? .95 : 1.35), size * (stem ? 1.45 : .8), size, t * .05 + s.twist, a, s.twist);
      color.set(stem ? '#2f2a27' : '#59524d').lerp(fireColor, early * (1 - fraction) * (stem ? .95 : .3));
      column.setColorAt(i, color);
    }
    column.instanceMatrix.needsUpdate = true; column.instanceColor.needsUpdate = true;
    bombs.count = detail === 0 ? 28 : detail === 1 ? 46 : 64;
    for (let i = 0; i < bombs.count; i++) {
      const s = bombSeeds[i], age = t - s.launch;
      const x = vent.x + Math.cos(s.angle) * s.lateral * age, z = vent.z + Math.sin(s.angle) * s.lateral * age, y = 88 + s.vertical * age - 16 * age * age;
      const size = age > 0 && age < 9 && y > flank(x, z) - 3 ? s.size : .001;
      pose(bombs, i, x, y, z, size, size * .8, size * 1.2, age * 3 + s.spin, age * 2, s.spin);
    }
    bombs.instanceMatrix.needsUpdate = true;
    surge.visible = t > 13; surge.count = detail === 0 ? 30 : detail === 1 ? 42 : 54;
    surgeSurface.clock.value = t; surgeSurface.material.emissiveIntensity = .05 + hot * .35;
    for (let i = 0; i < surge.count; i++) {
      const s = surgeSeeds[i], distance = front * (40 + s.reach * 250) * s.trail, angle = surgeHeading + s.fan;
      const x = vent.x + Math.cos(angle) * distance, z = vent.z + Math.sin(angle) * distance;
      const size = (5 + distance * .06) * s.size * Math.min(1, front * 4);
      pose(surge, i, x, flank(x, z) + size * .55, z, size * 1.3, size * .85, size * 1.3, t * .08 + s.twist, angle, s.twist * .5);
      color.set('#615b55').lerp(fireColor, hot * .18 * (1.3 - s.trail)); surge.setColorAt(i, color);
    }
    surge.instanceMatrix.needsUpdate = true; surge.instanceColor.needsUpdate = true;
    ventLight.intensity = ease((t - 5) / 2) * 1400 * (early * .8 + .2) * (detail === 0 ? .6 : 1);
    strike(t, strikes, bolts, flashLight);
  }
    return { group: eruption, update: updateEruption, particles: ashFall };
  }
  const factories = {
    'terminator-2': createNuclear,
    '2012': createRupture,
    'war-of-the-worlds': createInvasion,
    'twister': createTornado,
    'dantes-peak': createEruption
  };
  const loaded = new Map();
  let active;
  return {
    update(time, config) {
      const factory = factories[config.id];
      if (active && active !== loaded.get(config.id)) active.group.visible = false;
      if (!factory) { active = undefined; return; }
      if (!loaded.has(config.id)) loaded.set(config.id, factory());
      active = loaded.get(config.id); active.group.visible = true;
      const t = Math.max(0, Math.min(30, time));
      const quality = canvas.dataset.quality;
      const detail = quality === 'lite' ? 0 : quality === 'balanced' ? 1 : 2;
      active.update(t, detail);
      const selectedParticles = active.particles;
      selectedParticles.uniforms.time.value = t;
      selectedParticles.uniforms.ratio.value = Math.min(Number(canvas.dataset.pixelRatio) || 1, 2);
      selectedParticles.mesh.geometry.setDrawRange(0, Math.floor(selectedParticles.count * [ .35, .65, 1 ][detail]));
    }
  };
}
