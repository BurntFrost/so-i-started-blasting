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
export function createTerrestrial({ scene, canvas, camera, buildings = [], landscape, ground }) {
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
    rupture: `float beat=floor(seed.y*3.);float start=(beat<1.?3.:beat<2.?10.:21.)+seed.w*2.;float age=max(0.,time-start);
      float z=(seed.x-.5)*165.;float fault=sin(z*.045)*10.+sin(z*.16)*2.;
      p=vec3(fault+(seed.y-.5)*age*2.8,1.+age*(1.1+seed.z*1.4),z+sin(a)*age*.45);
      alpha=step(start,time)*smoothstep(0.,.8,age)*(1.-smoothstep(4.,9.,age))*.19;`,
    invasion: `float age=mod(time*.7+seed.w*17.,17.);p=vec3((seed.x-.5)*170.+sin(age*.3+seed.y)*4.,1.+seed.z*5.+age*.25,(seed.y-.5)*170.);
      alpha=smoothstep(0.,4.,time)*sin(age/17.*3.14159)*.09;`,
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
    const nuclear = group('Terminator 2 — nuclear firestorm');
    const cloudSurface = texturedMaterial('#a4adb9', '#ffb667', .6, true);
    cloudSurface.material.transparent = true;
    cloudSurface.material.depthWrite = false;
    const cloud = instances(nuclear, sphere, cloudSurface.material, 72, 'Rolling mushroom cloud lobes');
    // A connected mass supports the silhouette while the baked puffs supply soft detail.
    const bodySurface = texturedMaterial('#a5aeb8', '#f7a15d', .1, true);
    const bodyMaterial = bodySurface.material;
    bodyMaterial.transparent = true; bodyMaterial.depthWrite = false; bodyMaterial.opacity = .2;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), bodyMaterial);
    crown.name = 'Continuous mushroom crown'; nuclear.add(crown);
    const column = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), bodyMaterial);
    column.name = 'Continuous mushroom stem'; nuclear.add(column);
    const nuclearCore = new THREE.Mesh(new THREE.SphereGeometry(1, 32 * fine, 20 * fine), glow(new THREE.Color(3.2, 1.4, .38), .7));
    nuclearCore.name = 'Nuclear fireball'; nuclear.add(nuclearCore);
    const shockMaterial = glow('#ffd29a', .8);
    const shock = new THREE.Mesh(new THREE.TorusGeometry(1, .022, 6, 100 * fine), shockMaterial);
    shock.name = 'Thermal pressure rim'; shock.rotation.x = Math.PI / 2; shock.position.set(-18, 1.3, -27); nuclear.add(shock);
    const pressureMaterial = new THREE.MeshBasicMaterial({ color: '#b0a59b', transparent: true, opacity: .2, depthWrite: false });
    const pressure = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 6, 100 * fine), pressureMaterial);
    pressure.name = 'Expanding ground pressure'; pressure.rotation.x = Math.PI / 2; pressure.position.set(-18, 2, -27); nuclear.add(pressure);
    const nuclearLight = new THREE.PointLight('#ffae62', 0, 260, 1.5);
    nuclearLight.position.set(-18, 28, -27); nuclear.add(nuclearLight);
    const warhead = new THREE.Mesh(new THREE.ConeGeometry(.4, 3, 9), mat('#85827c', { metalness: .9, roughness: .3 }));
    warhead.rotation.z = Math.PI; nuclear.add(warhead);
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(.08, .36, 30, 6), glow('#f9dcbe', .55)); nuclear.add(trail);
    const embers = particles(nuclear, 'embers', 1800, new THREE.Color(2.2, .8, .15), 1.15);
    const lobeSeeds = Array.from({ length: 72 }, (_, i) => ({ angle: i * 2.399963, radial: random(), size: .82 + random() * .3, twist: random() * tau }));
    const baked = createBakedExplosion({ canvas, cloud, camera });

    function updateNuclear(t, detail) {
      const ignition = ease((t - 4) / .55), growth = ease((t - 4.5) / 7);
      const rise = ease((t - 5) / 15), drift = Math.max(0, t - 18);
      const heat = 1 - ease((t - 7) / 10), flash = ignition * (1 - ease((t - 4.5) / 1.2));
      const capY = 18 + rise * 77 + drift * .6, capRadius = 5 + growth * 30;
      const centerX = -18 + drift * .55, centerZ = -27 - drift * .2;
      cloud.count = detail === 0 ? 36 : detail === 1 ? 54 : 72;
      cloudSurface.clock.value = t;
      bodySurface.clock.value = t;
      cloudSurface.material.emissiveIntensity = .015 + heat * .65;
      for (let i = 0; i < cloud.count; i++) {
        const s = lobeSeeds[i], stem = i % 3 === 0;
        const a = s.angle + t * (stem ? .035 : .018), radial = Math.sqrt(s.radial);
        const radius = stem ? 3 + radial * 5 : radial * capRadius;
        const y = stem ? 5 + s.radial * (capY - 9) : capY + (1 - radial * radial) * 9 + Math.sin(a * 2 + t * .09) * 1.6;
        const size = (stem ? 5 + growth * 4 : 5 + growth * 8) * s.size * ignition;
        pose(cloud, i, centerX + Math.cos(a) * radius, y, centerZ + Math.sin(a) * radius,
          size * (stem ? .85 : 1.3), size * (stem ? 1.45 : .84), size, t * .025 + s.twist, a, s.twist);
        color.set(stem ? '#9aa0a7' : '#bac4ce').lerp(fireColor, heat * (stem ? .52 : .28));
        cloud.setColorAt(i, color);
      }
      cloud.instanceMatrix.needsUpdate = true; cloud.instanceColor.needsUpdate = true;
      crown.visible = column.visible = t > 4;
      crown.position.set(centerX, capY + 2, centerZ);
      crown.scale.set((capRadius + 1) * ignition, (6 + growth * 4) * ignition, (capRadius + 1) * ignition);
      column.position.set(centerX, capY * .46, centerZ);
      column.scale.set((5 + growth * 5) * ignition, capY * .48 * ignition, (5 + growth * 5) * ignition);
      bodyMaterial.color.set('#a5aeb8').lerp(fireColor, heat * .2);
      bodyMaterial.opacity = canvas.dataset.explosionBake === 'ready' ? .13 : .42;
      const radius = 1 + Math.max(0, t - 6) * 12.5;
      shock.visible = t > 5 && t < 18;
      shock.scale.set(radius, radius, 1 + growth * 7);
      shockMaterial.opacity = ease((t - 5) / 1.2) * (1 - ease((t - 10) / 8)) * .55;
      pressure.visible = t > 7 && t < 27;
      pressure.scale.set(radius * .92, radius * .92, 6 + growth * 15);
      pressureMaterial.opacity = ease((t - 7) / 3) * (1 - ease((t - 18) / 9)) * .13;
      nuclearLight.position.set(centerX, 20 + rise * 30, centerZ);
      nuclearLight.intensity = (flash * 1800 + ignition * heat * 420) * (detail === 0 ? .65 : 1);
      warhead.visible = trail.visible = t < 4;
      warhead.position.set(-18, 110 - clamp(t / 4) * 103, -27);
      trail.position.set(-18, warhead.position.y + 17, -27);
      cloud.visible = t > 4;
      baked.update(t);
      // Keep a low-opacity 3D support under the soft smoke, including failed atlas requests.
      cloudSurface.material.opacity = ignition * (canvas.dataset.explosionBake === 'ready' ? .18 : .82);
      nuclearCore.visible = t > 4 && t < 6.2;
      nuclearCore.position.set(centerX, 42 + rise * 15, centerZ);
      nuclearCore.scale.setScalar(Math.max(.01, (22 + growth * 14) * ignition));
      nuclearCore.material.opacity = flash * .78 + ignition * (1 - ease((t - 4.7) / 1.5)) * .14;
    }
    return { group: nuclear, update: updateNuclear, updateView: viewCamera => baked.updateView(viewCamera), particles: embers };
  }
  function createRupture() {
    seed = 20120012;
  // 2012: the street surface splits into lifted crust plates and a jagged abyss.
  const rupture = group('2012 — continental rupture');
  const basalt = texturedMaterial('#4c5358', '#64371e', .025);
  const plates = instances(rupture, new THREE.BoxGeometry(1, 1, 1), basalt.material, 42, 'Fractured basalt plates');
  plates.castShadow = true; plates.receiveShadow = true;
  const plateSeeds = Array.from({ length: 42 }, (_, i) => ({ z: -77 + ((Math.floor(i / 2) * 8) % 21) * 7.7,
    side: i % 2 ? 1 : -1, width: 3 + random() * 4, height: .8 + random() * 1.8, phase: random() * tau }));
  const faultRows = 320, faultLength = 2000;
  const crustMaterial = texturedMaterial('#283137', '#2a1c15', .015).material;
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
    vec3 hot=mix(vec3(.035,.006,.002),vec3(.85,.21,.025),veins*edge*pulse);
    gl_FragColor=vec4(hot,(edge*.56+smoothstep(.64,.86,veins)*.08)*smoothstep(0.,4.,time));}` });
  const fault = new THREE.Mesh(faultGeometry, faultMaterial); rupture.add(fault);
  const rubble = instances(rupture, rock, mat('#737779', { roughness: .95 }), 150, 'Airborne earthquake masonry');
  const rubbleSeeds = Array.from({ length: 150 }, () => ({ x: (random() - .5) * 55, z: (random() - .5) * 158,
    speed: 3 + random() * 5, launch: [3, 10, 21][Math.floor(random() * 3)] + random() * 2, spin: random() * tau, size: .25 + random() * 1.3 }));
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
  const faultDust = particles(rupture, 'rupture', 420, '#8a8f91', 19);

  function updateRupture(t, detail) {
    const opening = ease((t - 3) / 5) * .25 + ease((t - 10) / 5) * .45 + ease((t - 21) / 6) * .3, violence = ease((t - 6) / 16);
    basalt.clock.value = t; faultMaterial.uniforms.time.value = t;
    for (const { mesh, side } of crust) {
      const p = mesh.geometry.attributes.position;
      for (let row = 0; row <= faultRows; row++) {
        const z = faultLength * (.5 - row / faultRows);
        const center = Math.sin(z * .045) * 10 + Math.sin(z * .16) * 2;
        const inner = center + side * (.35 + opening * (13 + Math.sin(z * .11) * 3));
        const a = row * 4;
        p.setXYZ(a, inner, -1.05, z); p.setXYZ(a + 1, side * 1200, -1.05, z);
        p.setXYZ(a + 2, inner + side * 9, -80, z); p.setXYZ(a + 3, side * 1200, -80, z);
      }
      p.needsUpdate = true; mesh.geometry.computeVertexNormals();
    }
    for (const mesh of [chasm, fault]) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const row = Math.floor(i / 2), z = faultLength * (.5 - row / faultRows);
        const center = Math.sin(z * .045) * 10 + Math.sin(z * .16) * 2;
        const halfWidth = .35 + opening * (13 + Math.sin(z * .11) * 3);
        p.setXYZ(i, center + (i % 2 ? 1 : -1) * halfWidth, mesh === chasm ? -3.8 : -3.6, z);
      }
      p.needsUpdate = true;
    }
    plates.count = detail === 0 ? 28 : 42;
    for (let i = 0; i < plates.count; i++) {
      const s = plateSeeds[i];
      const arrival = 3 + (s.z + 77) * .045;
      const local = ease((t - arrival) / 4) * .35 + ease((t - arrival - 7) / 5) * .45 + ease((t - 21 - (s.z + 77) * .02) / 5) * .2;
      const center = Math.sin(s.z * .045) * 10 + Math.sin(s.z * .16) * 2;
      pose(plates, i, center + s.side * (s.width * .65 + local * 15), -2 + local * (s.height + 1.8), s.z,
        s.width, s.height, 7.6, local * Math.sin(s.phase) * .3, Math.sin(s.phase) * .3, s.side * local * .52);
    }
    plates.instanceMatrix.needsUpdate = true;
    rubble.count = detail === 0 ? 45 : detail === 1 ? 90 : 150;
    for (let i = 0; i < rubble.count; i++) {
      const s = rubbleSeeds[i], age = Math.max(0, t - s.launch);
      const alive = t >= s.launch && age < 7;
      const lift = Math.max(0, age * s.speed - age * age * 1.2);
      const size = alive ? s.size * (1 - ease((age - 5) / 2)) : .001;
      pose(rubble, i, s.x + Math.sign(s.x) * age * 1.7, 1 + lift, s.z + Math.sin(s.spin) * age,
        size, size * .7, size * 1.25, age + s.spin, age * .7, age * 1.4);
    }
    rubble.instanceMatrix.needsUpdate = true;
    roadSlabs.forEach((slab, i) => {
      const distance = Math.abs(i - 5), bend = ease((t - 10 - distance * .5) / 5), fall = ease((t - 21 - distance * .3) / 5);
      slab.position.y = 7 + bend * (distance < 2 ? 7 - distance * 3 : Math.sin(i) * 2) - fall * (distance < 2 ? 25 : distance < 4 ? 4 : 0);
      slab.position.x = -75 + i * 15 + Math.sign(i - 5) * bend * 7 + Math.sign(i - 5) * fall * 4;
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
    faultLight.intensity = 18 + violence * 130;
  }
    return { group: rupture, update: updateRupture, particles: faultDust };
  }
  function createInvasion() {
    seed = 20052005;
  // WAR OF THE WORLDS: three independent walkers with posed limbs and scanning rays.
  const invasion = group('War of the Worlds — tripod invasion');
  const machine = mat('#718797', { metalness: .88, roughness: .23 });
  const darkMachine = mat('#172735', { metalness: .78, roughness: .38 });
  const lensMaterial = glow(new THREE.Color(.4, 1.2, 3.5));
  const walkers = [];
  const walkersLayout = [[22, 14, 1.16], [-48, -35, .78], [48, -64, .63]];
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
    const ray = new THREE.Mesh(cylinder, glow(new THREE.Color(.45, 1.25, 3.6), .6)); ray.name = `Tripod heat ray ${index + 1}`; walker.add(ray);
    const rayHalo = new THREE.Mesh(cylinder, glow('#899dff', .1)); walker.add(rayHalo);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(3, 24), glow('#bbd5ff', .8)); scorch.rotation.x = -Math.PI / 2; walker.add(scorch);
    const rayLight = new THREE.PointLight('#9ebdff', 0, 55, 1.6); invasion.add(rayLight);
    const positions = Array.from({ length: 12 }, () => new THREE.Vector3());
    walkers.push({ walker, head, limbs, joints, cables, plating, ray, rayHalo, scorch, rayLight, positions, x, z, scale, index });
  });
  const weedMaterial = mat('#42131c', { roughness: .9, emissive: '#551018', emissiveIntensity: .08 });
  const weed = instances(invasion, new THREE.ConeGeometry(.8, 1, 5), weedMaterial, 360, 'Spreading red weed');
  const weedSeeds = Array.from({ length: 360 }, () => ({ x: (random() - .5) * 164, z: (random() - .5) * 150,
    size: .8 + random() * 2.6, angle: random() * tau, threshold: random() }));
  const invasionDust = particles(invasion, 'invasion', 140, '#7b8795', 13);

  const scars = [[16,50,58,9],[-38,-6,38,8],[48,-38,28,7]].map(([x,z,width,depth], i) => {
    const scar = new THREE.Mesh(new THREE.PlaneGeometry(width,depth), new THREE.MeshStandardMaterial({color:'#171116',emissive:'#a43818',emissiveIntensity:0,roughness:1,transparent:true,opacity:0,depthWrite:false}));
    scar.name = `Heat-ray scar ${i+1}`; scar.rotation.x = -Math.PI/2; scar.position.set(x,-.87,z); invasion.add(scar); return scar;
  });
  function updateInvasion(t, detail) {
    const waking = ease(t / 5), assault = ease((t - 7) / 4);
    walkers.forEach(w => {
      w.walker.visible = detail > 0 || w.index < 2;
      if (!w.walker.visible) { w.rayLight.intensity = 0; return; }
      const stride = Math.max(0,t-6) * .72 + w.index * 2;
      w.walker.position.set(w.x + Math.sin(stride * .3) * 5, 0, w.z + Math.max(0,t-6) * 1.5);
      w.walker.rotation.y = -.22 + Math.sin(t * .12 + w.index) * .2;
      w.head.position.set(0, 48 + waking * 12 + Math.sin(stride * 2) * .8, 0);
      w.head.rotation.z = Math.sin(stride) * .035;
      let limb = 0, joint = 0;
      for (let leg = 0; leg < 3; leg++) {
        const a = leg / 3 * tau + Math.PI, swing = stride + leg * tau / 3;
        const hip = w.positions[leg * 3], knee = w.positions[leg * 3 + 1], foot = w.positions[leg * 3 + 2];
        hip.set(Math.sin(a) * 5, w.head.position.y - 3, Math.cos(a) * 4);
        knee.set(Math.sin(a + .18) * 18, 29 + Math.sin(swing) * 3, Math.cos(a + .18) * 17 + Math.cos(swing) * 2);
        const step = (Math.max(0,t-6)*.22 + leg/3 + w.index*.28)%1, lift = clamp((step-.7)/.3);
        const reach = step<.7 ? 3-step/.7*6 : -3+ease(lift)*6;
        foot.set(Math.sin(a) * 27, .5+Math.sin(lift*Math.PI)*7, Math.cos(a) * 25+reach);
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
      const attack = [20.5,23.5,26][w.index], sweep = ease((t-attack)/2.2);
      const target = w.positions[10].set(w.index===0?45-sweep*58:w.index===1?-57+sweep*38:34+sweep*28, .4, [50,-6,-38][w.index]);
      w.walker.updateWorldMatrix(true,false); w.walker.worldToLocal(target);
      delta.subVectors(target, source); const length = delta.length();
      const firing = ease((t-attack)/.16)*(1-ease((t-attack-1.9)/.5));
      const scan = assault * (1-ease((t-19)/1.2)) * .13;
      const beamPower = Math.max(scan,firing);
      w.ray.material.color.setRGB(.45+firing*2.3,1.25+firing*.2,3.6-firing*3.25);
      w.rayHalo.material.color.set(firing>.1?'#ff8b5d':'#899dff');
      for (const [beam, width] of [[w.ray, .17+firing*.26], [w.rayHalo, .8+firing*1.1]]) {
        beam.position.copy(source).addScaledVector(delta, .5);
        beam.quaternion.setFromUnitVectors(up, segmentEnd.copy(delta).normalize()); beam.scale.set(width, length, width);
        beam.visible = beamPower > .02; beam.material.opacity = beamPower * (beam === w.ray ? .7 : .13);
      }
      w.scorch.position.copy(target); w.scorch.scale.setScalar(1 + beamPower * .7); w.scorch.material.opacity = firing * .75; w.scorch.material.color.set('#ffbb7b');
      hostLight(w.rayLight, w.walker, target.x, target.y + 2, target.z); w.rayLight.intensity = detail === 0 ? 0 : firing * 210;
    });
    scars.forEach((scar,i)=>{scar.visible=detail>0||i<2;const age=t-[20.5,23.5,26][i];scar.material.opacity=ease(age/1.5)*.82;scar.material.emissiveIntensity=ease(age/.4)*(1-ease((age-1)/4))*.65;});
    weed.count = detail === 0 ? 60 : detail === 1 ? 110 : 180;
    for (let i = 0; i < weed.count; i++) {
      const s = weedSeeds[i], growth = ease((t - 22 - s.threshold * 3) / 7);
      pose(weed, i, s.x, .1 + s.size * growth, s.z, s.size * growth, s.size * 1.2 * growth + .001,
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
  // One continuous silhouette at every tier. Broad, travelling lobes avoid the
  // horizontal march bands of the former volume and keep the farm visible below.
  const funnelGeometry = new THREE.CylinderGeometry(1, 1, 1, 64 * fine, 48, true);
  const funnelVertex = funnelGeometry.attributes.position;
  const funnelUV = Array.from({ length: funnelVertex.count }, (_, i) => ({
    h: funnelVertex.getY(i) + .5, a: Math.atan2(funnelVertex.getZ(i), funnelVertex.getX(i))
  }));
  const funnelColors = new THREE.Float32BufferAttribute(new Float32Array(funnelVertex.count * 3), 3);
  funnelGeometry.setAttribute('color', funnelColors);
  // A wrapped, repeatable veil supplies moving fine streaks without another shader.
  const vaporPixels = new Uint8Array(128 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) {
    const u = x / 128, v = y / 256;
    const streak = Math.sin(tau * (u * 9 + v * 3) + Math.sin(v * tau * 2) * 1.1) * .16
      + Math.sin(tau * (u * 21 + v * 5)) * .09 + Math.sin(tau * (u * 43 - v * 7)) * .035;
    const tone = Math.round((.76 + streak) * 255), at = (y * 128 + x) * 4;
    vaporPixels[at] = vaporPixels[at + 1] = vaporPixels[at + 2] = tone; vaporPixels[at + 3] = 255;
  }
  const vaporMap = new THREE.DataTexture(vaporPixels, 128, 256);
  vaporMap.wrapS = vaporMap.wrapT = THREE.RepeatWrapping; vaporMap.colorSpace = THREE.SRGBColorSpace;
  vaporMap.minFilter = vaporMap.magFilter = THREE.LinearFilter; vaporMap.needsUpdate = true;
  // Dissolve just the crown into the canopy. This static UV mask is independent
  // of the scrolling vapor map; alpha hashing keeps the body in opaque depth.
  const crownPixels = new Uint8Array(128 * 4);
  for (let y = 0; y < 128; y++) {
    const opacity = Math.round((1 - ease((y / 127 - .77) / .21)) * 255);
    crownPixels[y * 4] = crownPixels[y * 4 + 1] = crownPixels[y * 4 + 2] = opacity;
    crownPixels[y * 4 + 3] = 255;
  }
  const crownMask = new THREE.DataTexture(crownPixels, 1, 128);
  crownMask.minFilter = crownMask.magFilter = THREE.LinearFilter; crownMask.needsUpdate = true;
  const funnel = new THREE.Mesh(funnelGeometry, mat('#c1d0d7', { map: vaporMap, alphaMap: crownMask, alphaHash: true,
    roughness: 1, vertexColors: true, side: THREE.DoubleSide }));
  funnel.name = 'Continuous condensation funnel'; funnel.frustumCulled = false; funnel.userData.opaqueDepth = true;
  funnel.castShadow = true; funnel.receiveShadow = true; outbreak.add(funnel);
  const shadeLow = new THREE.Color('#59534d'), shadeHigh = new THREE.Color('#778d9a');
  function shapeFunnel(t, bx, bz, ground, height, spread, ropeOut, lx, lz) {
    const foot = (2.6 + spread * 8.5) * (1 - ropeOut * .72), shoulder = 32 + spread * 8;
    funnel.position.set(bx, ground + 96 - height, bz);
    vaporMap.offset.set(-t * .065, -t * .038);
    for (let i = 0; i < funnelVertex.count; i++) {
      const { h, a } = funnelUV[i], twist = a - t * (.85 + (1 - h) * .55) - h * 4.8;
      const profile = foot + (shoulder - foot) * Math.pow(h, 1.65 + ropeOut * .45);
      const ripple = 1 + Math.sin(twist * 3 + h * 3.8) * .052 + Math.sin(twist * 7 - h * 5.1) * .019;
      const r = profile * ripple, bend = h * h;
      const crown = ease((h - .82) / .18) * (4 + Math.sin(a * 5 - t * .3) * 1.8 + Math.sin(a * 9 + t * .2));
      funnelVertex.setXYZ(i, Math.cos(a) * r + lx * bend, h * height + crown, Math.sin(a) * r + lz * bend);
      // Large soft tonal strokes follow the helix, never independent horizontal rings.
      color.copy(shadeLow).lerp(shadeHigh, ease(h * 1.6)).multiplyScalar(.84 + .13 * Math.sin(twist * 3 + h * 3.8) + .035 * Math.sin(twist * 9 - h * 6));
      funnelColors.setXYZ(i, color.r, color.g, color.b);
    }
    funnelVertex.needsUpdate = true; funnelColors.needsUpdate = true;
    funnelGeometry.computeVertexNormals();
  }

  const cloudSurface = texturedMaterial('#657886', '#000000', 0, true);
  cloudSurface.material.transparent = true; cloudSurface.material.depthWrite = false;
  const wall = instances(outbreak, new THREE.SphereGeometry(1, 16, 12), cloudSurface.material, 36, 'Rotating wall cloud');
  const wallSeeds = Array.from({ length: 36 }, () => ({ angle: random() * tau, radial: random(), size: .8 + random() * .4, twist: random() * tau }));
  const filament = instances(outbreak, box, mat('#718491', { transparent: true, opacity: 0, depthWrite: false }), 84, 'Condensation filament sources');
  const filamentSeeds = Array.from({length:84}, (_, i) => ({ h:.04 + (i % 21) / 21 * .92,
    a:Math.floor(i / 21) * tau / 4 + random() * .6, size:.8 + random() * .4, phase:random() * tau }));
  const bakedWall = createBakedExplosion({ canvas, cloud:wall, camera });
  const bakedFilaments = createBakedExplosion({ canvas, cloud:filament, camera });
  const dustSurface = texturedMaterial('#9d7854', '#000000', 0, true);
  const dust = instances(outbreak, sphere, dustSurface.material, 20, 'Ground debris cloud');
  const dustSeeds = Array.from({ length: 20 }, () => ({ angle: random() * tau, radial: random(), size: .7 + random() * .6, twist: random() * tau }));
  const debrisSeeds = count => Array.from({ length: count }, () => ({ angle: Math.floor(random() * 3) * tau / 3 + (random() - .5) * .6, radial: random(), height: random(), pickup: random(), spin: random() * tau, size: .35 + random() * 1.1 }));
  const planks = instances(outbreak, box, mat('#b38d62', { roughness: .9 }), 140, 'Airborne farm debris');
  const plankSeeds = debrisSeeds(140);
  // Heavier debris rides the same spiral and is stretched along its own velocity, which reads as motion blur
  // without any frame history.
  const sheets = instances(outbreak, box, mat('#9b8e7d', { roughness: .85, side: THREE.DoubleSide }), 40, 'Airborne roof panels'), sheetSeeds = debrisSeeds(40);
  const limbs = instances(outbreak, cylinder, mat('#3c3128', { roughness: .95 }), 40, 'Airborne tree limbs'), limbSeeds = debrisSeeds(40);
  const clods = instances(outbreak, rock, mat('#4a3b2c', { roughness: 1 }), 90, 'Airborne dirt clods'), clodSeeds = debrisSeeds(90);
  const rain = instances(outbreak, box, mat('#8fa3ac', { transparent: true, opacity: .16, depthWrite: false }), 900, 'Rain curtain');
  const rainSeeds = Array.from({ length: 900 }, () => ({ angle: random() * tau, radial: random(), phase: random() }));
  const farm = new THREE.Group(); farm.name = 'Farmstead'; farm.position.set(-30, terrainHeight(-30, -58), -58); outbreak.add(farm);
  // A triangular prism whose ridge runs along x, apex one unit up and eaves half a unit down.
  const prism = new THREE.CylinderGeometry(1, 1, 1, 3, 1); prism.rotateY(Math.PI / 2); prism.rotateZ(Math.PI / 2);
  const siding = mat('#e2d4b5', { roughness: .8 }), shingle = mat('#4f3b32', { roughness: .95 }), barnRed = mat('#a84d36', { roughness: .85 });
  const steel = mat('#a9b0b4', { metalness: .55, roughness: .5 });
  const part = (parent, geometry, material, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const house = new THREE.Group(); house.name = 'Farmhouse'; farm.add(house);
  const houseBody = part(house, box, siding, 0, 2.75, 0, 12, 5.5, 9);
  houseBody.name = 'Farmhouse siding';
  const houseRoof = part(house, prism, shingle, 0, 6.65, 0, 13, 3.4 / 1.5, 5.5 / .866);
  houseRoof.name = 'Farmhouse flying roof';
  const chimney = part(house, box, mat('#7a3b2e'), 3.2, 7.4, 1.5, 1, 2.6, 1);
  const barn = new THREE.Group(); barn.name = 'Barn'; barn.position.set(21, 0, 8); farm.add(barn);
  const barnBody = part(barn, box, barnRed, 0, 4.5, 0, 14, 9, 20);
  const barnRoof = part(barn, prism, shingle, 0, 10.5, 0, 21, 4.5 / 1.5, 8.5 / .866); barnRoof.rotation.y = Math.PI / 2;
  barnRoof.name = 'Barn flying roof';
  const warmGlass = mat('#e8bd7a', { emissive: '#bb8040', emissiveIntensity: .25, roughness: .4 });
  for (const x of [-.3, .3]) part(houseBody, box, warmGlass, x, .07, .505, .16, .25, .016);
  part(houseBody, box, shingle, 0, -.23, .505, .14, .54, .016);
  part(barnBody, box, shingle, 0, -.13, .505, .42, .72, .016);
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
  const flashLight = new THREE.PointLight('#cfe0ff', 0, 300, 1.4); flashLight.userData.peak = 1300; scene.add(flashLight);
  const funnelDust = particles(outbreak, 'vortex', 1000, '#9b7858', 15);
  const inflow = particles(outbreak, 'inflow', 1200, '#a68b6b', 10);
  const trees = landscape ? landscape.children.slice(1).filter(child => child.isGroup) : [];

  const treeRotations = trees.map(tree => tree.rotation.clone());

  // Position of one debris seed on the spiral at time t, its size factor (zero before pickup) and its angle.
  const spiral = (s, t, bx, bz, ground, lx, lz) => {
    const pickupAt = 13 + s.pickup * 5.5, age = Math.max(0, t - pickupAt);
    const lift = ease(age / (2.6 + s.height * 1.4)), release = ease((age - 7.5) / 6);
    const h = (2 + s.height * s.height * 53 * lift) * (1 - release * .9);
    const r = (6 + s.radial * 18) * (.4 + lift * .6) * (1 + h * .012) + release * (12 + s.radial * 27);
    const angle = s.angle + age * (.8 + s.radial * .48) + lift * 1.6 - release * age * .28 + h * .025;
    const bend = (h / 96) ** 2, size = s.size * ease(age / .35);
    return [bx + lx * bend + Math.cos(angle) * r, ground + h, bz + lz * bend + Math.sin(angle) * r, size, angle];
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
      if (pull <= 0 || dist < 1e-6) { tree.rotation.copy(treeRotations[i]); return; }
      const lean = pull * .55 * (1 + Math.sin(t * 6.5 + i * 1.9) * .18);
      tree.rotation.set(treeRotations[i].x + lean * dz / dist, treeRotations[i].y, treeRotations[i].z - lean * dx / dist);
    });
  }

  function updateTornado(t, detail) {
    const down = ease((t - 8) / 5), spread = ease((t - 13) / 5), ropeOut = ease((t - 25) / 5);
    const [bx, bz] = base(t), ground = terrainHeight(bx, bz), height = 22 + down * 74;
    const lx = -8 + Math.sin(t * .34) * (4 + ropeOut * 7), lz = -4 + Math.cos(t * .29) * (3 + ropeOut * 5);
    shapeFunnel(t, bx, bz, ground, height, spread, ropeOut, lx, lz);
    cloudSurface.clock.value = t; dustSurface.clock.value = t;
    strike(t, strikes, bolts, flashLight);
    const cx = bx + lx, cz = bz + lz;
    wall.count = detail === 0 ? 24 : 36;
    for (let i = 0; i < wall.count; i++) {
      const s = wallSeeds[i], inner = i < 8;
      const a = inner ? i * tau / 8 + t * .065 : s.angle + t * (.055 + (1 - s.radial) * .07), r = inner ? 25 : 10 + s.radial * 56;
      // A low inner ring overlaps the irregular funnel crown, hiding the cut edge.
      pose(wall, i, cx + Math.cos(a) * r, ground + (inner ? 95 : 100 + s.radial * 6) + Math.sin(s.twist + t * .3) * 2, cz + Math.sin(a) * r,
        27 * s.size, (9 + s.radial * 4) * s.size, 24 * s.size, .04 * Math.sin(s.twist), a, .05 * Math.cos(s.twist));
    }
    wall.instanceMatrix.needsUpdate = true;
    filament.count = detail === 0 ? 42 : detail === 1 ? 63 : 84;
    for (let i = 0; i < filament.count; i++) {
      const s = filamentSeeds[i], h = s.h + Math.sin(t * .35 + s.phase) * .015;
      const a = s.a + t * (.58 + (1 - h) * .38) + h * 4.8;
      const foot = (2.6 + spread * 8.5) * (1 - ropeOut * .72);
      const radius = foot + (32 + spread * 8 - foot) * Math.pow(h, 1.65 + ropeOut * .45);
      const size = (1.7 + h * 6) * s.size;
      pose(filament, i, bx + lx * h * h + Math.cos(a) * radius * .98,
        ground + 96 - height + height * h, bz + lz * h * h + Math.sin(a) * radius * .98,
        size * 1.12, size * 1.65, size, 0, 0, 0);
    }
    filament.instanceMatrix.needsUpdate = true;
    bakedWall.update(t + 6, 27 + (Math.sin(t * .13) * .5 + .5) * 3);
    bakedFilaments.update(t + 6, 28 + (Math.sin(t * .21) * .5 + .5) * 2);
    cloudSurface.material.opacity = bakedWall.ready ? .018 : .72;
    // Helpers own two crossfading ordinary-material atlas layers; source capacity
    // identifies each owned batch without modifying the shared helper contract.
    for (const child of outbreak.children) if (child.isInstancedMesh && child.material.map && child.geometry.type === 'PlaneGeometry') {
      const mist = child.instanceMatrix.count === 84;
      child.name = mist ? 'Soft rotating funnel filaments' : 'Soft continuous storm ceiling';
      child.material.color.set(mist ? '#8ca6b8' : '#9aaebc');
      child.material.opacity *= mist ? .38 : .94;
    }
    canvas.dataset.twisterBake = bakedWall.ready && bakedFilaments.ready ? 'ready' : canvas.dataset.explosionBake === 'fallback' ? 'fallback' : 'loading';
    dust.visible = t > 12.8;
    dust.count = detail === 0 ? 12 : 20;
    const touchdown = ease((t - 12.8) / 1.2);
    for (let i = 0; i < dust.count; i++) {
      const s = dustSeeds[i], a = s.angle + t * (.8 + s.radial * .4), r = (5 + s.radial * 12) * (.4 + spread * .6) + ropeOut * s.radial * 13;
      const size = (3.2 + spread * 3.5) * s.size * touchdown * (1 - ropeOut * .35);
      pose(dust, i, bx + Math.cos(a) * r, ground + 1.8 + s.radial * 4, bz + Math.sin(a) * r,
        size * 1.5, size * .65, size, .12 * Math.sin(t + s.twist), a, .12 * Math.cos(s.twist));
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
    const roofAge = Math.max(0, t - 15.4), barnAge = Math.max(0, t - 15.9);
    const roofFall = ease((roofAge - 5) / 7), barnFall = ease((barnAge - 5.5) / 7);
    houseRoof.position.set(hit * (Math.sin(roofAge * .7) * 16 + roofAge * 1.1),
      6.65 + hit * 34 * (1 - roofFall) - roofFall * 5, hit * (Math.cos(roofAge * .7) * 12 + roofAge * 2));
    houseRoof.rotation.set(hit * (roofAge * .8 + .3), hit * roofAge * .45, hit * .9);
    houseBody.scale.y = 5.5 * (1 - hit * .85); houseBody.position.y = houseBody.scale.y / 2; houseBody.rotation.z = hit * .55;
    chimney.position.y = 7.4 - hit * 4; chimney.rotation.x = hit * 1.2;
    barnRoof.position.set(hitBarn * (Math.sin(barnAge * .55 + .7) * 19 + barnAge * 2),
      10.5 + hitBarn * 40 * (1 - barnFall) - barnFall * 8, hitBarn * (Math.cos(barnAge * .55) * 16 + barnAge * 1.3));
    barnRoof.rotation.set(hitBarn * barnAge * .7, Math.PI / 2 + hitBarn * barnAge * .45, hitBarn * 1.1);
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
  function leaveTornado() { flashLight.intensity = 0; trees.forEach((tree, i) => tree.rotation.copy(treeRotations[i])); }
    return { group: outbreak, update: updateTornado, updateView: viewCamera => { bakedWall.updateView(viewCamera); bakedFilaments.updateView(viewCamera); }, leave: leaveTornado, particles: [funnelDust, inflow] };
  }
  function createEruption() {
    seed = 19971997;
    const eruption = group("Dante's Peak — Plinian eruption");
    const vent = new THREE.Vector3(-60, 0, -250);
    const ridgeAt = (a, u) => Math.sin(a * 7 + u * 2) * .55 + Math.sin(a * 13 - u * 3) * .3 + Math.sin(a * 3) * .4;
    const radiusAtHeight = (radius, a, u, rim) => (radius * Math.pow(1 - u, 1.12) + rim * u) * (1 + ridgeAt(a, u) * .17 * Math.sin(u * Math.PI));
    const heightAt = (height, a, u) => height * u + ridgeAt(a, u) * 5 * Math.sin(u * Math.PI) - (2 + Math.sin(a * 3) * 2) * u * u - 1;
    const flank = (x, z) => {
      if (Math.hypot(x - vent.x, z - vent.z) >= 145) return terrainHeight(x, z);
      let low = 0, high = 1, a = 0;
      for (let step = 0; step < 10; step++) {
        const u = (low + high) / 2, dx = x - vent.x - 7 * u, dz = z - vent.z + 4 * u;
        a = Math.atan2(dz, dx);
        if (Math.hypot(dx, dz) < radiusAtHeight(145, a, u, 19)) low = u; else high = u;
      }
      return Math.max(heightAt(110, a, low), terrainHeight(x, z));
    };
    const ash = { value: 0 };
    const mountainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 });
    mountainMaterial.onBeforeCompile = shader => {
      shader.uniforms.ashFall = ash;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float ashFall;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.34,.31,.29),ashFall);');
    };
    mountainMaterial.customProgramCacheKey = () => 'terrestrial-ashfall-v1';
    recordSurface(mountainMaterial,{kind:'mountain',uniforms:{ashFall:ash}});
    // Continue the shared valley beyond its square edge without mutating the landscape.
    const axis = [-950, -750, -550, -400, -320, -280, ...Array.from({ length: 51 }, (_, i) => -250 + i * 10), 280, 320, 400, 550, 750, 950];
    const valleyPositions = [], valleyUVs = [], valleyIndices = [];
    for (const y of axis) for (const x of axis) {
      valleyPositions.push(x, y, terrainHeight(x, -y) + .5);
      valleyUVs.push(x / 500 + .5, y / 500 + .5);
    }
    for (let y = 0; y < axis.length - 1; y++) for (let x = 0; x < axis.length - 1; x++) {
      if (axis[x] >= -250 && axis[x + 1] <= 250 && axis[y] >= -250 && axis[y + 1] <= 250) continue;
      const a = y * axis.length + x, b = a + 1, c = a + axis.length, d = c + 1;
      valleyIndices.push(a, b, d, a, d, c);
    }
    const valleyGeometry = new THREE.BufferGeometry();
    valleyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(valleyPositions, 3));
    valleyGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(valleyUVs, 2));
    valleyGeometry.setIndex(valleyIndices); valleyGeometry.computeVertexNormals();
    const valley = new THREE.Mesh(valleyGeometry, landscape?.children[0]?.material || mat('#35482b', { roughness: 1 }));
    valley.name = 'Dante valley continuation'; valley.rotation.x = -Math.PI / 2; valley.position.y = -.5; valley.receiveShadow = true; eruption.add(valley);
    function peak(radius, height, x, z, name, stretch = 1, rim = 19) {
      const geometry = new THREE.CylinderGeometry(1, 1, 1, 72 * fine, 28, true);
      const p = geometry.attributes.position, colors = [];
      for (let i = 0; i < p.count; i++) {
        const u = p.getY(i) + .5, a = Math.atan2(p.getZ(i), p.getX(i));
        const ridge = ridgeAt(a, u), r = radiusAtHeight(radius, a, u, rim);
        const y = rim === 0 && u === 1 ? height : heightAt(height, a, u) + 1;
        const px = Math.cos(a) * r * stretch + 7 * u, pz = Math.sin(a) * r - 4 * u;
        p.setXYZ(i, px, y, pz);
        const grain = Math.sin(a * 17 + u * 19) * .5 + Math.cos(a * 9 - u * 30) * .5;
        const snow = u > .77 + Math.sin(a * 7) * .045 + Math.sin(a * 3) * .05;
        const c = snow ? new THREE.Color('#b9c4c7').multiplyScalar(.86 + grain * .12)
          : u > .3 ? new THREE.Color('#555355').multiplyScalar(.77 + ridge * .16 + grain * .1)
            : new THREE.Color('#303d35').multiplyScalar(.8 + grain * .12);
        colors.push(c.r, c.g, c.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, mountainMaterial); mesh.name = name; mesh.position.set(x, -1, z); mesh.receiveShadow = true; eruption.add(mesh);
      return mesh;
    }
    peak(145, 110, vent.x, vent.z, 'Stratovolcano');
    peak(91, 59, 110, -300, 'Neighbouring ridge', 1.65, 0);
    const crater = new THREE.Mesh(new THREE.ConeGeometry(20, 19, 48, 1, true), mat('#242728', { roughness: 1, side: THREE.DoubleSide }));
    crater.name = 'Broken crater bowl'; crater.rotation.z = Math.PI; crater.position.set(vent.x + 7, 96, vent.z - 4); eruption.add(crater);
    const craterMaterial = glow(new THREE.Color(2.2, .5, .08), 0);
    const craterGlow = new THREE.Mesh(new THREE.CircleGeometry(14, 24), craterMaterial); craterGlow.name = 'Rising magma';
    craterGlow.rotation.x = -Math.PI / 2; craterGlow.position.set(vent.x + 7, 89, vent.z - 4); eruption.add(craterGlow);

    // A continuous ash body carries the silhouette; overlapping billows soften its edge.
    const profile = [[0, 10], [.12, 15], [.42, 21], [.66, 25], [.82, 29], [.95, 19], [1, 0]];
    const radiusAt = f => {
      const end = profile.findIndex(([at]) => at >= f), [b, rb] = profile[Math.max(1, end)], [a, ra] = profile[Math.max(1, end) - 1];
      return ra + (rb - ra) * ease((f - a) / (b - a));
    };
    const plumeGeometry = new THREE.CylinderGeometry(1, 1, 1, 48 * fine, 36, false);
    const pp = plumeGeometry.attributes.position, plumeColors = [];
    for (let i = 0; i < pp.count; i++) {
      const f = pp.getY(i) + .5, a = Math.atan2(pp.getZ(i), pp.getX(i));
      const wave = Math.sin(a * 7 + f * 21) * .065 + Math.cos(a * 11 - f * 16) * .04;
      const r = radiusAt(f) * (1 + wave);
      pp.setXYZ(i, Math.cos(a) * r + f * f * 24, f * 165, Math.sin(a) * r - f * f * 8);
      const c = new THREE.Color('#45464a').lerp(new THREE.Color('#7d7c77'), f * .7).multiplyScalar(.92 + wave * .5);
      plumeColors.push(c.r, c.g, c.b);
    }
    plumeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(plumeColors, 3)); plumeGeometry.computeVertexNormals();
    const plume = new THREE.Mesh(plumeGeometry, mat('#ffffff', { vertexColors: true, roughness: 1, transparent: true, depthWrite: false }));
    plume.name = 'Continuous eruption column'; plume.position.set(vent.x + 7, 91, vent.z - 4); eruption.add(plume);
    const crownColor = new THREE.Color('#7d7c77'), rearAshColor = new THREE.Color('#45484b');
    const billowGeometry = new THREE.SphereGeometry(1, 16, 12), bp = billowGeometry.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const r = 1 + Math.sin(x * 4 + y * 3) * Math.cos(z * 5 - y * 3) * .065;
      bp.setXYZ(i, x * r, y * r, z * r);
    }
    billowGeometry.computeVertexNormals();
    const column = instances(eruption, billowGeometry, mat('#ffffff', { roughness: 1, transparent: true, depthWrite: false }), 54, 'Plinian eruption column');
    const columnSeeds = Array.from({ length: 54 }, (_, i) => ({ f: .06 + (i % 18 + random() * .5) / 18 * .84, angle: Math.floor(i / 18) * tau / 3 + random() * 1.4, size: .85 + random() * .3, phase: random() * tau }));
    const crown = instances(eruption, billowGeometry, mat('#ffffff', { roughness: 1, transparent: true, depthWrite: false }), 24, 'Rolling ash crown');
    const crownSeeds = Array.from({ length: 24 }, (_, i) => ({ angle: i * 2.39996, radius: i < 8 ? Math.sqrt(i / 8) * 29 : 46 + random() * 15, size: .85 + random() * .3, phase: random() * tau }));
    const bombs = instances(eruption, rock, mat('#35221d', { emissive: '#ff5a1b', emissiveIntensity: 1.8, roughness: .9 }), 44, 'Ballistic lava bombs');
    const bombSeeds = Array.from({ length: 44 }, () => ({ launch: 6 + random() * 16, angle: random() * tau, lateral: 5 + random() * 20, vertical: 29 + random() * 31, size: .5 + random() * 1.5, spin: random() * tau }));
    const surge = instances(eruption, billowGeometry, mat('#777975', { roughness: 1, transparent: true, depthWrite: false }), 48, 'Pyroclastic surge front');
    const surgeSeeds = Array.from({ length: 48 }, (_, i) => ({ lead: i < 16,
      trail: i < 16 ? .93 + random() * .07 : .06 + ((i - 16) * .618034 % 1) * .88 + (random() - .5) * .025,
      across: i < 16 ? (i / 15 * 2 - 1) + (random() - .5) * .09 : (random() - .5) * (i < 28 ? .5 : 1.3),
      size: .85 + random() * .3, phase: random() * tau }));
    const bolts = [bolt(eruption, new THREE.Vector3(vent.x + 29, 153, vent.z - 10), new THREE.Vector3(vent.x + 8, 101, vent.z + 5), 'Volcanic lightning east'),
      bolt(eruption, new THREE.Vector3(vent.x - 24, 188, vent.z + 8), new THREE.Vector3(vent.x - 8, 119, vent.z), 'Volcanic lightning west'),
      bolt(eruption, new THREE.Vector3(vent.x + 36, 234, vent.z + 16), new THREE.Vector3(vent.x + 13, 160, vent.z + 9), 'Volcanic lightning south')];
    const strikes = [[9.4, 0], [12.1, 1], [17.7, 2], [23.5, 1]];
    const flashLight = new THREE.PointLight('#dfe6ff', 0, 320, 1.4); flashLight.userData.peak = 1100; eruption.add(flashLight);
    const ventLight = new THREE.PointLight('#ff7a2a', 0, 280, 1.3); ventLight.position.set(vent.x + 7, 108, vent.z - 4); eruption.add(ventLight);
    const ashFall = particles(eruption, 'ash', 800, '#9a9790', 3);
    const bakedColumn = createBakedExplosion({ canvas, cloud: column, camera });
    const bakedCrown = createBakedExplosion({ canvas, cloud: crown, camera });
    const bakedSurge = createBakedExplosion({ canvas, cloud: surge, camera });

    function updateEruption(t, detail) {
      const rise = ease((t - 6) / 12), growth = ease((t - 6) / 3), front = ease((t - 13.5) / 16.5);
      const heat = ease((t - 5) / 1.5) * (1 - ease((t - 8) / 10));
      ash.value = ease((t - 15) / 15) * .35;
      craterMaterial.opacity = ease((t - 3) / 3) * (.28 + Math.sin(t * 3) * .045) * (1 - rise * .65);
      plume.visible = t > 6; plume.scale.set(growth * (.56 + rise * .44), Math.max(.001, rise), growth * (.56 + rise * .44));
      column.visible = t > 6; column.count = detail === 0 ? 18 : detail === 1 ? 36 : 54;
      for (let i = 0; i < column.count; i++) {
        const s = columnSeeds[i], f = Math.min(.97, s.f + Math.sin(t * .38 + s.phase) * .025), a = s.angle + t * .055;
        const radial = radiusAt(f) * (.76 + .07 * Math.sin(t * .5 + s.phase)), spread = growth * (.56 + rise * .44);
        const size = (9 + f * 11) * s.size * growth;
        pose(column, i, vent.x + 7 + (Math.cos(a) * radial + f * f * 24) * spread,
          91 + f * 165 * rise, vent.z - 4 + (Math.sin(a) * radial - f * f * 8) * spread,
          size, size * (.85 + rise * .35), size, t * .045 + s.phase, a, s.phase * .2);
        color.set('#45464a').lerp(crownColor, f * .7).multiplyScalar(.95 + Math.sin(s.phase) * .05); column.setColorAt(i, color);
      }
      column.instanceMatrix.needsUpdate = true; column.instanceColor.needsUpdate = true;
      crown.visible = t > 9; crown.count = detail === 0 ? 16 : 24;
      const spreadCrown = ease((t - 9) / 10);
      for (let i = 0; i < crown.count; i++) {
        const s = crownSeeds[i], a = s.angle + t * .023, radius = s.radius * spreadCrown, size = (25 + Math.sin(s.phase) * 3) * s.size * spreadCrown;
        pose(crown, i, vent.x + 7 + 22 * rise + Math.cos(a) * radius, 91 + 149 * rise + Math.sin(s.phase + t * .18) * 5 * spreadCrown,
          vent.z - 4 - 8 * rise + Math.sin(a) * radius, size * 1.15, size * .83, size, t * .025 + s.phase, a, Math.sin(s.phase) * .15);
        color.set('#777873').multiplyScalar(.9 + Math.sin(s.phase) * .08); crown.setColorAt(i, color);
      }
      crown.instanceMatrix.needsUpdate = true; crown.instanceColor.needsUpdate = true;
      bombs.count = detail === 0 ? 16 : detail === 1 ? 28 : 44;
      for (let i = 0; i < bombs.count; i++) {
        const s = bombSeeds[i], age = t - s.launch;
        const x = vent.x + 7 + Math.cos(s.angle) * s.lateral * age, z = vent.z - 4 + Math.sin(s.angle) * s.lateral * age, y = 100 + s.vertical * age - 13 * age * age;
        const size = age > 0 && age < 8 && y > flank(x, z) - 2 ? s.size : .001;
        pose(bombs, i, x, y, z, size, size * .8, size * 1.2, age * 3 + s.spin, age * 2, s.spin);
      }
      bombs.instanceMatrix.needsUpdate = true;
      surge.visible = t > 13.5; surge.count = detail === 0 ? 24 : detail === 1 ? 36 : 48;
      for (let i = 0; i < surge.count; i++) {
        const s = surgeSeeds[i], reach = front * 245 * s.trail * (1 - Math.abs(s.across) * .09);
        const width = 15 + reach * .29, x = vent.x + 7 + reach * .12 + s.across * width, z = vent.z + reach;
        const size = (13 + reach * .06) * s.size * ease((t - 13.5) / 2.5);
        const height = bakedSurge.ready ? (s.lead ? .95 : 1.15) : (s.lead ? .52 : .64);
        pose(surge, i, x, flank(x, z) + size * .06 + Math.sin(t * .8 + s.phase) * front, z,
          size * 1.65, size * height, size * 1.6, Math.sin(t * .15 + s.phase) * .08, s.phase, 0);
        color.set('#82837e').lerp(rearAshColor, (1 - s.trail) * .7).multiplyScalar(.94 + Math.sin(s.phase) * .06); surge.setColorAt(i, color);
      }
      surge.instanceMatrix.needsUpdate = true; surge.instanceColor.needsUpdate = true;
      // Cool atlas frames add soft ash detail; solid meshes remain the failed-request fallback.
      bakedColumn.update(t, 26 + ease((t - 6) / 24) * 5);
      bakedCrown.update(t, 27 + ease((t - 9) / 21) * 4);
      bakedSurge.update(t, 27 + ease((t - 13.5) / 16.5) * 4);
      plume.material.opacity = bakedColumn.ready ? .1 : .85;
      column.material.opacity = bakedColumn.ready ? .045 : .85;
      crown.material.opacity = bakedCrown.ready ? .045 : .85;
      surge.material.opacity = bakedSurge.ready ? .035 : .85;
      canvas.dataset.danteBake = bakedColumn.ready && bakedCrown.ready && bakedSurge.ready ? 'ready' : canvas.dataset.explosionBake === 'fallback' ? 'fallback' : 'loading';
      ventLight.intensity = (heat * 650 + growth * 120) * (detail === 0 ? .6 : 1);
      strike(t, strikes, bolts, flashLight);
    }
    return { group: eruption, update: updateEruption, updateView: viewCamera => {
      bakedColumn.updateView(viewCamera); bakedCrown.updateView(viewCamera); bakedSurge.updateView(viewCamera);
    }, particles: ashFall };
  }
  function createSuperstorm() {
    seed = 20042004;
  // The storm travels across the skyline, leaving readable frozen architecture in its wake.
  const superstorm = group('The Day After Tomorrow — superstorm');
  const snowMaterial = mat('#dae8f1', { roughness: .8 });
  const drifts = instances(superstorm, new THREE.SphereGeometry(1, 10 * fine, 6 * fine), snowMaterial, 132, 'Snow drifts');
  drifts.receiveShadow = true;
  // Drifts pile against the building fronts along the 17-unit street grid.
  const driftSeeds = Array.from({ length: 132 }, (_, i) => {
    const road = -4 + (i % 9), along = -72 + Math.floor(i / 9) * 10.3 + random() * 6, side = i % 2 ? 1 : -1, offset = 1.9 + random() * 1.4;
    const crossStreet = i % 3 === 0;
    return { x: crossStreet ? along : road * 17 + side * offset, z: crossStreet ? road * 17 + side * offset : along,
      w: 3 + random() * 4.5, h: .7 + random() * 1.1, d: 2 + random() * 3, spin: random() * tau, onset: random() };
  });
  const iceMaterial = new THREE.MeshStandardMaterial({ color: '#8fbbd2', roughness: .1, metalness: .06, transparent: true, opacity: 0, envMapIntensity: 1.3, depthWrite: false });
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
  const roofSnow = instances(superstorm, box, snowMaterial, Math.max(1, buildings.length), 'Windward roof frost');
  roofSnow.receiveShadow = true;
  const frostMaterial = mat('#a8d5eb', { roughness: .18, metalness: .12, emissive: '#46718d', emissiveIntensity: .08 });
  const frostEdges = instances(superstorm, box, frostMaterial, Math.max(1, buildings.length * 2), 'Descending facade ice');
  const blizzard = particles(superstorm, 'blizzard', 10000, '#eff7ff', 2.15);
  blizzard.mesh.name = 'Directional snow front';
  const spindrift = particles(superstorm, 'spindrift', 700, '#a8c7da', 22);
  spindrift.mesh.name = 'Street-level blowing snow';
  const streakMaterial = new THREE.MeshBasicMaterial({ color: '#d5eafa', transparent: true, opacity: 0, depthWrite: false });
  const streaks = instances(superstorm, box, streakMaterial, 160, 'Wind-driven snow streaks');
  const streakSeeds = Array.from({ length: 160 }, () => ({ x: random(), y: random(), z: random(), length: .8 + random() * 2.2 }));

  function updateSuperstorm(t, detail) {
    const glaze = ease((t - 12) / 15);
    const storm = ease((t - 4) / 7) * (1 - ease((t - 21) / 8));
    const frontX = -250 + ease((t - 7) / 15) * 365 + Math.max(0, t - 22) * 22;
    // Existing particle shaders provide the gusts; translating their finite field gives the front a direction.
    blizzard.mesh.position.set(frontX, 0, -10);
    blizzard.count = Math.floor(700 + 9300 * storm);
    spindrift.mesh.position.set(-210 + ease((t - 9) / 15) * 330, 0, 0);
    spindrift.count = Math.floor(100 + 600 * storm);
    streakMaterial.opacity = .48 * ease((t - 8) / 4) * (1 - ease((t - 20) / 7));
    streaks.visible = streakMaterial.opacity > 0;
    streaks.count = [60, 100, 160][detail];
    const gust = 18 + ease((t - 8) / 10) * 28;
    for (let i = 0; i < streaks.count; i++) {
      const s = streakSeeds[i];
      const x = (s.x * 320 + t * gust) % 320 - 160 + frontX;
      const y = ((s.y * 100 - t * (5 + s.z * 7)) % 100 + 100) % 100 + 2;
      const z = (s.z * 280 + t * gust * .28) % 280 - 140;
      pose(streaks, i, x, y, z, s.length * (1 + storm), .12, .12, 0, -.27, -.14);
    }
    streaks.instanceMatrix.needsUpdate = true;
    drifts.count = detail === 0 ? 60 : detail === 1 ? 96 : 132;
    for (let i = 0; i < drifts.count; i++) {
      const s = driftSeeds[i], arrival = 10 + (s.x + 85) / 170 * 8;
      const pile = ease((t - arrival - s.onset * 2) / 9), h = s.h * pile;
      pose(drifts, i, s.x, -1 + h * .35, s.z, s.w * (.6 + pile * .4), Math.max(.001, h), s.d * (.6 + pile * .4), 0, s.spin, 0);
    }
    drifts.instanceMatrix.needsUpdate = true;
    ice.visible = glaze > 0; iceMaterial.opacity = glaze * .65;
    icicles.visible = t > 11; icicles.count = detail === 0 ? Math.floor(icicleCount / 2) : icicleCount;
    for (let i = 0; i < icicles.count; i++) {
      const s = icicleSeeds[i], u = buildings[Math.floor(i / 4)].userData, front = i % 4 < 2;
      const arrival = 10 + (u.x + 85) / 170 * 8;
      const drop = s.length * ease((t - arrival - s.onset * 2) / 8);
      pose(icicles, i, front ? u.x - u.w / 2 + s.offset * u.w : u.x + u.w / 2 + .05, -1 + u.h - .05,
        front ? u.z + u.d / 2 + .05 : u.z - u.d / 2 + s.offset * u.d, s.radius, Math.max(.001, drop), s.radius);
    }
    icicles.instanceMatrix.needsUpdate = true;
    roofSnow.count = buildings.length; frostEdges.count = buildings.length * 2;
    roofSnow.visible = frostEdges.visible = t > 10;
    for (let i = 0; i < buildings.length; i++) {
      const u = buildings[i].userData, arrival = 10 + (u.x + 85) / 170 * 8;
      const frost = ease((t - arrival) / 7), drop = Math.max(.001, u.h * frost), coverage = Math.max(.001, ease(frost * 2));
      pose(roofSnow, i, u.x, u.h - .85, u.z, u.w * 1.04 * coverage, Math.max(.001, frost * .5), u.d * 1.04 * coverage);
      // Two bright corners preserve facade contrast instead of coating the entire building in white.
      for (let edge = 0; edge < 2; edge++) {
        pose(frostEdges, i * 2 + edge, u.x + (edge ? 1 : -1) * (u.w / 2 + .04), u.h - 1 - drop / 2,
          u.z + u.d / 2 + .06, .12 + frost * .18, drop, .16);
      }
    }
    roofSnow.instanceMatrix.needsUpdate = frostEdges.instanceMatrix.needsUpdate = true;
  }
    return { group: superstorm, update: updateSuperstorm, particles: [blizzard, spindrift] };
  }
  function createVisitation() {
    seed = 20082008;
    const visitation = group('The Day the Earth Stood Still — visitation');
    const landing = new THREE.Vector3(-25, 31, -42), stand = new THREE.Vector3(24, 0, 18);
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
    const sphereMaterial = luminous(.72);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(28, 56 * fine, 36 * fine), sphereMaterial);
    orb.name = 'Luminous sphere'; orb.userData.opaqueDepth = true; visitation.add(orb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(29.5, 36 * fine, 24 * fine), rimGlow('#7fe9d2', .26));
    halo.name = 'Sphere halo'; visitation.add(halo);
    const arkMaterial = luminous(.36);
    const arks = [[-130, -210], [100, -240], [-55, -280]].map(([x, z], i) => {
      const ark = new THREE.Mesh(new THREE.SphereGeometry(7 + i, 20 * fine, 14 * fine), arkMaterial);
      ark.name = 'Departing ark'; ark.userData.opaqueDepth = true; ark.position.set(x, -25, z); visitation.add(ark); return ark;
    });
    const ringMaterial = glow('#9ff2e0', 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .16, 6, 80), ringMaterial);
    ring.name = 'Landing pressure ring'; ring.rotation.x = -Math.PI / 2; ring.position.set(landing.x, .2, landing.z); visitation.add(ring);
    const sphereLight = new THREE.PointLight('#86d9c5', 0, 220, 1.3); visitation.add(sphereLight);
    const gort = new THREE.Group(); gort.name = 'GORT'; visitation.add(gort);
    const shell = mat('#64767a', { metalness: .72, roughness: .34, alphaHash: true });
    const softSphere = new THREE.SphereGeometry(1, 20 * fine, 14 * fine);
    const limbGeometry = new THREE.CylinderGeometry(1, 1, 1, 16 * fine);
    const limbs = instances(gort, limbGeometry, shell, 8, 'GORT limbs');
    const joints = instances(gort, softSphere, shell, 12, 'GORT joints');
    const feet = instances(gort, softSphere, shell, 2, 'GORT feet');
    const torsoProfile = [[0,12],[1.9,12],[2.8,13.4],[2.6,15.5],[3.2,18],[4.2,20.8],[4.1,22],[3.2,23.2],[1.5,24],[0,24]].map(([x,y]) => new THREE.Vector2(x,y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 32 * fine), shell);
    torso.name = 'GORT continuous torso'; torso.scale.z = .64; gort.add(torso);
    const head = new THREE.Mesh(new THREE.CapsuleGeometry(1.75, 2.2, 6, 16 * fine), shell);
    head.name = 'GORT smooth head'; head.position.set(0, 26.1, 0); gort.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), glow(new THREE.Color(.85, 2.0, 1.65), 0));
    visor.name = 'GORT visor'; visor.scale.set(1.65, .16, .42); visor.position.set(0, 26.4, 1.55); gort.add(visor);
    const beam = new THREE.Mesh(cylinder, glow(new THREE.Color(.6, 1.7, 1.35), 0)); beam.name = 'GORT scanning beam'; gort.add(beam);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), glow('#bafff0', 0)); scorch.rotation.x = -Math.PI / 2; gort.add(scorch);
    const beamLight = new THREE.PointLight('#a5fff0', 0, 85, 1.5); visitation.add(beamLight);
    for (const mesh of [limbs, joints, feet, torso, head]) mesh.castShadow = true;
    const hip = [new THREE.Vector3(), new THREE.Vector3()], knee = [new THREE.Vector3(), new THREE.Vector3()], foot = [new THREE.Vector3(), new THREE.Vector3()];
    const shoulder = [new THREE.Vector3(), new THREE.Vector3()], elbow = [new THREE.Vector3(), new THREE.Vector3()], wrist = [new THREE.Vector3(), new THREE.Vector3()];
    const groundHeight = (x, z) => -.5 + (Math.sin(x * .022) * Math.cos(z * .027) * 5 - Math.sin(z * .06) * 1.5) * clamp((Math.hypot(x, z) - 25) / 80);
    const trees = landscape ? landscape.children.filter(child => child.isGroup).map(tree => ({ tree, scale: tree.scale.clone() })) : [];
    // Fine metallic splinters collect into three coherent ribbons instead of a uniform fog disk.
    const nanites = instances(visitation, new THREE.TetrahedronGeometry(1), mat('#536e71', { metalness: .6, roughness: .46, emissive: '#42675f', emissiveIntensity: .16 }), 2400, 'Directional nanite ribbons');
    const seeds = Array.from({ length: 2400 }, (_, i) => ({ lane: i % 5 < 3 ? 0 : i % 5 - 2, u: random(), v: random(), w: random(), angle: random() * tau }));
    const paths = [new THREE.Vector3(-85, 7, 65), new THREE.Vector3(-110, 9, -105), new THREE.Vector3(100, 7, -125)];
    const bank = new THREE.Color('#485e61'), glint = new THREE.Color('#9ac4bc');
    for (let i = 0; i < seeds.length; i++) nanites.setColorAt(i, bank.clone().lerp(glint, seeds[i].w * seeds[i].w));
    nanites.instanceColor.needsUpdate = true;

    function updateVisitation(t, detail) {
      const descent = ease(t / 9), settled = ease((t - 9) / 1), depart = ease((t - 27) / 3);
      const landingFlash = Math.sin(clamp((t - 8.4) / 1.4) * Math.PI);
      sphereClock.value = t;
      orb.position.set(landing.x, 100 - descent * 69 + Math.sin(t * .6) * .3 * settled + depart * depart * 115, landing.z);
      orb.rotation.set(t * .028, t * .055, 0);
      halo.position.copy(orb.position); halo.scale.setScalar(1 + landingFlash * .055 + depart * .08);
      sphereMaterial.uniforms.glow.value = .72 + landingFlash * .45 + depart * .2;
      halo.material.uniforms.strength.value = .26 + landingFlash * .22 + depart * .1;
      sphereLight.position.copy(orb.position).y -= 22;
      sphereLight.intensity = (300 + descent * 650 + landingFlash * 1000) * (1 - depart) * (detail === 0 ? .65 : 1);
      ring.visible = t > 9 && t < 12.5; ring.scale.setScalar(1 + ease((t - 9) / 3.5) * 85); ringMaterial.opacity = (1 - ease((t - 9) / 3.5)) * .38;
      arks.forEach((ark, i) => { ark.position.y = -25 + ease((t - 23 - i * 1.1) / 7) * 115; ark.visible = t > 23 + i * 1.1; });
      const walk = ease((t - 10) / 6.2), amp = ease((t - 10) / 1.2) * (1 - ease((t - 15) / 1.2)), gone = ease((t - 19) / 4);
      gort.visible = t > 10 && t < 23;
      gort.position.set(landing.x + walk * (stand.x - landing.x), 0, -11 + walk * (stand.z + 11));
      gort.position.y = groundHeight(gort.position.x, gort.position.z);
      gort.rotation.y = .35 + ease((t - 16.3) / 1.2) * .2;
      gort.scale.setScalar(1.7);
      shell.opacity = 1 - gone;
      const stride = walk * 12.2;
      let limb = 0, joint = 0;
      for (const side of [0, 1]) {
        const sign = side ? 1 : -1, swing = stride + side * Math.PI;
        hip[side].set(sign * 1.9, 13.5, 0);
        knee[side].set(sign * 2.2, 7.4 + Math.max(0, Math.sin(swing)) * .8 * amp, Math.sin(swing) * 2.2 * amp);
        foot[side].set(sign * 2.35, .8 + Math.max(0, Math.sin(swing)) * 1.2 * amp, Math.cos(swing) * 3.6 * amp);
        segment(limbs, limb++, hip[side], knee[side], 1.65); segment(limbs, limb++, knee[side], foot[side], 1.18);
        shoulder[side].set(sign * 4.0, 21.4, 0);
        elbow[side].set(sign * 4.7, 16, -Math.sin(swing) * 1.3 * amp);
        wrist[side].set(sign * 4.8, 10.5, -Math.sin(swing) * 2.4 * amp);
        segment(limbs, limb++, shoulder[side], elbow[side], 1.23); segment(limbs, limb++, elbow[side], wrist[side], .9);
        for (const [point, radius] of [[hip[side],1.65],[knee[side],1.45],[foot[side],1.05],[shoulder[side],1.6],[elbow[side],1.1],[wrist[side],.95]]) pose(joints, joint++, point.x, point.y, point.z, radius, radius * 1.08, radius);
        pose(feet, side, foot[side].x, foot[side].y, foot[side].z + .7, 1.4, .8, 2.3);
      }
      for (const mesh of [limbs, joints, feet]) mesh.instanceMatrix.needsUpdate = true;
      const beamPower = ease((t - 14.5) / .7) * (1 - ease((t - 18.4) / .6));
      visor.material.opacity = ease((t - 13) / 1.5) * (1 - gone) * (.5 + beamPower * .5);
      beam.visible = beamPower > .001; scorch.visible = beam.visible;
      const sweep = ease((t - 14.5) / 4.5);
      segmentEnd.set(-26 + sweep * 47, .3, 29 + Math.sin(sweep * Math.PI) * 9);
      hostLight(beamLight, gort, segmentEnd.x, segmentEnd.y + 2, segmentEnd.z);
      segmentStart.set(0, 26.4, 1.55);
      delta.subVectors(segmentEnd, segmentStart); const length = delta.length();
      beam.position.copy(segmentStart).addScaledVector(delta, .5); beam.quaternion.setFromUnitVectors(up, delta.normalize()); beam.scale.set(.075, length, .075);
      beam.material.opacity = beamPower * .5;
      scorch.position.copy(segmentEnd); scorch.scale.setScalar(.8 + beamPower * .5); scorch.material.opacity = beamPower * .38;
      beamLight.intensity = detail === 0 ? 0 : beamPower * 100;
      nanites.count = [900, 1600, 2400][detail]; nanites.visible = t > 18.6;
      const release = ease((t - 18.6) / 2.3), travel = clamp((t - 19) / 11);
      for (let i = 0; i < nanites.count; i++) {
        const s = seeds[i], end = paths[s.lane], p = ease(travel * (.24 + .76 * s.u));
        const radius = (1 + s.v * 4) * (1 + p * 1.1), angle = s.angle + t * (1.2 + s.w * 1.8);
        const x = stand.x + (end.x - stand.x) * p + Math.sin(p * Math.PI) * (s.lane === 0 ? 20 : -15);
        const z = stand.z + (end.z - stand.z) * p;
        const y = (1 - p) * (1 + s.u * 44) * (1 - release * .7) + p * end.y + Math.sin(p * Math.PI) * (s.lane === 0 ? 8 : 15);
        const size = (.26 + s.w * .5) * release * (.7 + .3 * Math.sin(s.u * Math.PI));
        pose(nanites, i, x + Math.cos(angle) * radius, Math.max(.3, y + Math.sin(angle) * radius), z + Math.sin(angle * .8) * radius, size, size * .6, size * (1.2 + p * 2.8), angle, s.angle + t, angle * .6);
      }
      nanites.instanceMatrix.needsUpdate = true;
      const front = ease((t - 19) / 11) * 240;
      for (const { tree, scale } of trees) {
        const distance = Math.hypot(tree.position.x - stand.x, tree.position.z - stand.z);
        tree.scale.copy(scale).multiplyScalar(Math.max(.02, 1 - ease((front - distance) / 30) * .98));
      }
    }
    return { group: visitation, update: updateVisitation, particles: [], leave: () => { for (const { tree, scale } of trees) tree.scale.copy(scale); } };
  }
  function createInstrumentality() {
    seed = 19970719;
  // THE END OF EVANGELION: nine white winged units circle the fortress city at dusk, a lance falls and opens
  // the geofront into a cross of light, the A.T. field spreads over the streets and a luminous giant rises.
  const impact = group('The End of Evangelion — Third Impact');
  const origin = new THREE.Vector3(-10, 0, -70);
  // The wider composition needs continuous ground beyond the shared city paving.
  // Reuse its material without changing it; a hole avoids coplanar overlap.
  let pavingMaterial;
  buildings[0]?.parent?.traverse(object => {
    if (object.geometry?.type === 'PlaneGeometry' && object.geometry.parameters.width === 590) pavingMaterial = object.material;
  });
  const groundShape = new THREE.Shape();
  groundShape.moveTo(-1100, -1100); groundShape.lineTo(1100, -1100); groundShape.lineTo(1100, 1100); groundShape.lineTo(-1100, 1100); groundShape.closePath();
  const cityHole = new THREE.Path();
  cityHole.moveTo(-295, -295); cityHole.lineTo(-295, 295); cityHole.lineTo(295, 295); cityHole.lineTo(295, -295); cityHole.closePath();
  groundShape.holes.push(cityHole);
  const continuation = new THREE.Mesh(new THREE.ShapeGeometry(groundShape), pavingMaterial || mat('#647077', { roughness: .75, metalness: .15 }));
  continuation.name = 'Evangelion ground continuation'; continuation.rotation.x = -Math.PI / 2; continuation.position.y = -1.01; continuation.receiveShadow = true; impact.add(continuation);
  // A low moon behind the skyline; its material ignores fog so it stays a hard disc at the horizon.
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 24 * fine, 16 * fine), new THREE.MeshBasicMaterial({ color: '#d9b8ab', fog: false }));
  moon.name = 'Low moon'; moon.position.set(-150, 112, -290); moon.scale.setScalar(20); impact.add(moon);
  const moonHalo = new THREE.Mesh(new THREE.SphereGeometry(1, 24 * fine, 16 * fine), rimGlow('#e8a58c', .12));
  moonHalo.name = 'Moon halo'; moonHalo.position.copy(moon.position); moonHalo.scale.setScalar(23); impact.add(moonHalo);
  // Ivory winged units hold a wide orbit, then yield the image to the rising figure.
  const unitMaterial = mat('#cbd1dd', { roughness: .48, emissive: '#79728b', emissiveIntensity: .12 });
  const units = instances(impact, new THREE.CapsuleGeometry(1, 2.4, 4, 10 * fine), unitMaterial, 9, 'Mass production units');
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-3.8, 0); wingShape.lineTo(-1.4, .48); wingShape.lineTo(2.7, .28);
  wingShape.lineTo(4, -.2); wingShape.lineTo(1.2, -.44); wingShape.lineTo(-2.2, -.23); wingShape.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: .16, bevelEnabled: false });
  wingGeometry.center();
  const wings = instances(impact, wingGeometry, unitMaterial, 18, 'Mass production unit wings');
  units.castShadow = true; wings.castShadow = true;
  const unitSeeds = Array.from({ length: 9 }, () => ({ phase: random() * tau, bob: .7 + random() * .6, flap: 2 + random() * .8 }));
  const lanceMaterial = glow(new THREE.Color(1.9, .22, .18), .8);
  const lance = new THREE.Mesh(cylinder, lanceMaterial); lance.name = 'Lance'; lance.scale.set(.6, 76, .6); lance.visible = false; impact.add(lance);
  const lanceHalo = new THREE.Mesh(cylinder, glow('#ff6a5a', .18)); lanceHalo.name = 'Lance halo'; lanceHalo.scale.set(2.2, 78, 2.2); lanceHalo.visible = false; impact.add(lanceHalo);
  // The A.T. field is the anthology's 4K asset: a seamless hexagon mask multiplied into additive orange.
  const fieldColor = new THREE.Color(1.1, .32, .16);
  const fieldMaterial = new THREE.MeshBasicMaterial({ color: fieldColor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const barrierMaterial = fieldMaterial.clone();
  const field = new THREE.Mesh(new THREE.CircleGeometry(.5, 64 * fine), fieldMaterial); field.name = 'A.T. field';
  // The field hangs above the rooftops so the lattice reads from the orbit camera instead of hiding between towers.
  field.rotation.x = -Math.PI / 2; field.position.set(origin.x, 62, origin.z); field.renderOrder = 3; field.visible = false; impact.add(field);
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
  const crossMaterial = glow(new THREE.Color(1.5, .64, .32), .72);
  const crosses = instances(impact, box, crossMaterial, 12, 'Crosses of light');
  // x, z, eruption second, height, width, yaw.
  const crossSeeds = [[origin.x, origin.z, 12, 142, 2.4, .4], [78, -62, 13.4, 92, 1.5, .2], [-77, -92, 14.9, 81, 1.3, -.4],
    [48, -160, 16.3, 74, 1.15, .9], [-55, -182, 17.6, 102, 1.5, -.15], [112, -140, 18.7, 66, 1.1, .6]];
  const crossLight = new THREE.PointLight('#ffd0a8', 0, 320, 1.5); crossLight.position.set(origin.x, 80, origin.z); impact.add(crossLight);
  const lclMaterial = new THREE.MeshBasicMaterial({ color: '#ff6a35', transparent: true, opacity: 0, depthWrite: false });
  const lcl = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), lclMaterial); lcl.name = 'Sea of LCL';
  lcl.rotation.x = -Math.PI / 2; lcl.position.y = -.8; lcl.renderOrder = -1; lcl.visible = false; impact.add(lcl);
  const ringMaterial = glow('#ffc6a1', 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 8, 100 * fine), ringMaterial); ring.name = 'Anti-A.T. field pulse';
  ring.rotation.x = Math.PI / 2; ring.position.set(origin.x, 3, origin.z); ring.visible = false; impact.add(ring);
  // The giant: a faceless luminous figure that rises out of the geofront and opens its arms.
  const giant = new THREE.Group(); giant.name = 'Luminous giant'; giant.visible = false; giant.position.copy(origin); impact.add(giant);
  const bodyMaterial = mat('#bec9da', { roughness: .58, metalness: .05, emissive: '#686c9c', emissiveIntensity: .2 });
  const smoothBody = new THREE.SphereGeometry(1, 24 * fine, 16 * fine);
  giant.scale.setScalar(.86);
  const limb = (geometry, x, y, z, sx, sy, sz, name, parent = giant) => {
    const mesh = new THREE.Mesh(geometry, bodyMaterial); mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const legGeometry = new THREE.CapsuleGeometry(1, 3, 6, 12 * fine), armGeometry = new THREE.CapsuleGeometry(1, 3.2, 6, 12 * fine);
  limb(legGeometry, -10, 49, 0, 7.5, 19, 7.5, 'Giant left leg'); limb(legGeometry, 10, 49, 0, 7.5, 19, 7.5, 'Giant right leg');
  limb(smoothBody, 0, 102, 0, 20, 15, 12, 'Giant pelvis');
  const torsoProfile = [[0,0],[15,2],[18,10],[13.5,28],[15,44],[22,64],[25,70],[23,77],[10,84],[7,88],[0,89]].map(([r,y])=>new THREE.Vector2(r,y));
  limb(new THREE.LatheGeometry(torsoProfile, 28 * fine), 0, 106, 0, 1, 1, .63, 'Giant torso');
  limb(smoothBody, -23, 181, 0, 8, 8, 7, 'Giant left shoulder'); limb(smoothBody, 23, 181, 0, 8, 8, 7, 'Giant right shoulder');
  const arms = [-1, 1].map(sign => {
    const pivot = new THREE.Group(); pivot.name = sign < 0 ? 'Left embrace' : 'Right embrace';
    pivot.position.set(sign * 25, 181, 0); giant.add(pivot);
    limb(armGeometry, 0, -23, 0, 6.2, 8.3, 6.2, sign < 0 ? 'Giant left upper arm' : 'Giant right upper arm', pivot);
    limb(armGeometry, 0, -61, 1, 4.8, 7.6, 4.8, sign < 0 ? 'Giant left forearm' : 'Giant right forearm', pivot);
    limb(smoothBody, 0, -83, 1, 5.3, 9, 3.5, sign < 0 ? 'Giant left hand' : 'Giant right hand', pivot);
    return [pivot, sign];
  });
  limb(cylinder, 0, 197, 0, 6, 12, 6, 'Giant neck');
  limb(smoothBody, 0, 216, 0, 11.5, 16, 10.5, 'Giant head');
  const eyeMaterial = glow('#b65466', .52);
  for (const sign of [-1, 1]) {
    const eye = new THREE.Mesh(smoothBody, eyeMaterial); eye.name = sign < 0 ? 'Giant left eye' : 'Giant right eye';
    eye.position.set(sign * 4.2, 217, 9.8); eye.scale.set(2.3, .5, .6); giant.add(eye);
  }
  const headHalo = new THREE.Mesh(smoothBody, rimGlow('#b9d4ff', .24)); headHalo.name = 'Giant head halo'; headHalo.position.set(0, 216, 0); headHalo.scale.set(12.5, 17, 11.5); giant.add(headHalo);
  const haloMaterial = glow(new THREE.Color(.7, .88, 1.2), 0);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1, .05, 8, 96 * fine), haloMaterial); halo.name = 'Halo';
  halo.position.set(0, 243, 0); halo.rotation.x = Math.PI / 2 - .3; halo.scale.setScalar(30); giant.add(halo);
  const giantLight = new THREE.PointLight('#ffb890', 0, 420, 1.4); impact.add(giantLight);
  const ascension = particles(impact, 'ascension', 2400, '#ffa485', 1.6);

  function updateInstrumentality(t, detail) {
    const settle = ease((t - 8) / 2), ascend = ease((t - 24) / 6), vanish = ease((t - 27) / 3);
    // The circling angle eases into a hold between 8 and 10 with a continuous rate.
    const u = clamp((t - 8) / 2), sweep = .3 * (t < 8 ? t : 8 + 2 * u - u * u);
    units.count = detail === 0 ? 6 : 9; wings.count = units.count * 2;
    for (let i = 0; i < units.count; i++) {
      const s = unitSeeds[i], theta = i / units.count * tau + sweep;
      const x = origin.x + Math.cos(theta) * 104, z = origin.z + Math.sin(theta) * 72;
      const y = 116 - ease(t / 10) * 14 + Math.sin(t * s.bob + s.phase) * 1.5 + ascend * ascend * 105;
      const yaw = -theta + settle * Math.PI / 2, size = 2.25 * (1 - vanish * .999);
      const flap = (.35 - settle * .12) + Math.sin(t * s.flap + s.phase) * (.42 - settle * .3);
      pose(units, i, x, y, z, size, size, size, 0, yaw, 0);
      for (const [k, sign] of [[0, -1], [1, 1]]) {
        // Each wing slab hinges at the shoulder and extends along its own x axis before the yaw is applied.
        const reach = size * 3.7, dx = sign * (size * .87 + Math.cos(flap) * reach), dy = size * .73 + Math.sin(flap) * reach;
        pose(wings, i * 2 + k, x + dx * Math.cos(yaw), y + dy, z - dx * Math.sin(yaw), size * .9, size * 1.9, size * 1.5, 0, yaw, sign * flap);
      }
    }
    units.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
    const fall = ease((t - 10) / 2);
    lance.visible = t > 9.6 && t < 19.6; lanceHalo.visible = lance.visible;
    lance.position.set(origin.x, 240 - fall * 188, origin.z); lanceHalo.position.copy(lance.position);
    lance.rotation.set(-.04, t * 2, .06); lanceHalo.rotation.copy(lance.rotation);
    lanceMaterial.opacity = .95 * ease((t - 9.6) / .4) * (1 - ease((t - 17) / 2.5)); lanceHalo.material.opacity = lanceMaterial.opacity * .2;
    const flare = Math.sin(clamp((t - 10.8) / 1.6) * Math.PI);
    barrier.visible = flare > .01; barrier.scale.set(118 * (1 + flare * .12), 88 * (1 + flare * .12), 1); barrierMaterial.opacity = flare * .32;
    const crossCount = detail === 0 ? 3 : 6; crosses.count = crossCount * 2; crosses.visible = t > 12;
    for (let i = 0; i < crossCount; i++) {
      const [x, z, erupt, height, width, spin] = crossSeeds[i];
      const grow = ease((t - erupt) / 1.4), linger = (1 - ease((t - 18.5) / 5)) * (i === 0 ? 1 : .62), h = height * grow;
      pose(crosses, i * 2, x, h / 2 - 1, z, width, Math.max(.001, h), width, 0, spin, 0);
      pose(crosses, i * 2 + 1, x, h * (i === 0 ? .8 : .7), z, width * (i === 0 ? 21 : 14) * grow + .001, width * (i === 0 ? 1.3 : 1.05), width * 1.05, 0, spin, 0);
      color.setScalar(linger); crosses.setColorAt(i * 2, color); crosses.setColorAt(i * 2 + 1, color);
    }
    crosses.instanceMatrix.needsUpdate = true; crosses.instanceColor.needsUpdate = true;
    crossLight.intensity = 700 * ease((t - 12) / .5) * (1 - ease((t - 16) / 6)) * (detail === 0 ? .6 : 1);
    const spread = ease((t - 12) / 5), fieldSize = 40 + spread * 320;
    field.visible = t > 12; field.scale.set(fieldSize, fieldSize, 1);
    fieldMaterial.opacity = (fieldTexture ? .12 : .035) * ease((t - 12) / 1.2) * (1 - ease((t - 16) / 8)) * (.95 + .05 * Math.sin(t * 2));
    if (fieldTexture) {
      // Hexagons keep a fixed 24-unit pitch while the plane grows; the offset pins the lattice to the centre.
      const rx = fieldSize / 216, ry = rx * 1.0393;
      fieldTexture.repeat.set(rx, ry); fieldTexture.offset.set(.5 - rx / 2, .5 - ry / 2);
    }
    lclMaterial.opacity = ease((t - 24) / 5) * .38; lcl.visible = lclMaterial.opacity > 0;
    const pulse = ease((t - 24) / 5);
    ring.visible = t > 24 && pulse < 1; ring.scale.set(1 + pulse * 420, 1 + pulse * 420, 1 + pulse * 6); ringMaterial.opacity = (1 - pulse) * .48;
    const rise = ease((t - 19) / 7), embrace = ease((t - 24) / 6);
    giant.visible = t > 19;
    giant.position.set(origin.x + 27, -210 + rise * 210 + embrace * 4, origin.z - 30); giant.rotation.set(0, .35, Math.sin(t * .3) * .008);
    hostLight(giantLight, giant, 0, 150, 34);
    for (const [pivot, sign] of arms) pivot.rotation.z = sign * (.14 + embrace * 1.3);
    bodyMaterial.emissiveIntensity = .2 + embrace * .12 + Math.sin(t * 1.4) * .012;
    haloMaterial.opacity = ease((t - 22) / 3) * .45; halo.rotation.z = t * .1; halo.scale.setScalar(30 * (1 + embrace * .35));
    headHalo.material.uniforms.strength.value = .24 + embrace * .18;
    giantLight.intensity = (rise * 240 + embrace * 180) * (detail === 0 ? .6 : 1);
  }
    return { group: impact, update: updateInstrumentality, particles: ascension };
  }
  function createTsunami() {
    seed = 19981998;
  // Broad coastal staging, a short spreading ocean strike, and a folding wave with wind-torn foam.
  // The simulation owns the water and comet; production uses this same absolute-time crest profile.
  const surge = group('Deep Impact — ocean strike');
  // A continuous headland joins the city footprint to the foreground and reaches past both frame edges.
  const coastOutline = new THREE.Shape();
  coastOutline.moveTo(-950, 900); coastOutline.lineTo(950, 900);
  for (let i = 0; i <= 38; i++) {
    const x = 950 - i * 50, shore = -102 + Math.sin(x * .012 + .7) * 8 + Math.sin(x * .027) * 2;
    coastOutline.lineTo(x, shore);
  }
  coastOutline.closePath();
  const coastGeometry = new THREE.ShapeGeometry(coastOutline);
  const coastPosition = coastGeometry.attributes.position, coastUV = coastGeometry.attributes.uv;
  // Match the existing ground box's top-face UVs, including its asphalt maps and repeat scale.
  for (let i = 0; i < coastPosition.count; i++) {
    const x = coastPosition.getX(i), z = coastPosition.getY(i);
    coastPosition.setXYZ(i, x, -1.035, z); coastUV.setXY(i, x / 170 + .5, .5 - z / 155);
  }
  // ShapeGeometry faces +Z before remapping to XZ, so reverse its winding to face the sky.
  const coastIndex = coastGeometry.index;
  for (let i = 0; i < coastIndex.count; i += 3) {
    const a = coastIndex.getX(i); coastIndex.setX(i, coastIndex.getX(i + 2)); coastIndex.setX(i + 2, a);
  }
  coastGeometry.computeVertexNormals();
  const coast = new THREE.Mesh(coastGeometry, ground?.material || mat('#647077', { roughness: .75, metalness: .15 }));
  coast.name = 'Continuous Atlantic coastline'; coast.receiveShadow = true; surge.add(coast);
  const shoreVertices = [], shoreIndices = [];
  for (let i = 0; i <= 76; i++) {
    const x = -950 + i * 25, z = -102 + Math.sin(x * .012 + .7) * 8 + Math.sin(x * .027) * 2;
    shoreVertices.push(x, -1.025, z + .2, x, -1.025, z + 2.2);
    if (i < 76) { const k = i * 2; shoreIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const shoreGeometry = new THREE.BufferGeometry();
  shoreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shoreVertices, 3)); shoreGeometry.setIndex(shoreIndices); shoreGeometry.computeVertexNormals();
  const shore = new THREE.Mesh(shoreGeometry, mat('#405057', { roughness: .4, metalness: .12, side: THREE.DoubleSide }));
  shore.name = 'Wet Atlantic shoreline'; surge.add(shore);
  const waveProfile = (v, height, x, t) => {
    const fold = ease((t - 17) / 9);
    const ridge = 1 + Math.sin(x * .026 + .7) * .075 + Math.sin(x * .071 - t * .35) * .028;
    return { y: Math.sin(v * Math.PI * .68) * height * ridge - Math.pow(v, 10) * fold * 7 + Math.sin(x * .13 + t) * .65 * v,
      z: Math.sin(v * Math.PI) * 18 + Math.pow(v, 5) * (16 + fold * 28) };
  };
  const froth = instances(surge, rock, mat('#b9d7d7', { roughness: .88 }), 42, 'Broken crest foam');
  const droplets = instances(surge, rock, mat('#c6e4e4', { roughness: .6 }), 240, 'Wind-torn crest droplets');
  const foamSeeds = Array.from({ length: 42 }, () => [random(), random(), random(), random()]);
  const spraySeeds = Array.from({ length: 240 }, () => [random(), random(), random(), random()]);
  const vaporSeeds = Array.from({ length: 48 }, (_, i) => [i * 2.399963, random(), random(), random()]);
  const mistSeeds = Array.from({ length: 64 }, () => [random(), random(), random(), random()]);
  const fallbackVapor = instances(surge, new THREE.IcosahedronGeometry(1, 1), mat('#aabdc0', { transparent: true, opacity: 0, depthWrite: false, roughness: 1 }), 18, 'Impact vapor fallback');
  let atlasReady = false;
  const billboardAxis = new THREE.Vector3(0, 0, 1);
  const mistMaterials = [], billboards = [], facing = new THREE.Quaternion(), spin = new THREE.Quaternion();
  const billboardPosition = new THREE.Vector3(), billboardScale = new THREE.Vector3(), billboardRotation = new THREE.Quaternion(), billboardMatrix = new THREE.Matrix4();
  function mistBatch(name, count, tint) {
    const batches = [];
    for (let cell = 0; cell < 4; cell++) {
      const geometry = new THREE.PlaneGeometry(2, 2), uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (cell + .004 + uv.getX(i) * .992) / 4, (.004 + uv.getY(i) * .992) / 4 + .75);
      const material = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, depthWrite: false, alphaTest: .002 });
      const mesh = instances(surge, geometry, material, count / 4, name + ' ' + cell);
      mesh.userData.rolls = []; mesh.renderOrder = 2;
      batches.push(mesh); billboards.push(mesh); mistMaterials.push(material);
    }
    return batches;
  }
  const vapor = mistBatch('Soft impact vapor', 48, '#b9cdd1');
  const mist = mistBatch('Windblown crest mist', 64, '#c5e0df');
  // Reuse the existing grayscale smoke atlas as alpha, with ordinary materials on every renderer.
  canvas.dataset.impactMist = 'loading';
  new THREE.TextureLoader().loadAsync('/assets/particle-atlas.webp').then(texture => {
    texture.colorSpace = THREE.NoColorSpace;
    for (const material of mistMaterials) { material.alphaMap = texture; material.needsUpdate = true; }
    atlasReady = true; canvas.dataset.impactMist = 'ready';
    // This existing wake event reruns world state, so a paused shot immediately exchanges fallback for soft vapor.
    canvas.dispatchEvent?.(new Event('explosion-ready'));
  }).catch(() => {
    canvas.dataset.impactMist = 'fallback'; canvas.dispatchEvent?.(new Event('explosion-ready'));
  });
  function billboard(mesh, index, x, y, z, sx, sy, roll) {
    pose(mesh, index, x, y, z, sx, sy, 1); mesh.userData.rolls[index] = roll;
  }
  const trailAxis = new THREE.Vector3(135, 145, -45).normalize(), comet = new THREE.Vector3();
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

  function updateTsunami(t, detail, config) {
    const travel = ease((t - 14) / 16), height = (22 + travel * 60) * (1 - .38 * ease((t - 25) / 5)), front = -115 + travel * 230;
    const reveal = ease((t - 14) / 1.3), breakup = ease((t - 23) / 7), age = Math.max(0, t - 13);
    comet.set(85 - t * 135 / 13, 144 - t * 145 / 13, -145 + t * 45 / 13);
    trail.visible = detail === 2 && t < 13;
    trail.position.copy(comet).addScaledVector(trailAxis, 45); trail.quaternion.setFromUnitVectors(up, trailAxis); trail.scale.set(9, 90, 9);
    trail.material.uniforms.origin.value.copy(comet);
    volumeFrame(trail, t, canvas.dataset.quality === 'ultra' ? 32 : 24, config?.environment || {}, defaults);
    froth.visible = droplets.visible = t > 14;
    froth.count = [18, 28, 42][detail]; droplets.count = [60, 130, 240][detail];
    for (let i = 0; i < froth.count; i++) {
      const [a, b, c, d] = foamSeeds[i], x = ((i + a) / froth.count - .5) * 363;
      const phase = (t * (.22 + b * .18) + c) % 1, age = phase * (1.1 + d * 1.1);
      const crest = waveProfile(.96 + b * .04, height, x, t), envelope = Math.sin(Math.PI * phase) * reveal;
      pose(froth, i, x + age * (1 + d * 3), -1.2 + crest.y + age * (2 + c * 3) - age * age * (2 + breakup * 2),
        front + crest.z + age * (2 + a * 4), (.35 + a * .8) * envelope, (.12 + b * .22) * envelope, (.3 + c * .45) * envelope, age * .4, d, c * .3);
    }
    for (let i = 0; i < droplets.count; i++) {
      const [a, b, c, d] = spraySeeds[i], x = (a - .5) * 360;
      const phase = (t * (.3 + b * .24) + c) % 1, age = phase * (1.4 + d * 1.4);
      const crest = waveProfile(1, height, x, t), envelope = Math.sin(Math.PI * phase) * reveal, radius = (.1 + b * .23) * envelope;
      pose(droplets, i, x + age * (2 + d * 5), -1.2 + crest.y + age * (4 + c * 6) - age * age * 2.2,
        front + crest.z - age * (1 + b * 3), radius, radius * (1.5 + d * 2), radius, age, c * 4, age * .4);
    }
    const vaporCount = [24, 36, 48][detail], mistCount = [24, 40, 64][detail];
    const lift = ease(age / 2.2), spread = ease(age / 4), fade = ease(age / .35) * (1 - ease((t - 17) / 4));
    for (const mesh of vapor) { mesh.count = vaporCount / 4; mesh.visible = atlasReady && t > 13 && t < 21; mesh.material.opacity = fade * .32; }
    for (const mesh of mist) { mesh.count = mistCount / 4; mesh.visible = atlasReady && t > 14; mesh.material.opacity = reveal * .22; }
    for (let i = 0; i < vaporCount; i++) {
      const [a, b, c, d] = vaporSeeds[i], radius = (5 + Math.sqrt(b) * 32) * spread, size = (5 + c * 8) * (.35 + lift * .65) * (1 + age * .04);
      billboard(vapor[i % 4], Math.floor(i / 4), -50 + Math.cos(a) * radius + age * .6, 3 + (12 + c * 42) * lift + Math.max(0, age - 3) * 1.2,
        -100 + Math.sin(a) * radius - age * .4, size * (1 + d * .25), size, d * tau + age * (b - .5) * .08);
    }
    for (let i = 0; i < mistCount; i++) {
      const [a, b, c, d] = mistSeeds[i], x = ((i + a) / mistCount - .5) * 360, phase = (t * (.22 + b * .16) + c) % 1, drift = phase * (1.5 + d * 1.6);
      const lip = waveProfile(1, height, x, t), size = (1.8 + c * 2.3) * Math.sin(phase * Math.PI) * reveal;
      billboard(mist[i % 4], Math.floor(i / 4), x + drift * (2 + c * 3), -1.2 + lip.y + drift * (2 + d * 2) - drift * drift * .7,
        front + lip.z - drift * 3, size * (1.1 + b * .4), size, d * tau + t * (b - .5) * .1);
    }
    fallbackVapor.visible = !atlasReady && t > 13 && t < 21; fallbackVapor.material.opacity = fade * .16;
    for (let i = 0; i < fallbackVapor.count; i++) {
      const [a, b, c] = vaporSeeds[i], radius = (5 + Math.sqrt(b) * 32) * spread, size = (5 + c * 8) * lift;
      pose(fallbackVapor, i, -50 + Math.cos(a) * radius, 3 + (12 + c * 42) * lift, -100 + Math.sin(a) * radius, size, size, size);
    }
    for (const mesh of [froth, droplets, fallbackVapor, ...billboards]) mesh.instanceMatrix.needsUpdate = true;
    updateTsunamiView(camera);
  }
  function updateTsunamiView(viewCamera) {
    if (!viewCamera) return;
    viewCamera.getWorldQuaternion(facing);
    for (const mesh of billboards) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, billboardMatrix); billboardMatrix.decompose(billboardPosition, billboardRotation, billboardScale);
        spin.setFromAxisAngle(billboardAxis, mesh.userData.rolls[i] || 0);
        billboardRotation.copy(facing).multiply(spin); billboardMatrix.compose(billboardPosition, billboardRotation, billboardScale); mesh.setMatrixAt(i, billboardMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    delta.copy(viewCamera.position).sub(trail.position); const along = delta.dot(trailAxis);
    setInside(trail, Math.abs(along) < 45 && delta.addScaledVector(trailAxis, -along).length() < 9);
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
