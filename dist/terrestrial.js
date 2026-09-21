import * as THREE from 'three/webgpu';
import { createShaderMaterial, recordSurface } from './shader-program.js';
import { applyParticleAtlas } from './particle-atlas.js';
import { createBakedExplosion } from './baked-explosion.js';
import { marchedVolume, setInside, volumeFrame, volumeUniforms as sharedVolumeUniforms, markEffects, markEffect } from './render-kit.js';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const tau = Math.PI * 2;
// A light that leaves the visible set changes the scene's light signature, and the node
// renderer regenerates every material's shader when it does, freezing playback for a third
// of a second. Hero lights therefore hang off the always-visible scene group and mirror
// their host's world pose, staying dark through intensity while the host is hidden.
const hostedPoint = new THREE.Vector3();
function hostLight(light, host, x, y, z) {
  host.updateWorldMatrix(true, false);
  hostedPoint.set(x, y, z).applyMatrix4(host.matrixWorld);
  light.position.copy(light.parent.worldToLocal(hostedPoint));
}
const noise = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.11)*.15;}`;

// Fixed geometry, seeded variation, and absolute-time poses make reverse scrubbing exact.
// The baseline city buildings and the landscape group are shared with the simulation: the superstorm
// hangs icicles from the roof edges and the visitor's swarm consumes the park trees.
export function createTerrestrial({ scene, canvas, camera, buildings = [], landscape }) {
  const volumeUniforms = extra => sharedVolumeUniforms(extra, canvas);
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
  const rimGlow = (tint, strength) => createShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(tint) }, strength: { value: strength } },
    vertexShader: 'varying vec3 rimNormal;varying vec3 rimView;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);rimNormal=normalize(normalMatrix*normal);rimView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 tint;uniform float strength;varying vec3 rimNormal;varying vec3 rimView;void main(){float rim=pow(1.-abs(dot(rimNormal,rimView)),3.);gl_FragColor=vec4(tint,rim*strength);}',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
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
    recordSurface(material,{kind:'terrain',uniforms:{terrainTime:clock},billow});
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
      alpha=step(0.,age)*(1.-smoothstep(58.,78.,h))*(1.-settle*.8)*.24;`,
    // Twister inflow: low dust streams race across the fields into the funnel base and lift near it.
    inflow: `float cycle=9.;float age=mod(time*(.6+seed.w*.4)+seed.z*cycle,cycle);float r=4.+(30.+seed.y*150.)*(1.-age/cycle);
      float angle=a+time*.9+(180.-r)*.02;
      p=vec3(origin.x+cos(angle)*r,origin.y+.6+seed.z*3.+(1.-smoothstep(4.,40.,r))*seed.x*30.,origin.z+sin(angle)*r);
      alpha=smoothstep(8.,14.,time)*(1.-smoothstep(26.,30.,time)*.8)*smoothstep(0.,1.5,age)*(1.-smoothstep(7.5,9.,age))*.22;`,
    ash: `float fall=mod(seed.z*150.+time*(9.+seed.w*7.),150.);p=vec3((seed.x-.5)*330.,150.-fall,(seed.y-.5)*330.-40.);
      alpha=smoothstep(10.,18.,time)*smoothstep(0.,8.,fall)*smoothstep(0.,8.,150.-fall)*(.5+.5*seed.y)*.26;`,
    // Superstorm snow streams downwind across the whole city; the gust strength climbs from flurries to a whiteout.
    blizzard: `float gust=8.+smoothstep(4.,18.,time)*40.;float fall=6.+seed.w*10.;
      p=vec3(mod(seed.x*320.+time*gust*(.75+seed.z*.5),320.)-160.,mod(seed.y*140.-time*fall,140.)-1.,mod(seed.z*300.+time*gust*.28+sin(time*1.9+seed.w*11.)*3.,300.)-150.);
      alpha=(.18+.82*smoothstep(3.,16.,time))*(.45+.55*seed.w);`,
    // Spindrift: sheets of blown snow that hug the frozen streets.
    spindrift: `float gust=10.+smoothstep(6.,20.,time)*46.;
      p=vec3(mod(seed.x*340.+time*gust*(.8+seed.z*.4),340.)-170.,-.4+seed.y*seed.y*7.5+sin(time*2.3+seed.w*8.)*.6,mod(seed.z*300.+time*gust*.3,300.)-150.);
      alpha=smoothstep(8.,20.,time)*(1.-seed.y*seed.y)*.3;`,
    // Nanites hold in a tight cloud on GORT's body, then spread as an expanding disk that swallows the park.
    swarm: `float spread=smoothstep(19.,30.,time);float hold=1.-spread;
      float r=(1.2+seed.y*3.5)*hold+spread*(20.+seed.y*250.);float angle=a+time*(2.2+seed.z*5.)/(1.+r*.04);
      float h=seed.w*(hold*24.+spread*(2.+r*.09))+sin(time*4.+seed.x*20.)*(.3+spread*1.5);
      p=vec3(origin.x+cos(angle)*r,max(.2,origin.y+h),origin.z+sin(angle)*r);
      alpha=smoothstep(17.5,19.5,time)*(.4+.5*seed.w)*(1.-smoothstep(150.,260.,r));`,
    // The swarm's dust body: boiling gray puffs that roll outward at ground level behind the front.
    plague: `float spread=smoothstep(19.,30.,time);float r=spread*(6.+seed.y*250.);float angle=a+time*(.6+seed.z*1.5);
      p=vec3(origin.x+cos(angle)*r,1.5+seed.w*(4.+spread*14.),origin.z+sin(angle)*r);
      alpha=smoothstep(19.,21.,time)*(1.-smoothstep(.6,1.,seed.y))*.45;`,
    // Souls rise from the whole city as points of light once the anti-A.T. field spreads at 24.
    ascension: `float start=24.+seed.w*4.;float age=max(0.,time-start);
      p=vec3((seed.x-.5)*340.,-.5+age*(7.+seed.z*9.)+sin(time*1.7+seed.y*30.)*.8,(seed.y-.5)*300.-20.);
      alpha=step(start,time)*smoothstep(0.,1.,age)*(1.-smoothstep(45.,130.,p.y))*.9;`
  };
  // Snowflakes, nanites and rising souls stay crisp points; every other kind is a soft turbulent puff.
  const crisp = new Set(['embers', 'blizzard', 'swarm', 'ascension']);
  const pointCap = { embers: '12.', blizzard: '7.', swarm: '5.', ascension: '7.', vortex: '55.', inflow: '40.' };
  function particles(parent, kind, count, tint, size) {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const uniforms = { time: { value: 0 }, size: { value: size }, ratio: { value: 1 }, tint: { value: new THREE.Color(tint) },
      origin: { value: new THREE.Vector3() }, lean: { value: new THREE.Vector2() } };
    const material = createShaderMaterial({ uniforms, transparent: true, depthWrite: false,
      blending: kind === 'embers' || kind === 'ascension' ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 seed;uniform float time,size,ratio;uniform vec3 origin;uniform vec2 lean;varying float alpha;varying float variation;
      void main(){float a=seed.x*6.283185;vec3 p=vec3(0.);variation=seed.w;
      ${motion[kind]}
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(size*ratio*240./max(1.,-mv.z),1.,${pointCap[kind] || '100.'});}`,
      fragmentShader: `uniform vec3 tint;varying float alpha;varying float variation;${noise}
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;if(r>1.)discard;
      float a=(1.-smoothstep(.05,1.,r))*alpha;
      ${crisp.has(kind) ? '' : 'a*=smoothstep(.18,.6,fbm(vec3(p*5.,variation*13.)));'}
      gl_FragColor=vec4(tint,a);}` });
    applyParticleAtlas(material, { canvas, kind, motion: motion[kind], opacity: 'alpha' });
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
  const faultMaterial = createShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
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
    const rayLight = new THREE.PointLight('#9ebdff', 0, 55, 1.6); invasion.add(rayLight);
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
      if (!w.walker.visible) { w.rayLight.intensity = 0; return; }
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
      hostLight(w.rayLight, w.walker, target.x, target.y + 2, target.z); w.rayLight.intensity = detail === 0 ? 0 : beamPower * 130;
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
    let flash = 0, active, activeIndex;
    for (const mesh of bolts) mesh.visible = false;
    for (const [at, index] of strikes) {
      const age = t - at;
      if (age < 0 || age > .34) continue;
      bolts[index].visible = age < .16; flash = Math.max(flash, 1 - age / .34); active = bolts[index]; activeIndex = index;
    }
    light.intensity = flash * light.userData.peak;
    if (active) light.position.copy(active.userData.tip);
    return { flash, active: activeIndex };
  }
  function createTornado() {
    seed = 19961996;
  // TWISTER: a rotating wall cloud lowers an F5 funnel that crosses a farmstead.
  const outbreak = group('Twister — F5 outbreak');
  const base = t => [-95 + t * 4, -95 + t * 2.2];
  // LITE and BALANCED keep the two-shell mesh funnel, which the phone geometry budget already covers.
  const funnelSurface = (() => {
    const material = mat('#3a3733', { roughness: 1, transparent: true, opacity: .92, side: THREE.DoubleSide, depthWrite: false });
    const shape = { value: new THREE.Vector4(4, 60, 100, 1.7) }, lean = { value: new THREE.Vector2() }, clock = { value: 0 };
    recordSurface(material,{kind:'funnel',uniforms:{funnelShape:shape,funnelLean:lean,funnelTime:clock}});
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

  // HIGH and ULTRA march the funnel and the wall cloud as volumes (see marchedVolume).
  const funnelVolume = marchedVolume({ name: 'Funnel volume', geometry: new THREE.CylinderGeometry(1, 1, 1, 48 * fine, 24, false),
    uniforms: volumeUniforms({ shape: { value: new THREE.Vector4(4, 60, 100, 1.7) }, lean: { value: new THREE.Vector2() }, skirt: { value: 0 }, spread: { value: 0 } }),
    vertexShader: `uniform vec4 shape;uniform vec2 lean;uniform float skirt;varying vec3 hullPoint;
    float profile(float h){return mix(shape.x,shape.y,pow(clamp(h,0.,1.),shape.w));}
    void main(){float h=position.y+.5;float r=profile(h)*1.3+skirt*(1.-smoothstep(0.,.2,h));
    vec4 world=modelMatrix*vec4(vec3(position.x*r,h*shape.z,position.z*r)+vec3(lean.x,0.,lean.y)*h*h,1.);
    hullPoint=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    declare: `uniform vec4 shape;uniform vec2 lean;uniform float skirt,spread;
    float profile(float h){return mix(shape.x,shape.y,pow(clamp(h,0.,1.),shape.w));}
    float chord(){float hEntry=clamp((hullPoint.y-origin.y)/shape.z,0.,1.);return (profile(hEntry)*1.3+skirt*(1.-smoothstep(0.,.2,hEntry)))*2.3;}`,
    // Density and dust share at a world point: the condensation funnel, three suction vortices orbiting the
    // base, and the debris bowl kicked up once the funnel is on the ground.
    field: `vec3 field(vec3 p,bool detail){
      float h=(p.y-origin.y)/shape.z;if(h<0.||h>1.)return vec3(0.);
      vec2 q=p.xz-origin.xz-lean*h*h;float radius=length(q),angle=atan(q.y,q.x),R=profile(h);
      float twist=angle-time*(2.4-h*1.5)-h*7.;
      vec3 n=vec3(cos(twist)*(1.+radius/R)*1.6,h*9.-time*.9,sin(twist)*(1.+radius/R)*1.6);
      float ragged=fbm(n*1.25);
      float body=(1.-smoothstep(.72,1.,radius/(R*(.7+ragged*.55))))*smoothstep(0.,.015,h);
      float sub=0.;
      for(int k=0;k<3;k++){float ph=float(k)*2.0944+time*3.3;sub+=1.-smoothstep(0.,R*.22,length(q-vec2(cos(ph),sin(ph))*R*.95));}
      float d=body+sub*(1.-smoothstep(0.,.3,h))*spread*.8;
      float grain=detail&&d>.001?fbm(n*3.3+11.):.5;
      d*=.6+.4*grain;
      float bowl=0.;
      if(h<.36&&skirt>0.){
        float spin=angle-time*1.5;vec2 qr=vec2(cos(spin),sin(spin))*radius;
        float lobes=detail?fbm(vec3(qr*.11,h*20.)):.5;
        float low=1.-smoothstep(0.,.25*(.55+.9*lobes),h);
        float reach=R+skirt*low*(.8+.5*lobes);
        bowl=(1.-smoothstep(.3,1.,radius/reach))*low*(.5+.5*lobes)*1.1;}
      d+=bowl;return vec3(d,bowl/max(d,1e-3),grain);
    }`,
    span: 'chord()', dt: '.6,2.5', loop: 64, absorb: '1.3', terrainCut: true,
    // Condensation is near-black grey; the debris bowl is warm dust in the funnel's shadow; the grain paints the bands.
    shade: `float h=clamp((p.y-origin.y)/shape.z,0.,1.);
            float shade=exp(-field(p+sunDirection*(profile(h)*.45+2.),false).x*2.6);
            vec3 albedo=mix(vec3(.11,.115,.11),vec3(.3,.25,.19),f.y)*(.55+.9*f.z);
            sampleColor=albedo*((sunColor*(.08+.92*shade)*1.1+skyColor*mix(.12,.55,h))*mix(1.,.55,f.y)+vec3(.75,.85,1.15)*flash*3.*exp(-(1.-h)*2.5));` });
  outbreak.add(funnelVolume);
  const wallVolume = marchedVolume({ name: 'Wall cloud volume', geometry: new THREE.CylinderGeometry(1, 1, 1, 48 * fine, 1, false).translate(0, .5, 0),
    uniforms: volumeUniforms({ radius: { value: 120 }, thickness: { value: 30 } }), renderOrder: 2,
    declare: 'uniform float radius,thickness;',
    // The rotating wall cloud: a lumpy slab whose underside sags toward the funnel top.
    field: `vec3 field(vec3 p,bool detail){
      vec2 q=p.xz-origin.xz;float radial=length(q)/radius;if(radial>1.)return vec3(0.);
      float h=(p.y-origin.y)/thickness,angle=atan(q.y,q.x),rot=angle-time*.12-radial*1.6;
      vec3 n=vec3(cos(rot)*radial*3.2,h*2.2+time*.04,sin(rot)*radial*3.2);
      float lumps=fbm(n*1.3),under=.3-(1.-radial)*.22+(lumps-.5)*.3;
      float body=(1.-smoothstep(.5,1.,radial/(.55+lumps*.4)))*smoothstep(under,under+.15,h)*(1.-smoothstep(.75,1.05,h));
      if(detail&&body>.001)body*=.6+.4*fbm(n*3.1+5.);
      return vec3(body,0.,0.);
    }`,
    span: 'min(thickness*1.4/max(abs(rayDir.y),.15),radius*2.2)', dt: '1.,6.', loop: 32, absorb: '.9',
    shade: `float h=clamp((p.y-origin.y)/thickness,0.,1.),grain=fbm(p*.045+vec3(0.,time*.03,0.));
            vec3 albedo=mix(vec3(.12,.135,.13),vec3(.17,.15,.125),grain)*(.7+.6*grain);
            sampleColor=albedo*(skyColor*mix(.6,1.2,h)*1.1+sunColor*.08+vec3(.8,.9,1.25)*flash*4.*exp(-length(p-flashPoint)/45.));` });
  wallVolume.scale.set(120, 30, 120); outbreak.add(wallVolume);

  const cloudSurface = texturedMaterial('#3a4441', '#000000', 0, true);
  const wall = instances(outbreak, sphere, cloudSurface.material, 40, 'Rotating wall cloud');
  const wallSeeds = Array.from({ length: 40 }, () => ({ angle: random() * tau, radial: random(), size: .75 + random() * .5, twist: random() * tau }));
  const dustSurface = texturedMaterial('#6b6052', '#000000', 0, true);
  const dust = instances(outbreak, sphere, dustSurface.material, 24, 'Ground debris cloud');
  const dustSeeds = Array.from({ length: 24 }, () => ({ angle: random() * tau, radial: random(), size: .7 + random() * .6, twist: random() * tau }));
  const debrisSeeds = count => Array.from({ length: count }, () => ({ angle: random() * tau, radial: random(), height: random(), pickup: random(), spin: random() * tau, size: .5 + random() * 1.5 }));
  const planks = instances(outbreak, box, mat('#7d6a55', { roughness: .9 }), 140, 'Airborne farm debris');
  const plankSeeds = debrisSeeds(140);
  // Heavier debris rides the same spiral and is stretched along its own velocity, which reads as motion blur
  // without any frame history.
  const sheets = instances(outbreak, box, mat('#6e5a4a', { roughness: .85, side: THREE.DoubleSide }), 40, 'Airborne roof panels'), sheetSeeds = debrisSeeds(40);
  const limbs = instances(outbreak, cylinder, mat('#3c3128', { roughness: .95 }), 40, 'Airborne tree limbs'), limbSeeds = debrisSeeds(40);
  const clods = instances(outbreak, rock, mat('#4a3b2c', { roughness: 1 }), 90, 'Airborne dirt clods'), clodSeeds = debrisSeeds(90);
  const rain = instances(outbreak, box, mat('#8fa3ac', { transparent: true, opacity: .3, depthWrite: false }), 900, 'Rain curtain');
  const rainSeeds = Array.from({ length: 900 }, () => ({ angle: random() * tau, radial: random(), phase: random() }));
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
  const boltStarts = [new THREE.Vector3(-20, 100, -95), new THREE.Vector3(-70, 100, -30), new THREE.Vector3(30, 100, -70)];
  const bolts = [bolt(outbreak, boltStarts[0], new THREE.Vector3(-4, terrainHeight(-4, -112), -112), 'Lightning strike east'),
    bolt(outbreak, boltStarts[1], new THREE.Vector3(-82, terrainHeight(-82, -8), -8), 'Lightning strike west'),
    bolt(outbreak, boltStarts[2], new THREE.Vector3(46, terrainHeight(46, -86), -86), 'Lightning strike north')];
  const strikes = [[11.2, 0], [16.6, 1], [21.3, 2]];
  const flashLight = new THREE.PointLight('#cfe0ff', 0, 300, 1.4); flashLight.userData.peak = 1300; outbreak.add(flashLight);
  const funnelDust = particles(outbreak, 'vortex', 1000, '#5b544b', 20);
  const inflow = particles(outbreak, 'inflow', 1200, '#57514a', 14);
  const trees = landscape ? landscape.children.slice(1).filter(child => child.isGroup) : [];

  // Position of one debris seed on the spiral at time t, its size factor (zero before pickup) and its angle.
  const spiral = (s, t, bx, bz, ground, lx, lz) => {
    const age = t - 12.5 - s.pickup * 3, lift = ease(age / 4), settle = ease((t - 26) / 4);
    const h = (1 + s.height * s.height * 60 * lift) * (1 - settle * .85), r = (5 + s.radial * 24) * (.35 + .65 * lift) * (1 + h * .02);
    const angle = s.angle + t * (2.4 + s.radial * 1.2) + h * .05, bend = (h / 95) ** 2;
    return [bx + lx * bend + Math.cos(angle) * r, ground + h, bz + lz * bend + Math.sin(angle) * r, age > 0 ? s.size : .001, angle];
  };
  // A streak is aligned to its velocity, sampled 40 ms ahead on the same closed-form spiral, and elongated with speed.
  const streak = (mesh, i, s, t, bx, bz, ground, lx, lz, width, depth, stretch) => {
    const [x, y, z, size] = spiral(s, t, bx, bz, ground, lx, lz), [x2, y2, z2] = spiral(s, t + .04, bx, bz, ground, lx, lz);
    segmentStart.set(x, y, z); segmentEnd.set(x2, y2, z2); delta.subVectors(segmentEnd, segmentStart);
    const speed = delta.length() / .04;
    dummy.position.copy(segmentStart); dummy.quaternion.setFromUnitVectors(up, speed > 1e-6 ? delta.normalize() : up); dummy.rotateY(s.spin + t * 3);
    dummy.scale.set(width * size, size * (1 + Math.min(speed * stretch, 2.5)), depth * size); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  };
  function pourRain(t, bx, bz, ground, count) {
    rain.count = t > 6 ? count : 0;
    for (let i = 0; i < rain.count; i++) {
      const s = rainSeeds[i], r = 55 + s.radial * 110, a = s.angle + t * .05;
      const x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r, y = ground + (((s.phase * 90 - t * 46) % 90) + 90) % 90;
      // Drops slant into the inflow: down and toward the funnel.
      segmentStart.set(x, y, z); segmentEnd.set(x - Math.cos(a) * 1.3, y - 3.4, z - Math.sin(a) * 1.3);
      segment(rain, i, segmentStart, segmentEnd, .05);
    }
    rain.instanceMatrix.needsUpdate = true;
  }
  // Trees tilt toward the funnel with the inflow; the pull fades with distance and flutters in the gusts.
  function leanTrees(t, bx, bz, spread) {
    const storm = ease((t - 6) / 8);
    trees.forEach((tree, i) => {
      const dx = bx - tree.position.x, dz = bz - tree.position.z, dist = Math.hypot(dx, dz);
      const pull = (storm * .35 + spread * .65) * (1 - ease((dist - 15) / 125));
      if (pull <= 0 || dist < 1e-6) { tree.rotation.set(0, 0, 0); return; }
      const lean = pull * .55 * (1 + Math.sin(t * 6.5 + i * 1.9) * .18);
      tree.rotation.set(lean * dz / dist, 0, -lean * dx / dist);
    });
  }

  function updateTornado(t, detail, config) {
    const down = ease((t - 8) / 5), spread = ease((t - 13) / 6), ropeOut = ease((t - 26) / 4);
    const [bx, bz] = base(t), ground = terrainHeight(bx, bz), height = 25 + down * 75, wobble = 1 + ropeOut * 3;
    const lx = -7 + Math.sin(t * .6) * 6 * wobble, lz = -3.5 + Math.cos(t * .45) * 5 * wobble;
    const volumetric = detail === 2, ultra = canvas.dataset.quality === 'ultra', env = config?.environment || {};
    funnelSurface.shape.value.set((3 + spread * 11) * (1 - ropeOut * .85), 42 + spread * 24, height, 1.6 + ropeOut * .6);
    funnelSurface.lean.value.set(lx, lz); funnelSurface.clock.value = t;
    // The funnel hangs from the wall cloud; its top stays at the ceiling while the tip descends.
    for (const mesh of [funnel, core, funnelVolume]) mesh.position.set(bx, 100 + ground - height, bz);
    funnel.visible = !volumetric; core.visible = detail === 1; funnelVolume.visible = volumetric; wallVolume.visible = volumetric;
    cloudSurface.clock.value = t; dustSurface.clock.value = t;
    const cx = bx + lx, cz = bz + lz;
    wallVolume.position.set(cx, ground + 88, cz);
    const flashState = strike(t, strikes, bolts, flashLight), skirt = spread * 24 * (1 - ropeOut * .7);
    for (const [volume, steps] of [[funnelVolume, ultra ? 48 : 32], [wallVolume, ultra ? 18 : 14]]) {
      const u = volume.material.uniforms;
      u.time.value = t; u.steps.value = steps; u.flash.value = flashState.flash; u.origin.value.copy(volume.position);
      if (flashState.active !== undefined) u.flashPoint.value.copy(boltStarts[flashState.active]);
      u.fogColor.value.set(env.fog ?? '#46524d'); u.fogDensity.value = (env.fogDensity ?? .0027) + ease(t / 30) * (env.fogGrowth ?? .0018);
    }
    const funnelUniforms = funnelVolume.material.uniforms;
    funnelUniforms.shape.value.copy(funnelSurface.shape.value); funnelUniforms.lean.value.set(lx, lz);
    funnelUniforms.skirt.value = skirt; funnelUniforms.spread.value = spread;
    wall.visible = !volumetric; wall.count = detail === 0 ? 24 : 40;
    for (let i = 0; i < wall.count; i++) {
      // A wide, flat rotating slab under the ceiling; its underside stays above the funnel top.
      const s = wallSeeds[i], a = s.angle + t * (.06 + (1 - s.radial) * .16), r = 16 + s.radial * 72;
      pose(wall, i, cx + Math.cos(a) * r, 102 + ground + Math.sin(s.twist + t * .2) * 3 + s.radial * 8, cz + Math.sin(a) * r,
        32 * s.size, 7 * s.size, 32 * s.size, s.twist, a, s.twist * .3);
    }
    wall.instanceMatrix.needsUpdate = true;
    dust.visible = !volumetric && t > 12.6;
    for (let i = 0; i < dust.count; i++) {
      const s = dustSeeds[i], a = s.angle + t * (1.8 + s.radial), r = (6 + s.radial * 16) * (.4 + spread * .6) * (1 - ropeOut * .7);
      const size = (5 + spread * 6) * s.size * (1 - ropeOut * .6);
      pose(dust, i, bx + Math.cos(a) * r, ground + 2 + s.radial * 7, bz + Math.sin(a) * r, size * 1.3, size * .8, size * 1.3, t * .4 + s.twist, a, s.twist);
    }
    dust.instanceMatrix.needsUpdate = true;
    planks.count = detail === 0 ? 60 : detail === 1 ? 100 : 140;
    for (let i = 0; i < planks.count; i++) {
      const [x, y, z, size, angle] = spiral(plankSeeds[i], t, bx, bz, ground, lx, lz);
      pose(planks, i, x, y, z, size * 3, size * .3, size * .9, t * 3 + plankSeeds[i].spin, angle, t * 2);
    }
    planks.instanceMatrix.needsUpdate = true;
    const heavy = [.3, .6, 1][detail];
    sheets.count = Math.round(40 * heavy); limbs.count = Math.round(40 * heavy); clods.count = Math.round(90 * heavy);
    for (let i = 0; i < sheets.count; i++) streak(sheets, i, sheetSeeds[i], t, bx, bz, ground, lx, lz, 1.3, .08, .04);
    for (let i = 0; i < limbs.count; i++) streak(limbs, i, limbSeeds[i], t, bx, bz, ground, lx, lz, .35, .35, .045);
    for (let i = 0; i < clods.count; i++) streak(clods, i, clodSeeds[i], t, bx, bz, ground, lx, lz, .7, .7, .03);
    for (const mesh of [sheets, limbs, clods]) mesh.instanceMatrix.needsUpdate = true;
    pourRain(t, bx, bz, ground, Math.round(900 * heavy));
    leanTrees(t, bx, bz, spread);
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
    funnelDust.uniforms.origin.value.set(bx, ground, bz); funnelDust.uniforms.lean.value.set(lx, lz);
    inflow.uniforms.origin.value.set(bx, ground, bz);
  }
  // Camera-only state: a camera inside a hull marches from itself to the hull's back faces instead.
  function updateTornadoView(camera) {
    if (!camera) return;
    const c = camera.position, funnelUniforms = funnelVolume.material.uniforms, wallUniforms = wallVolume.material.uniforms;
    const shape = funnelUniforms.shape.value, h = (c.y - funnelVolume.position.y) / shape.z;
    let insideFunnel = false;
    if (h >= 0 && h <= 1) {
      const qx = c.x - funnelVolume.position.x - funnelUniforms.lean.value.x * h * h, qz = c.z - funnelVolume.position.z - funnelUniforms.lean.value.y * h * h;
      insideFunnel = Math.hypot(qx, qz) < (shape.x + (shape.y - shape.x) * Math.pow(h, shape.w)) * 1.3 + funnelUniforms.skirt.value * (1 - ease(h / .2));
    }
    setInside(funnelVolume, insideFunnel);
    const dy = c.y - wallVolume.position.y;
    setInside(wallVolume, dy >= 0 && dy <= wallUniforms.thickness.value && Math.hypot(c.x - wallVolume.position.x, c.z - wallVolume.position.z) < wallUniforms.radius.value);
  }
  function leaveTornado() { for (const tree of trees) tree.rotation.set(0, 0, 0); }
    return { group: outbreak, update: updateTornado, updateView: updateTornadoView, leave: leaveTornado, particles: [funnelDust, inflow] };
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
  recordSurface(mountainMaterial,{kind:'mountain',uniforms:{ashFall:ash}});
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
  function createSuperstorm() {
    seed = 20042004;
  // THE DAY AFTER TOMORROW: the superstorm buries Manhattan in wind-driven snow, piles drifts along the
  // streets, glazes the roads with ice and hangs icicles from every roof edge.
  const superstorm = group('The Day After Tomorrow — superstorm');
  const snowMaterial = mat('#e4edf3', { roughness: .96 });
  const drifts = instances(superstorm, new THREE.SphereGeometry(1, 12 * fine, 7 * fine), snowMaterial, 132, 'Snow drifts');
  drifts.receiveShadow = true;
  // Drifts pile against the building fronts along the 17-unit street grid.
  const driftSeeds = Array.from({ length: 132 }, (_, i) => {
    const road = -4 + (i % 9), along = -72 + Math.floor(i / 9) * 10.3 + random() * 6, side = i % 2 ? 1 : -1, offset = 1.9 + random() * 1.4;
    const crossStreet = i % 3 === 0;
    return { x: crossStreet ? along : road * 17 + side * offset, z: crossStreet ? road * 17 + side * offset : along,
      w: 3 + random() * 4.5, h: .7 + random() * 1.1, d: 2 + random() * 3, spin: random() * tau, onset: random() };
  });
  const iceMaterial = new THREE.MeshStandardMaterial({ color: '#c3d9e4', roughness: .1, metalness: .06, transparent: true, opacity: 0, envMapIntensity: 1.3, depthWrite: false });
  iceMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 icePoint;').replace('#include <begin_vertex>', '#include <begin_vertex>\nicePoint=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 icePoint;' + noise)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat veins=fbm(icePoint*.11);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.96,.98,1.),smoothstep(.56,.66,veins)*.55);diffuseColor.a*=.75+veins*.5;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor+=smoothstep(.56,.66,veins)*.5;');
  };
  iceMaterial.customProgramCacheKey = () => 'terrestrial-ice-sheet-v1';
  recordSurface(iceMaterial,{kind:'ice',uniforms:{}});
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), iceMaterial); ice.name = 'Frozen streets';
  ice.rotation.x = -Math.PI / 2; ice.position.y = -.86; ice.renderOrder = -1; ice.receiveShadow = true; ice.visible = false; superstorm.add(ice);
  // A unit icicle hangs from the origin so scaling y is its length.
  const icicleGeometry = new THREE.ConeGeometry(.16, 1, 5); icicleGeometry.rotateX(Math.PI); icicleGeometry.translate(0, -.5, 0);
  const icicleCount = buildings.length * 4;
  const icicles = instances(superstorm, icicleGeometry, new THREE.MeshStandardMaterial({ color: '#dff1fa', roughness: .12, metalness: .05, transparent: true, opacity: .85 }), Math.max(1, icicleCount), 'Roof-edge icicles');
  icicles.count = 0;
  const icicleSeeds = Array.from({ length: icicleCount }, () => ({ offset: random(), length: 1.2 + random() * 2.6, onset: random(), radius: .7 + random() * .8 }));
  const blizzard = particles(superstorm, 'blizzard', 14000, '#e9f2f8', 1.4);
  const spindrift = particles(superstorm, 'spindrift', 900, '#dde8ef', 30);

  function updateSuperstorm(t, detail) {
    const glaze = ease((t - 13) / 12);
    drifts.count = detail === 0 ? 60 : detail === 1 ? 96 : 132;
    for (let i = 0; i < drifts.count; i++) {
      const s = driftSeeds[i], pile = ease((t - 9 - s.onset * 9) / 12), h = s.h * pile;
      pose(drifts, i, s.x, -1 + h * .35, s.z, s.w * (.6 + pile * .4), Math.max(.001, h), s.d * (.6 + pile * .4), 0, s.spin, 0);
    }
    drifts.instanceMatrix.needsUpdate = true;
    ice.visible = glaze > 0; iceMaterial.opacity = glaze * .88;
    icicles.visible = t > 11; icicles.count = detail === 0 ? Math.floor(icicleCount / 2) : icicleCount;
    for (let i = 0; i < icicles.count; i++) {
      const s = icicleSeeds[i], u = buildings[Math.floor(i / 4)].userData, front = i % 4 < 2;
      const drop = s.length * ease((t - 11 - s.onset * 9) / 8);
      pose(icicles, i, front ? u.x - u.w / 2 + s.offset * u.w : u.x + u.w / 2 + .05, -1 + u.h - .05,
        front ? u.z + u.d / 2 + .05 : u.z - u.d / 2 + s.offset * u.d, s.radius, Math.max(.001, drop), s.radius);
    }
    icicles.instanceMatrix.needsUpdate = true;
  }
    return { group: superstorm, update: updateSuperstorm, particles: [blizzard, spindrift] };
  }
  function createVisitation() {
    seed = 20082008;
  // THE DAY THE EARTH STOOD STILL: a luminous sphere lands in the park, GORT walks out and stands guard,
  // then dissolves into a nanite swarm that spreads across the meadow and consumes the trees.
  const visitation = group('The Day the Earth Stood Still — visitation');
  const landing = new THREE.Vector3(-12, 30, -34), stand = new THREE.Vector3(-2, 0, 24);
  const sphereClock = { value: 0 };
  const luminous = glowValue => createShaderMaterial({
    uniforms: { time: sphereClock, glow: { value: glowValue } },
    vertexShader: 'varying vec3 sphereNormal;varying vec3 spherePoint;varying vec3 sphereView;void main(){spherePoint=position;vec4 mv=modelViewMatrix*vec4(position,1.);sphereNormal=normalize(normalMatrix*normal);sphereView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader: `uniform float time,glow;varying vec3 sphereNormal;varying vec3 spherePoint;varying vec3 sphereView;${noise}
    void main(){vec3 p=normalize(spherePoint);float drift=fbm(p*2.2+vec3(time*.07,time*.04,0.));
    float cloud=fbm(p*5.5+drift*2.5-vec3(0.,time*.11,time*.05));float veil=smoothstep(.3,.8,cloud);
    float rim=pow(1.-abs(dot(sphereNormal,sphereView)),2.2);
    vec3 color=mix(vec3(.01,.12,.14),vec3(.25,.95,.85),veil);color=mix(color,vec3(1.6,2.4,2.2),pow(veil,3.)*.6)*glow;color+=vec3(.25,.95,.85)*rim*.9*glow;
    gl_FragColor=vec4(color,.94);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
    transparent: true
  });
  const sphereMaterial = luminous(1);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(28, 64 * fine, 40 * fine), sphereMaterial); orb.name = 'Luminous sphere'; visitation.add(orb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(30.5, 40 * fine, 26 * fine), rimGlow('#7fe9d2', .5)); halo.name = 'Sphere halo'; visitation.add(halo);
  // The arks: distant spheres that rise from beyond the tree line as the cleansing begins.
  const arkMaterial = luminous(.6);
  const arks = [[-190, -230], [150, -260], [-120, -300], [210, -170], [60, -330], [-265, -140]].map(([x, z], i) => {
    const ark = new THREE.Mesh(new THREE.SphereGeometry(9 + i % 3 * 2, 24 * fine, 16 * fine), arkMaterial); ark.name = 'Departing ark'; ark.position.set(x, -40, z); visitation.add(ark); return ark;
  });
  const ringMaterial = glow('#9ff2e0', 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .35, 6, 90 * fine), ringMaterial); ring.name = 'Landing pressure ring';
  ring.rotation.x = -Math.PI / 2; ring.position.set(landing.x, 2, landing.z); ring.visible = false; visitation.add(ring);
  const sphereLight = new THREE.PointLight('#8ff0d8', 0, 260, 1.4); visitation.add(sphereLight);
  const gort = new THREE.Group(); gort.name = 'GORT'; gort.visible = false; visitation.add(gort);
  const shell = mat('#191d21', { metalness: .6, roughness: .32 });
  const limbs = instances(gort, cylinder, shell, 8, 'GORT limbs');
  const joints = instances(gort, sphere, shell, 8, 'GORT joints');
  const plates = instances(gort, box, shell, 5, 'GORT torso plates');
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 2.2, 4, 10 * fine), shell); head.position.set(0, 25.8, 0); head.castShadow = true; gort.add(head);
  const visor = new THREE.Mesh(box, glow(new THREE.Color(1.2, 3, 2.6), 0)); visor.scale.set(2.4, .35, .6); visor.position.set(0, 26.2, 1.4); gort.add(visor);
  const beam = new THREE.Mesh(cylinder, glow(new THREE.Color(.8, 2.6, 2.2), 0)); beam.visible = false; gort.add(beam);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), glow('#bafff0', 0)); scorch.rotation.x = -Math.PI / 2; scorch.visible = false; gort.add(scorch);
  const beamLight = new THREE.PointLight('#a5fff0', 0, 90, 1.6); visitation.add(beamLight);
  for (const mesh of [limbs, joints, plates]) mesh.castShadow = true;
  const hip = [new THREE.Vector3(), new THREE.Vector3()], knee = [new THREE.Vector3(), new THREE.Vector3()], foot = [new THREE.Vector3(), new THREE.Vector3()];
  const shoulder = [new THREE.Vector3(), new THREE.Vector3()], elbow = [new THREE.Vector3(), new THREE.Vector3()], wrist = [new THREE.Vector3(), new THREE.Vector3()];
  const trees = landscape ? landscape.children.filter(child => child.isGroup) : [];
  const swarm = particles(visitation, 'swarm', 6000, '#8a9195', 1.6);
  const plague = particles(visitation, 'plague', 700, '#6f7578', 26);
  for (const cloud of [swarm, plague]) cloud.uniforms.origin.value.copy(stand);

  function updateVisitation(t, detail) {
    const descent = ease(t / 9), settled = ease((t - 9) / 1), depart = ease((t - 27) / 3), landingFlash = Math.sin(clamp((t - 8.4) / 1.4) * Math.PI);
    sphereClock.value = t;
    orb.position.set(landing.x, 265 - descent * 235 + Math.sin(t * .8) * .5 * settled + depart * depart * 220, landing.z);
    orb.rotation.set(t * .05, t * .11, 0);
    halo.position.copy(orb.position); halo.scale.setScalar(1 + landingFlash * .12 + depart * .3);
    sphereMaterial.uniforms.glow.value = 1 + landingFlash * 1.2 + depart * .8;
    halo.material.uniforms.strength.value = .5 + landingFlash * .8 + depart * .6;
    sphereLight.position.copy(orb.position).y -= 22;
    sphereLight.intensity = (300 + descent * 900 + landingFlash * 3000) * (1 - depart) * (detail === 0 ? .6 : 1);
    ring.visible = t > 9 && t < 12.5; ring.scale.setScalar(1 + ease((t - 9) / 3.5) * 95); ringMaterial.opacity = (1 - ease((t - 9) / 3.5)) * .8;
    arks.forEach((ark, i) => { ark.position.y = -40 + ease((t - 21 - i * 1.1) / 7) * 260; ark.visible = t > 21 + i * 1.1; });
    // GORT walks out of the sphere between 10.5 and 16.5, turns to face the meadow, then dissolves from 19.
    const walk = clamp((t - 10.5) / 6), amp = 1 - ease((t - 16.2) / .6), gone = ease((t - 19) / 4);
    gort.visible = t > 10 && t < 23.2;
    gort.position.set(landing.x + walk * (stand.x - landing.x), 0, -6 + walk * (stand.z + 6));
    gort.rotation.y = .32 + ease((t - 16.3) / 1.2) * .25;
    gort.scale.set(1 - gone * .97, 1 - gone * .999, 1 - gone * .97);
    const stride = walk * 11.4;
    let limb = 0, joint = 0;
    for (const side of [0, 1]) {
      const sign = side ? 1 : -1, swing = stride + side * Math.PI;
      hip[side].set(sign * 2.4, 13.5, 0);
      knee[side].set(sign * 2.6, 7.6 + Math.max(0, Math.sin(swing)) * 1.4 * amp, Math.sin(swing) * 2.6 * amp);
      foot[side].set(sign * 2.8, .9 + Math.max(0, Math.sin(swing)) * 1.8 * amp, Math.cos(swing) * 4.5 * amp);
      segment(limbs, limb++, hip[side], knee[side], 1.45); segment(limbs, limb++, knee[side], foot[side], 1.15);
      shoulder[side].set(sign * 4.6, 21.8, 0);
      elbow[side].set(sign * 5.2, 16.2, -Math.sin(swing) * 1.8 * amp);
      wrist[side].set(sign * 5.5, 10.8, -Math.sin(swing) * 3.2 * amp);
      segment(limbs, limb++, shoulder[side], elbow[side], 1.1); segment(limbs, limb++, elbow[side], wrist[side], .9);
      for (const point of [hip[side], knee[side], shoulder[side], elbow[side]]) pose(joints, joint++, point.x, point.y, point.z, 1.5, 1.5, 1.5);
      pose(plates, side, foot[side].x, foot[side].y, foot[side].z + .6, 2.4, 1.6, 4.2);
    }
    pose(plates, 2, 0, 18, 0, 7.4, 9.5, 4.2); pose(plates, 3, 0, 20.5, 0, 8.4, 4.5, 4.8); pose(plates, 4, 0, 13.3, 0, 6, 2.6, 3.6);
    for (const mesh of [limbs, joints, plates]) mesh.instanceMatrix.needsUpdate = true;
    const beamPower = ease((t - 14.5) / 1) * (1 - ease((t - 19) / .8)) * (.6 + .4 * Math.abs(Math.sin(t * 3)));
    visor.material.opacity = ease((t - 13) / 1.5) * (1 - gone) * (.6 + beamPower * .4);
    beam.visible = beamPower > .02; scorch.visible = beam.visible;
    // The visor beam sweeps the meadow in front of GORT; positions are in his local frame.
    // Pose the light on every frame its intensity is written, not only while the beam mesh
    // shows: it hangs off the always-visible group now, so a value left over from an earlier
    // frame would freeze in world space instead of riding GORT.
    segmentEnd.set(Math.sin(t * 1.3) * 40, .5, 30 + Math.cos(t * .9) * 25);
    hostLight(beamLight, gort, segmentEnd.x, segmentEnd.y + 2, segmentEnd.z);
    if (beam.visible) {
      segmentStart.set(0, 26.2, 1.4);
      delta.subVectors(segmentEnd, segmentStart); const length = delta.length();
      beam.position.copy(segmentStart).addScaledVector(delta, .5); beam.quaternion.setFromUnitVectors(up, delta.normalize()); beam.scale.set(.3, length, .3);
      beam.material.opacity = beamPower * .7;
      scorch.position.copy(segmentEnd); scorch.scale.setScalar(1 + beamPower); scorch.material.opacity = beamPower * .8;
    }
    beamLight.intensity = detail === 0 ? 0 : beamPower * 160;
    // The swarm front spreads from GORT's last position; trees crumble to nothing as it passes.
    const front = ease((t - 19) / 11) * 260;
    for (const tree of trees) {
      const distance = Math.hypot(tree.position.x - stand.x, tree.position.z - stand.z);
      tree.scale.setScalar(Math.max(.02, 1 - ease((front - distance) / 24) * .98));
    }
  }
    return { group: visitation, update: updateVisitation, particles: [swarm, plague], leave: () => { for (const tree of trees) tree.scale.setScalar(1); } };
  }
  function createInstrumentality() {
    seed = 19970719;
  // THE END OF EVANGELION: nine white winged units circle the fortress city at dusk, a lance falls and opens
  // the geofront into a cross of light, the A.T. field spreads over the streets and a luminous giant rises.
  const impact = group('The End of Evangelion — Third Impact');
  const origin = new THREE.Vector3(-10, 0, -70);
  const radiantClock = { value: 0 };
  const radiant = strength => createShaderMaterial({
    uniforms: { time: radiantClock, glow: { value: strength } },
    vertexShader: 'varying vec3 bodyNormal;varying vec3 bodyPoint;varying vec3 bodyView;void main(){bodyPoint=position;vec4 mv=modelViewMatrix*vec4(position,1.);bodyNormal=normalize(normalMatrix*normal);bodyView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader: `uniform float time,glow;varying vec3 bodyNormal;varying vec3 bodyPoint;varying vec3 bodyView;${noise}
    void main(){vec3 p=normalize(bodyPoint);float drift=fbm(p*1.7+vec3(0.,-time*.05,time*.03));
    float veil=smoothstep(.2,.85,fbm(p*4.+drift*2.+vec3(0.,-time*.08,0.)));
    float rim=pow(1.-abs(dot(bodyNormal,bodyView)),2.4);
    vec3 color=mix(vec3(.7,.64,.6),vec3(.95,.76,.58),veil*.55)*glow+vec3(1.2,.8,.55)*rim*.5*glow;
    gl_FragColor=vec4(color,.94);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
    transparent: true
  });
  // A low moon behind the skyline; its material ignores fog so it stays a hard disc at the horizon.
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 24 * fine, 16 * fine), new THREE.MeshBasicMaterial({ color: '#d9b8ab', fog: false }));
  moon.name = 'Low moon'; moon.position.set(-188, 116, -265); moon.scale.setScalar(26); impact.add(moon);
  const moonHalo = new THREE.Mesh(new THREE.SphereGeometry(1, 24 * fine, 16 * fine), rimGlow('#e8a58c', .28));
  moonHalo.name = 'Moon halo'; moonHalo.position.copy(moon.position); moonHalo.scale.setScalar(31); impact.add(moonHalo);
  // Nine white winged units: a capsule body with two hinged wing slabs each.
  const unitMaterial = mat('#ece6e0', { roughness: .5, emissive: '#ffcdb0', emissiveIntensity: .3 });
  const units = instances(impact, new THREE.CapsuleGeometry(1, 2.4, 4, 10 * fine), unitMaterial, 9, 'Mass production units');
  const wings = instances(impact, box, unitMaterial, 18, 'Mass production unit wings');
  units.castShadow = true; wings.castShadow = true;
  const unitSeeds = Array.from({ length: 9 }, () => ({ phase: random() * tau, bob: .7 + random() * .6, flap: 2 + random() * .8 }));
  const lanceMaterial = glow(new THREE.Color(3.2, .35, .3), .95);
  const lance = new THREE.Mesh(cylinder, lanceMaterial); lance.name = 'Lance'; lance.scale.set(.7, 110, .7); lance.visible = false; impact.add(lance);
  const lanceHalo = new THREE.Mesh(cylinder, glow('#ff6a5a', .18)); lanceHalo.name = 'Lance halo'; lanceHalo.scale.set(3, 112, 3); lanceHalo.visible = false; impact.add(lanceHalo);
  // The A.T. field is the anthology's 4K asset: a seamless hexagon mask multiplied into additive orange.
  const fieldColor = new THREE.Color(1.6, .62, .28);
  const fieldMaterial = new THREE.MeshBasicMaterial({ color: fieldColor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const barrierMaterial = fieldMaterial.clone();
  const field = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fieldMaterial); field.name = 'A.T. field';
  // The field hangs above the rooftops so the lattice reads from the orbit camera instead of hiding between towers.
  field.rotation.x = -Math.PI / 2; field.position.set(origin.x, 78, origin.z); field.renderOrder = 3; field.visible = false; impact.add(field);
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barrierMaterial); barrier.name = 'A.T. field barrier';
  barrier.rotation.y = .53; barrier.position.set(origin.x, 105, origin.z + 14); barrier.renderOrder = 3; barrier.visible = false; impact.add(barrier);
  let fieldTexture = null;
  const ultra = canvas.dataset.qualityCeiling === 'ultra';
  canvas.dataset.atFieldTexture = 'loading'; canvas.dataset.atFieldResolution = ultra ? '4096' : '1024';
  // Only the mask is asynchronous: the planes keep their absolute-time poses whether or not it arrives.
  new THREE.TextureLoader().loadAsync(ultra ? '/assets/at-field-4k.webp' : '/assets/at-field.webp').then(texture => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 8;
    const barrierTexture = texture.clone(); barrierTexture.repeat.set(.63, .46); barrierTexture.offset.set(.185, .27);
    fieldTexture = texture; fieldMaterial.map = texture; barrierMaterial.map = barrierTexture;
    fieldMaterial.needsUpdate = true; barrierMaterial.needsUpdate = true;
    canvas.dataset.atFieldTexture = 'ready';
    // A paused timeline renders nothing on its own, so the simulation must be woken to show the lattice.
    canvas.dispatchEvent?.(new Event('at-field-ready'));
  }).catch(() => { canvas.dataset.atFieldTexture = 'fallback'; canvas.dispatchEvent?.(new Event('at-field-ready')); });
  const crossMaterial = glow(new THREE.Color(2.4, 1.75, 1.3), .9);
  const crosses = instances(impact, box, crossMaterial, 12, 'Crosses of light');
  // x, z, eruption second, height, width, yaw.
  const crossSeeds = [[origin.x, origin.z, 12, 205, 5.2, .53], [58, -18, 13.4, 150, 3.4, .2], [-72, 26, 14.9, 135, 3.1, -.4],
    [24, 44, 16.3, 120, 2.8, .9], [-46, -112, 17.6, 165, 3.2, -.15], [92, -60, 18.7, 115, 2.7, .6]];
  const crossLight = new THREE.PointLight('#ffd0a8', 0, 320, 1.5); crossLight.position.set(origin.x, 80, origin.z); impact.add(crossLight);
  const lclMaterial = new THREE.MeshBasicMaterial({ color: '#ff6a35', transparent: true, opacity: 0, depthWrite: false });
  const lcl = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), lclMaterial); lcl.name = 'Sea of LCL';
  lcl.rotation.x = -Math.PI / 2; lcl.position.y = -.8; lcl.renderOrder = -1; lcl.visible = false; impact.add(lcl);
  const ringMaterial = glow('#ffc6a1', 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 8, 100 * fine), ringMaterial); ring.name = 'Anti-A.T. field pulse';
  ring.rotation.x = Math.PI / 2; ring.position.set(origin.x, 3, origin.z); ring.visible = false; impact.add(ring);
  // The giant: a faceless luminous figure that rises out of the geofront and opens its arms.
  const giant = new THREE.Group(); giant.name = 'Luminous giant'; giant.visible = false; giant.position.copy(origin); impact.add(giant);
  const bodyMaterial = radiant(1);
  const limb = (geometry, x, y, z, sx, sy, sz, name, parent = giant) => {
    const mesh = new THREE.Mesh(geometry, bodyMaterial); mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const legGeometry = new THREE.CapsuleGeometry(1, 3, 6, 12 * fine), armGeometry = new THREE.CapsuleGeometry(1, 3.2, 6, 12 * fine);
  limb(legGeometry, -11, 50, 0, 9, 20, 9, 'Giant left leg'); limb(legGeometry, 11, 50, 0, 9, 20, 9, 'Giant right leg');
  limb(sphere, 0, 104, 0, 20, 14, 13, 'Giant pelvis');
  limb(new THREE.CapsuleGeometry(1, 1.7, 6, 16 * fine), 0, 150, 0, 24, 21, 15, 'Giant torso');
  limb(sphere, -26, 182, 0, 8, 8, 8, 'Giant left shoulder'); limb(sphere, 26, 182, 0, 8, 8, 8, 'Giant right shoulder');
  const arms = [-1, 1].map(sign => {
    const pivot = new THREE.Group(); pivot.position.set(sign * 27, 182, 0); giant.add(pivot);
    limb(armGeometry, 0, -41, 0, 7, 16, 7, sign < 0 ? 'Giant left arm' : 'Giant right arm', pivot);
    return [pivot, sign];
  });
  limb(cylinder, 0, 196, 0, 7, 12, 7, 'Giant neck');
  limb(sphere, 0, 214, 0, 14, 17, 14, 'Giant head');
  const headHalo = new THREE.Mesh(sphere, rimGlow('#ffd3b0', .5)); headHalo.name = 'Giant head halo'; headHalo.position.set(0, 214, 0); headHalo.scale.set(16, 19, 16); giant.add(headHalo);
  const haloMaterial = glow(new THREE.Color(1.6, 1.2, .8), 0);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1, .05, 8, 96 * fine), haloMaterial); halo.name = 'Halo';
  halo.position.set(0, 246, 0); halo.rotation.x = Math.PI / 2 - .3; halo.scale.setScalar(30); giant.add(halo);
  const giantLight = new THREE.PointLight('#ffb890', 0, 420, 1.4); impact.add(giantLight);
  const ascension = particles(impact, 'ascension', 4000, '#ffb27a', 2.2);

  function updateInstrumentality(t, detail) {
    radiantClock.value = t;
    const settle = ease((t - 8) / 2), ascend = ease((t - 26) / 4), vanish = ease((t - 27) / 3);
    // The circling angle eases into a hold between 8 and 10 with a continuous rate.
    const u = clamp((t - 8) / 2), sweep = .3 * (t < 8 ? t : 8 + 2 * u - u * u);
    units.count = detail === 0 ? 6 : 9; wings.count = units.count * 2;
    for (let i = 0; i < units.count; i++) {
      const s = unitSeeds[i], theta = i / 9 * tau + sweep;
      const x = origin.x + Math.cos(theta) * 125, z = origin.z + Math.sin(theta) * 125;
      const y = 126 - ease(t / 10) * 30 + Math.sin(t * s.bob + s.phase) * 2.5 + ascend * ascend * 260;
      const yaw = -theta + settle * Math.PI / 2, size = 3.4 * (1 - vanish * .999);
      const flap = (.35 - settle * .12) + Math.sin(t * s.flap + s.phase) * (.42 - settle * .3);
      pose(units, i, x, y, z, size, size, size, 0, yaw, 0);
      for (const [k, sign] of [[0, -1], [1, 1]]) {
        // Each wing slab hinges at the shoulder and extends along its own x axis before the yaw is applied.
        const reach = size * 3.7, dx = sign * (size * .87 + Math.cos(flap) * reach), dy = size * .73 + Math.sin(flap) * reach;
        pose(wings, i * 2 + k, x + dx * Math.cos(yaw), y + dy, z - dx * Math.sin(yaw), size * 7.3, size * .17, size * 2, 0, yaw, sign * flap);
      }
    }
    units.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
    const fall = ease((t - 10) / 2);
    lance.visible = t > 9.6 && t < 19.6; lanceHalo.visible = lance.visible;
    lance.position.set(origin.x, 340 - fall * 285, origin.z); lanceHalo.position.copy(lance.position);
    lance.rotation.set(-.04, t * 2, .06); lanceHalo.rotation.copy(lance.rotation);
    lanceMaterial.opacity = .95 * ease((t - 9.6) / .4) * (1 - ease((t - 17) / 2.5)); lanceHalo.material.opacity = lanceMaterial.opacity * .2;
    const flare = Math.sin(clamp((t - 10.8) / 1.6) * Math.PI);
    barrier.visible = flare > .01; barrier.scale.set(170 * (1 + flare * .12), 120 * (1 + flare * .12), 1); barrierMaterial.opacity = flare * .75;
    const crossCount = detail === 0 ? 3 : 6; crosses.count = crossCount * 2; crosses.visible = t > 12;
    for (let i = 0; i < crossCount; i++) {
      const [x, z, erupt, height, width, spin] = crossSeeds[i];
      const grow = ease((t - erupt) / 1.4), linger = 1 - ease((t - erupt - 8) / 5), h = height * grow;
      pose(crosses, i * 2, x, h / 2 - 1, z, width, Math.max(.001, h), width, 0, spin, 0);
      pose(crosses, i * 2 + 1, x, h * .7, z, width * 9 * grow + .001, width * 1.05, width * 1.05, 0, spin, 0);
      color.setScalar(linger); crosses.setColorAt(i * 2, color); crosses.setColorAt(i * 2 + 1, color);
    }
    crosses.instanceMatrix.needsUpdate = true; crosses.instanceColor.needsUpdate = true;
    crossLight.intensity = 1500 * ease((t - 12) / .5) * (1 - ease((t - 15) / 8)) * (detail === 0 ? .6 : 1);
    const spread = ease((t - 12) / 5), fieldSize = 40 + spread * 500;
    field.visible = t > 12; field.scale.set(fieldSize, fieldSize, 1);
    fieldMaterial.opacity = (fieldTexture ? .6 : .22) * ease((t - 12) / 1.2) * (1 - ease((t - 26) / 4)) * (.86 + .14 * Math.sin(t * 5));
    if (fieldTexture) {
      // Hexagons keep a fixed 24-unit pitch while the plane grows; the offset pins the lattice to the centre.
      const rx = fieldSize / 216, ry = rx * 1.0393;
      fieldTexture.repeat.set(rx, ry); fieldTexture.offset.set(.5 - rx / 2, .5 - ry / 2);
    }
    lclMaterial.opacity = ease((t - 24) / 5) * .55; lcl.visible = lclMaterial.opacity > 0;
    const pulse = ease((t - 24) / 5);
    ring.visible = t > 24 && pulse < 1; ring.scale.set(1 + pulse * 420, 1 + pulse * 420, 1 + pulse * 6); ringMaterial.opacity = (1 - pulse) * .9;
    const rise = ease((t - 19) / 7), embrace = ease((t - 24) / 5);
    giant.visible = t > 19;
    giant.position.set(origin.x, -262 + rise * 262, origin.z); giant.rotation.set(0, .53, Math.sin(t * .3) * .012);
    hostLight(giantLight, giant, 0, 150, 34);
    for (const [pivot, sign] of arms) pivot.rotation.z = sign * (.14 + embrace * 1.3);
    bodyMaterial.uniforms.glow.value = 1 + embrace * .25 + Math.sin(t * 2) * .03;
    haloMaterial.opacity = ease((t - 22) / 3) * .9; halo.rotation.z = t * .1; halo.scale.setScalar(30 * (1 + embrace * .35));
    headHalo.material.uniforms.strength.value = .5 + embrace * .7;
    giantLight.intensity = (rise * 700 + embrace * 1100) * (detail === 0 ? .6 : 1);
  }
    return { group: impact, update: updateInstrumentality, particles: ascension };
  }
  function createTsunami() {
    seed = 19981998;
  // DEEP IMPACT: the comet's plasma trail, the water column thrown by the ocean strike and the spray torn off the
  // wave's crest. The wave body, the ocean and the comet stay in the simulation; these volumes ride the same
  // timeline: entry until 14 s, the strike at 13 s, the wave travelling from 14 s to 30 s.
  const surge = group('Deep Impact — ocean strike');
  const impactPoint = new THREE.Vector3(-50, -1, -100);
  const trailAxis = new THREE.Vector3(10, 10, -3).normalize();
  const comet = new THREE.Vector3(), lip = new THREE.Vector3();
  const defaults = { fog: '#5a6364', fogDensity: .0024, fogGrowth: 0 };
  const daylight = extra => volumeUniforms({ sunColor: { value: new THREE.Color('#ffc596').multiplyScalar(2.7) }, skyColor: { value: new THREE.Color('#9eafbe') },
    fogColor: { value: new THREE.Color(defaults.fog) }, fogDensity: { value: defaults.fogDensity }, ...extra });
  const trail = marchedVolume({ name: 'Entry trail', geometry: new THREE.CylinderGeometry(1, 1, 1, 16 * fine, 1, false),
    uniforms: daylight({ axis: { value: trailAxis.clone() }, trailLength: { value: 90 } }),
    declare: 'uniform vec3 axis;uniform float trailLength;',
    // A white-hot sheath at the comet streams back into a thin dark smoke tail; the noise flows down the axis at entry speed.
    field: `vec3 field(vec3 p,bool detail){
      vec3 q=p-origin;float s=dot(q,axis);if(s<0.||s>trailLength)return vec3(0.);
      vec3 perp=q-axis*s;float r=length(perp),f=s/trailLength,hot=1.-smoothstep(0.,.35,f);
      if(r>(1.5+f*5.5)*1.3)return vec3(0.);
      float wisp=fbm(q*.35-axis*time*9.);
      float body=(1.-smoothstep(.4,1.,r/((1.5+f*5.5)*(.7+wisp*.6))))*(1.-smoothstep(.5,1.,f))*(.45+.55*hot);
      float grain=detail&&body>.001?fbm(q*.9-axis*time*14.+3.):.5;
      return vec3(body*(.6+.4*grain),hot,grain);
    }`,
    span: '24.', dt: '.4,1.5', loop: 48, absorb: '1.6',
    shade: `vec3 plasma=vec3(3.,1.5,.5)*(.7+.6*f.z),smoke=vec3(.12,.11,.1)*(skyColor*.7+sunColor*.1);
            sampleColor=mix(smoke,plasma,f.y);` });
  surge.add(trail);
  const column = marchedVolume({ name: 'Impact column', geometry: new THREE.CylinderGeometry(1, 1, 1, 32 * fine, 1, false).translate(0, .5, 0),
    uniforms: daylight({ height: { value: 1 }, flare: { value: 0 }, heat: { value: 0 }, fade: { value: 1 }, radius: { value: 80 }, base: { value: 0 } }),
    declare: 'uniform float height,flare,heat,fade,radius,base;',
    // A boiling column with a mushroom cap and a base surge that rolls outward; the vaporised comet lights its foot at first.
    field: `vec3 field(vec3 p,bool detail){
      float h=(p.y-origin.y)/height;if(h<0.||h>1.)return vec3(0.);
      vec2 q=p.xz-origin.xz;float r=length(q),angle=atan(q.y,q.x);
      float cap=smoothstep(.62,.9,h)*(1.-smoothstep(.9,1.,h)),foot=1.-smoothstep(0.,.14,h),reach=10.+h*h*flare*.6+cap*flare+foot*base;
      if(r>reach*1.3)return vec3(0.);
      float boil=fbm(vec3(cos(angle)*2.2,h*7.-time*2.8,sin(angle)*2.2));
      float R=reach*(.7+boil*.6);
      float body=(1.-smoothstep(.5,1.,r/R))*smoothstep(0.,.03,h)*(1.-smoothstep(.85,1.,h));
      float grain=detail&&body>.001?fbm(vec3(q*.05,h*8.-time*2.2)+7.):.5;
      return vec3(body*(.55+.45*grain)*fade,heat*(1.-smoothstep(.1,.6,h)),grain);
    }`,
    span: 'radius*1.5', dt: '1.,4.', loop: 64, absorb: '1.1',
    shade: `float h=clamp((p.y-origin.y)/height,0.,1.);
            float shade=exp(-field(p+sunDirection*12.,false).x*1.8);
            vec3 vapour=vec3(.8,.83,.85)*(.65+.55*f.z)*(sunColor*.35*(.2+.8*shade)+skyColor*mix(.45,1.1,h));
            sampleColor=vapour+vec3(2.4,.9,.25)*f.y*(1.+f.z);` });
  column.position.copy(impactPoint); surge.add(column);
  const spray = marchedVolume({ name: 'Crest spray', geometry: new THREE.BoxGeometry(1, 1, 1),
    uniforms: daylight({ crest: { value: 0 } }), declare: 'uniform float crest;',
    // A thin, patchy veil of spindrift torn off the lip and blown up and back; the lip wobble matches the wave profile.
    field: `vec3 field(vec3 p,bool detail){
      vec3 q=p-origin;float up=q.y-sin(p.x*.13+time)*1.2;if(up<-4.)return vec3(0.);
      vec2 back=vec2(max(up,0.),max(-q.z,0.));float along=dot(back,vec2(.75,.66)),off=abs(dot(back,vec2(-.66,.75)));
      float veil=(1.-smoothstep(.3,1.,off/(2.5+along*.4)))*(1.-smoothstep(8.,30.,along))*(1.-smoothstep(150.,190.,abs(p.x)));if(veil<.01)return vec3(0.);
      // Cheapest first: the low-frequency patches decide whether the wisps are worth sampling at all.
      float patches=smoothstep(.3,.7,noise(vec3(p.x*.045+time*.25,along*.05,1.)));if(veil*patches<.01)return vec3(0.);
      float wisps=smoothstep(.4,.72,noise(vec3(p.x*.12,along*.14-time*3.,q.z*.12+time*.8))*.65+noise(vec3(p.x*.3,along*.35-time*5.,q.z*.3))*.35);
      float d=veil*patches*wisps;if(d<.005)return vec3(0.);
      float grain=detail?noise(vec3(p.x*.25,up*.3-time*4.,q.z*.25)+5.):.5;
      return vec3(d*(.6+.4*grain),0.,grain);
    }`,
    span: '46.', dt: '1.2,2.5', loop: 32, absorb: '.7',
    // A thin veil barely shadows itself, so the grain stands in for the shadow sample.
    shade: `sampleColor=vec3(.92,.95,.97)*(.75+.4*f.z)*(sunColor*.32*(.65+.35*f.z)+skyColor*.85);` });
  surge.add(spray);

  function updateTsunami(t, detail, config) {
    const volumetric = detail === 2, ultra = canvas.dataset.quality === 'ultra', env = config?.environment || {};
    // The wave's lip: the simulation's profile at v = 1, on the wave that travels from z = -115 to 115.
    const travel = ease((t - 14) / 16), height = 22 + travel * 60;
    lip.set(0, -1.2 + Math.sin(Math.PI * .53) * height, -115 + travel * 230 + 17);
    comet.set(85 - t * 10, 145 - t * 10, -145 + t * 3);
    trail.visible = volumetric && t < 14;
    trail.position.copy(comet).addScaledVector(trailAxis, 45); trail.quaternion.setFromUnitVectors(up, trailAxis); trail.scale.set(9, 90, 9);
    trail.material.uniforms.origin.value.copy(comet);
    const columnHeight = Math.max(1, 190 * ease((t - 13) / 2.5)), columnUniforms = column.material.uniforms;
    column.visible = volumetric && t > 13 && t < 24; column.scale.set(80, columnHeight, 80);
    columnUniforms.height.value = columnHeight; columnUniforms.flare.value = 34 * ease((t - 14.5) / 5);
    columnUniforms.base.value = 48 * ease((t - 15.5) / 5); columnUniforms.heat.value = 1 - ease((t - 13.3) / 2.2);
    columnUniforms.fade.value = 1 - ease((t - 19) / 5); columnUniforms.origin.value.copy(impactPoint);
    spray.visible = volumetric && t > 14;
    spray.position.set(0, lip.y + 10, lip.z - 8); spray.scale.set(380, 32, 40);
    spray.material.uniforms.origin.value.copy(lip); spray.material.uniforms.crest.value = height;
    for (const [volume, steps] of [[trail, ultra ? 32 : 24], [column, ultra ? 40 : 28], [spray, ultra ? 24 : 18]]) volumeFrame(volume, t, steps, env, defaults);
  }
  function updateTsunamiView(camera) {
    if (!camera) return;
    const c = camera.position;
    delta.copy(c).sub(trail.position); const along = delta.dot(trailAxis);
    setInside(trail, Math.abs(along) < 45 && delta.addScaledVector(trailAxis, -along).length() < 9);
    const dy = c.y - column.position.y;
    setInside(column, dy >= 0 && dy <= column.scale.y && Math.hypot(c.x - column.position.x, c.z - column.position.z) < 80);
    setInside(spray, Math.abs(c.x - spray.position.x) < 190 && Math.abs(c.y - spray.position.y) < 16 && Math.abs(c.z - spray.position.z) < 20);
  }
    return { group: surge, update: updateTsunami, updateView: updateTsunamiView, particles: [] };
  }
  const factories = {
    'terminator-2': createNuclear,
    '2012': createRupture,
    'war-of-the-worlds': createInvasion,
    'twister': createTornado,
    'dantes-peak': createEruption,
    'day-after-tomorrow': createSuperstorm,
    'day-the-earth-stood-still': createVisitation,
    'evangelion': createInstrumentality,
    'deep-impact': createTsunami
  };
  const loaded = new Map();
  let active;
  return {
    update(time, config) {
      const factory = factories[config.id];
      if (active && active !== loaded.get(config.id)) { active.group.visible = false; active.leave?.(); }
      if (!factory) { active = undefined; return; }
      if (!loaded.has(config.id)) { const result = factory(); markEffects(result.group); loaded.set(config.id, result); }
      active = loaded.get(config.id); active.group.visible = true;
      const t = Math.max(0, Math.min(30, time));
      const quality = canvas.dataset.quality;
      const detail = quality === 'lite' ? 0 : quality === 'balanced' ? 1 : 2;
      active.update(t, detail, config);
      for (const selected of [].concat(active.particles)) {
        selected.uniforms.time.value = t;
        selected.uniforms.ratio.value = Math.min(Number(canvas.dataset.pixelRatio) || 1, 2);
        selected.mesh.geometry.setDrawRange(0, Math.floor(selected.count * [ .35, .65, 1 ][detail]));
      }
    },
    // Camera-dependent state runs every rendered frame, including orbits with a paused timeline.
    updateView() { active?.updateView?.(camera); }
  };
}
