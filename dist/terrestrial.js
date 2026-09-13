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
  function particles(parent, kind, count, tint, size) {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const uniforms = { time: { value: 0 }, size: { value: size }, ratio: { value: 1 }, tint: { value: new THREE.Color(tint) } };
    const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
      blending: kind === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 seed;uniform float time,size,ratio;varying float alpha;varying float variation;
      void main(){float a=seed.x*6.283185;vec3 p=vec3(0.);variation=seed.w;
      ${kind === 'embers' ? `float age=max(0.,time-5.-seed.w*5.);float speed=9.+seed.y*10.;
      p=vec3(-18.+cos(a)*age*speed,12.+age*(14.+seed.z*15.)-age*age*1.3,-27.+sin(a)*age*speed);
      alpha=step(5.+seed.w*5.,time)*(1.-smoothstep(4.,14.,age))*step(.5,p.y);` : kind === 'rupture' ? `
      float age=max(0.,time-4.-seed.w*11.);float z=(seed.x-.5)*165.;float fault=sin(z*.045)*10.+sin(z*.16)*2.;
      p=vec3(fault+(seed.y-.5)*age*4.,age*(3.+seed.z*4.),z+sin(a)*age*.65);
      alpha=step(4.+seed.w*11.,time)*smoothstep(0.,2.,age)*(1.-smoothstep(9.,23.,age))*.22;` : `
      float age=mod(time*.7+seed.w*17.,17.);p=vec3((seed.x-.5)*170.+sin(age*.3+seed.y)*4.,seed.z*19.+age*.6,(seed.y-.5)*170.);
      alpha=smoothstep(0.,4.,time)*sin(age/17.*3.14159)*.23;`}
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
  const factories = {
    'terminator-2': createNuclear,
    '2012': createRupture,
    'war-of-the-worlds': createInvasion
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
