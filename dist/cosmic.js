import * as THREE from 'three/webgpu';
import { createShaderMaterial, recordSurface } from './shader-program.js';
import { applyParticleAtlas, applyParticlePoints } from './particle-atlas.js';
import { armageddonFragments, armageddonSeam } from './armageddon-geometry.js';
import { marchedVolume, setInside, volumeUniforms as sharedVolumeUniforms, markEffects, markEffect } from './render-kit.js';

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
  const volumeUniforms = extra => sharedVolumeUniforms(extra, canvas);
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
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 48 * fine, 32 * fine), createShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(color) }, strength: { value: opacity } }, vertexShader: vertex,
      fragmentShader: `uniform vec3 tint;uniform float strength;varying vec3 viewNormal;varying vec3 viewDirection;
      void main(){float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewDirection))),3.);gl_FragColor=vec4(tint,rim*strength);${output}}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
  }

  // A planet that fills the frame needs finer silhouette tessellation than a distant one; the light
  // direction defaults to the shared key light and can follow a star that is actually in the scene.
  function earth(radius, position, detail = 1, light = new THREE.Vector3(-.65, .5, .8)) {
    const group = new THREE.Group(); group.position.copy(position);
    const lightDirection = { value: light.clone().normalize() };
    const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, Math.round(64 * fine * detail), Math.round(40 * fine * detail)), createShaderMaterial({
      uniforms: { time, heat: { value: 0 }, frost: { value: 0 }, light: lightDirection }, vertexShader: vertex,
      fragmentShader: `uniform float time,heat,frost;uniform vec3 light;varying vec3 point;varying vec3 worldNormal;${noise}
      void main(){vec3 p=normalize(point);float land=fbm(p*4.7+vec3(.4,2.8,.2));
      float cloud=fbm(p*16.+vec3(time*.018,0.,0.));float terrain=fbm(p*38.);
      vec3 ocean=vec3(.012,.105,.24);vec3 continents=mix(vec3(.035,.13,.067),vec3(.24,.23,.12),terrain);
      vec3 color=mix(ocean,continents,smoothstep(.50,.56,land));
      color=mix(color,mix(vec3(.5,.62,.78),vec3(.9,.93,.96),terrain)*(.8+.2*smoothstep(.5,.56,land)),frost);
      color=mix(color,vec3(.82,.90,.94),smoothstep(.58,.74,cloud)*.55);
      color=mix(color,vec3(.76,.85,.89),smoothstep(.87,.97,abs(p.y))*.88);
      float daylight=dot(normalize(worldNormal),light);
      float lit=.035+max(daylight,0.);float night=1.-smoothstep(-.25,.07,daylight);
      float cities=pow(noise(p*175.),14.)*smoothstep(.51,.58,land)*night;
      color=color*lit+vec3(.95,.45,.15)*cities*.7+vec3(1.6,.19,.016)*heat*(.35+.65*noise(p*22.));
      gl_FragColor=vec4(color,1.);${output}}`
    }));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.014, 48 * fine, 32 * fine), createShaderMaterial({
      uniforms: { time, light: lightDirection }, vertexShader: vertex,
      fragmentShader: `uniform float time;uniform vec3 light;varying vec3 point;varying vec3 worldNormal;${noise}
      void main(){vec3 p=normalize(point);float broad=fbm(p*6.+vec3(time*.002,0.,0.));
      float wisps=fbm(p*18.+broad*2.);float cloud=smoothstep(.49,.73,wisps);
      float lit=.09+max(dot(normalize(worldNormal),light),0.);
      gl_FragColor=vec4(vec3(.81,.87,.9)*lit,cloud*.65);${output}}`,
      transparent: true, depthWrite: false
    }));
    clouds.name = 'Independent planetary cloud deck'; clouds.userData.fineDetail = true;
    const air = atmosphere(radius * 1.035, '#49a9ff', .42); group.add(surface, clouds, air);
    return { group, surface, clouds, air };
  }

  // Every particle position is a closed-form function of time and its seed; nothing integrates between frames.
  const motion = {
    // The ejection streams from the flare site (origin) along the Earth-facing axis (target) in a
    // widening, twisting cone; particles cool from white to red as they travel.
    flare: `float d=fract(seed.y+time*.09);float reach=pow(d,.85)*98.;float spread=pow(d,.7)*(1.5+seed.z*6.);
      vec3 u=normalize(cross(target,vec3(0.,1.,0.)));vec3 v=cross(target,u);float swirl=a+d*7.+time*.6;
      p=origin+target*reach+(u*cos(swirl)+v*sin(swirl))*spread;
      float travel=pow(clamp((time-7.)/16.,0.,1.),1.8)*72.;float arrived=1.-smoothstep(travel-5.,travel,reach);
      warmth=d;opacity=smoothstep(.01,.12,d)*(1.-smoothstep(.72,1.,d))*phase*arrived*(.3+.4*seed.w)*(1.-smoothstep(24.,30.,time));`,
    // Flare ejecta: a one-shot burst thrown outward from the eruption site at five seconds.
    ejecta: `float age=max(0.,time-5.-seed.w*.6);float speed=14.+seed.z*34.;
      vec3 dir=normalize(vec3(seed.x-.5,seed.y-.5,seed.z-.5)+target*.9);
      p=origin+dir*age*speed*(1.-age*.03);warmth=seed.y*.5;
      opacity=step(.001,age)*(1.-smoothstep(1.,4.5,age))*.9;`,
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
    const material = createShaderMaterial({
      uniforms: { time, phase, tint: { value: new THREE.Color(tint).multiplyScalar(2) }, pixelRatio: { value: 1 },
        origin: { value: new THREE.Vector3() }, target: { value: new THREE.Vector3() } },
      vertexShader: `attribute vec4 seed;uniform float time,phase,pixelRatio;uniform vec3 origin,target;varying float opacity;varying float warmth;
      void main(){float a=seed.x*6.283185;vec3 p;warmth=seed.z;
      ${motion[kind]}
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.5+seed.w*3.)*pixelRatio*230./max(1.,-mv.z),1.,12.);}`,
      fragmentShader: `uniform vec3 tint;varying float opacity;varying float warmth;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(mix(tint,tint*vec3(1.2,.55,.25),warmth),pow(1.-r,2.)*opacity);${output}}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    applyParticleAtlas(material, { canvas, kind, motion: motion[kind], color: 'mix(tint,tint*vec3(1.2,.55,.25),warmth)', output });
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
  applyParticlePoints(stars, canvas, 'stars');
  stars.visible = false; markEffect(stars); scene.add(stars);

    return stars;
  }
  function createSolar() {
    seed = 77494;
  // KNOWING: an active region swells on the Earth-facing limb, erupts in a flare flash and a coronal
  // mass ejection, and the plasma front engulfs Earth.
  const solar = group('knowing-solar-flare');
  const sunCenter = new THREE.Vector3(-35, 54, -8), earthCenter = new THREE.Vector3(58, 23, 18);
  const axis = new THREE.Vector3().subVectors(earthCenter, sunCenter).normalize();
  const site = sunCenter.clone().addScaledVector(axis, 31.4);
  const activity = { value: 0 }, flash = { value: 0 }, front = { value: 0 };
  const sun = new THREE.Group(); sun.position.copy(sunCenter); solar.add(sun);
  const sunSurface = new THREE.Mesh(new THREE.SphereGeometry(31, 80 * fine, 56 * fine), createShaderMaterial({
    uniforms: { time, phase, activity, radiance: { value: 1 }, site: { value: axis } }, vertexShader: vertex,
    fragmentShader: `uniform float time,phase,activity,radiance;uniform vec3 site;varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;${noise}
    void main(){vec3 p=normalize(point);float grain=fbm(p*39.+vec3(0.,time*.12,0.));float churn=fbm(p*17.-vec3(time*.05,0.,time*.03));
    float cells=noise(p*83.+grain*2.);float spots=smoothstep(.63,.76,fbm(p*8.));
    float limb=.3+.7*pow(abs(dot(normalize(viewNormal),normalize(viewDirection))),.35);
    vec3 color=mix(vec3(.34,.025,.003),vec3(1.2,.36,.045),smoothstep(.22,.74,grain*.75+churn*.25));
    float region=pow(max(dot(p,site),0.),14.);float faculae=smoothstep(.42,.72,fbm(p*15.+vec3(time*.25)))*region;
    color*=mix(.6,1.3,cells)*(1.-spots*.75)*limb;
    color+=vec3(2.2,1.2,.35)*activity*(region*.32+faculae*.65)+vec3(.8,.45,.18)*phase*.3;
    gl_FragColor=vec4(color*radiance,1.);${output}}`
  }));
  sun.add(sunSurface, atmosphere(32.8, '#ff9a24', .42), atmosphere(36.5, '#e84b0c', .1));
  // The corona is a camera-facing plane through the sun's centre; the photosphere occludes its inner disk.
  const spriteVertex = 'varying vec2 spriteUv;void main(){spriteUv=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createShaderMaterial({
    uniforms: { time, phase, activity }, vertexShader: spriteVertex,
    fragmentShader: `uniform float time,phase,activity;varying vec2 spriteUv;${noise}
    void main(){float r=length(spriteUv);float ang=atan(spriteUv.y,spriteUv.x);vec2 d=vec2(cos(ang),sin(ang));
    float broad=fbm(vec3(d*3.5,time*.05));float fine=fbm(vec3(d*11.,r*4.-time*.09));
    float disk=.36;float reach=disk+.04+broad*.15+fine*.06+phase*.03;
    float glow=exp(-(r-disk)*12.)*.18;float streamers=(1.-smoothstep(reach-.18,reach,r))*smoothstep(.42,.88,fine)*.2;
    float outside=smoothstep(disk-.02,disk+.03,r);
    vec3 color=mix(vec3(1.1,.36,.07),vec3(1.9,1.1,.45),fine)*(1.+activity*.35+phase*.6);
    gl_FragColor=vec4(color,(glow+streamers)*outside*(1.-smoothstep(.85,1.,r)));${output}}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  corona.name = 'Solar corona'; corona.position.copy(sunCenter); corona.scale.set(172, 172, 1); solar.add(corona);
  const flareFlash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createShaderMaterial({
    uniforms: { flash }, vertexShader: spriteVertex,
    fragmentShader: `uniform float flash;varying vec2 spriteUv;void main(){float r=length(spriteUv);float ang=atan(spriteUv.y,spriteUv.x);
    float core=pow(max(0.,1.-r*1.6),2.5);float halo=exp(-r*3.2)*.7;
    float rays=(pow(abs(sin(ang*5.+.7)),28.)*.3+pow(abs(sin(ang*13.-.4)),60.)*.18)*(1.-smoothstep(.15,1.,r));
    gl_FragColor=vec4(vec3(3.6,2.4,1.3)*(core*1.4+halo+rays)*flash,flash*min(1.,core*2.+halo+rays));${output}}`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
  }));
  flareFlash.name = 'Flare flash'; flareFlash.position.copy(site).addScaledVector(axis, 2); flareFlash.scale.setScalar(45); flareFlash.renderOrder = 5; solar.add(flareFlash);
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
  // The eruptive prominence: an arch rooted at the active region that lifts off during the flare.
  const prominence = new THREE.Group(); prominence.position.copy(site); prominence.quaternion.setFromUnitVectors(up, axis); solar.add(prominence);
  const archPoints = [];
  for (let j = 0; j <= 40; j++) { const a = j / 40 * Math.PI; archPoints.push(new THREE.Vector3(Math.cos(a) * 7, Math.sin(a) * 9, Math.sin(a * 2) * 1.5)); }
  const archMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a').multiplyScalar(1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPoints), 48, .55, 6, false), archMaterial); arch.name = 'Eruptive prominence'; prominence.add(arch);
  // The coronal mass ejection: a turbulent bubble whose front reaches Earth around twenty seconds.
  // These shells render only below HIGH; retained ULTRA geometry must still fit a phone resize.
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 36), createShaderMaterial({
    uniforms: { time, front }, vertexShader: vertex,
    fragmentShader: `uniform float time,front;varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;${noise}
    void main(){vec3 p=normalize(point);float turbulence=fbm(p*3.5+vec3(time*.09,-time*.05,0.))*.6+fbm(p*9.-vec3(0.,time*.2,0.))*.4;
    float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewDirection))),1.6);
    vec3 color=mix(vec3(.8,.15,.025),vec3(1.4,.6,.16),turbulence);
    gl_FragColor=vec4(color,(rim*.32+turbulence*.08)*front);${output}}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  bubble.name = 'Coronal mass ejection'; bubble.visible = false; bubble.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axis); solar.add(bubble);
  const light = new THREE.Vector3().subVectors(sunCenter, earthCenter).normalize().multiplyScalar(.55).add(new THREE.Vector3(-.65, .5, .8).multiplyScalar(.45));
  const solarEarth = earth(9, earthCenter, 1, light); solar.add(solarEarth.group);
  const stream = particles(solar, 6500, 'flare', '#ffac44'); stream.userData.volumetricShare = .2;
  const ejecta = particles(solar, 1200, 'ejecta', '#ffd9a0');
  for (const cloud of [stream, ejecta]) { cloud.material.uniforms.origin.value.copy(site); cloud.material.uniforms.target.value.copy(axis); }
  const solarShock = new THREE.Mesh(new THREE.TorusGeometry(1, .003, 6, 96), new THREE.MeshBasicMaterial({ color: '#ffc46d', transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
  solarShock.name = 'Bow shock'; solarShock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis); solar.add(solarShock);
  // The plasma front wraps Earth in fire once the ejection arrives.
  const engulf = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 26), createShaderMaterial({
    uniforms: { time, fade: { value: 0 } }, vertexShader: vertex,
    fragmentShader: `uniform float time,fade;varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;${noise}
    void main(){vec3 p=normalize(point);float turbulence=fbm(p*6.+vec3(time*.35,-time*.5,0.));
    float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewDirection))),1.3);
    vec3 fire=mix(vec3(.9,.12,.01),vec3(3.,1.5,.4),smoothstep(.28,.72,turbulence));
    gl_FragColor=vec4(fire,fade*(rim*.7+turbulence*.35));${output}}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  engulf.name = 'Engulfed Earth'; engulf.position.copy(earthCenter); engulf.visible = false; solar.add(engulf);
  // HIGH and ULTRA march the corona, the ejection and the engulfment as volumes (see render-kit.js); the sprites and
  // shells above stay for the lower tiers. Space has no fog, so the volumes carry none.
  const uAxis = new THREE.Vector3().crossVectors(axis, up).normalize(), vAxis = new THREE.Vector3().crossVectors(axis, uAxis);
  const coronaVolume = marchedVolume({ name: 'Corona volume', geometry: new THREE.SphereGeometry(1, 48 * fine, 32 * fine),
    uniforms: volumeUniforms({ time, phase, activity, fogDensity: { value: 0 }, site: { value: axis.clone() } }),
    declare: 'uniform float phase,activity;uniform vec3 site;',
    // Streamers fan out from the limb, a helmet streamer stands over the active region and fine wisps drift outward.
    field: `vec3 field(vec3 p,bool detail){
      vec3 q=p-origin;float r=length(q);if(r<31.6||r>62.)return vec3(0.);
      vec3 n=q/r;float fall=exp(-(r-31.6)*.18)*(1.-smoothstep(45.,62.,r));if(fall<.02)return vec3(0.);
      float streamer=smoothstep(.55,.85,fbm(n*4.2+vec3(time*.03,0.,0.)));
      float helmet=pow(max(dot(n,site),0.),6.)*(.6+activity*.8);
      float d=fall*(.08+.92*streamer+helmet*.8);if(d<.01)return vec3(0.);
      float wisp=detail?noise(n*11.+vec3(0.,0.,r*.14-time*.5)):.5;
      return vec3(d*(.55+.45*wisp),helmet,wisp);
    }`,
    span: '70.', dt: '1.5,5.', loop: 32, absorb: '.045', stop: 'length(p-origin)<31.6',
    shade: `sampleColor=mix(vec3(.9,.32,.08),vec3(1.25,.8,.35),f.z)*(.8+activity*.3+phase*.3+f.y*.5);` });
  coronaVolume.position.copy(sunCenter); coronaVolume.scale.setScalar(62); coronaVolume.material.uniforms.origin.value.copy(sunCenter); solar.add(coronaVolume);
  const ejection = marchedVolume({ name: 'Ejection volume', geometry: new THREE.SphereGeometry(1, 40 * fine, 28 * fine),
    uniforms: volumeUniforms({ time, front, fogDensity: { value: 0 }, radius: { value: 1 }, axis: { value: axis.clone() }, uAxis: { value: uAxis }, vAxis: { value: vAxis }, sun: { value: sunCenter.clone() } }),
    declare: 'uniform float front,radius;uniform vec3 axis,uAxis,vAxis,sun;',
    // A bright leading front on the Earth-facing side, filaments streaming along the axis and a boiling interior.
    field: `vec3 field(vec3 p,bool detail){
      vec3 local=(p-origin)/radius;float along=dot(local,axis);vec3 q=axis*along+(local-axis*along)*2.6;float rr=length(q);if(rr>1.1)return vec3(0.);
      float ahead=dot(q,axis);
      // A bright thin front on the Earth-facing side, a nearly empty cavity and a dense core of ejected prominence.
      float shell=exp(-pow((rr-.9)/.09,2.))*smoothstep(-.3,.5,ahead/max(rr,1e-3)),edge=smoothstep(.5,.9,rr);
      float core=exp(-length(q+axis*.35)*3.5);
      if(shell<.02&&core<.02&&edge<.02)return vec3(0.);
      vec3 flow=p-origin-axis*time*9.;
      float strands=edge>.02?smoothstep(.35,.75,fbm(vec3(dot(q,uAxis)*6.,dot(q,vAxis)*6.,time*.4))):.5;
      float filaments=edge>.02?smoothstep(.5,.85,fbm(vec3(dot(q,uAxis)*5.,dot(q,vAxis)*5.,ahead*1.2-time*.6)))*edge:0.;
      float d=(shell*(.3+.7*strands)+filaments*.35+core*.42*(.5+.5*fbm(flow*.15))+(1.-edge)*.012)*front;if(d<.01)return vec3(0.);
      float grain=detail?fbm(flow*.2+3.):.5;
      return vec3(d*(.6+.4*grain),shell,grain);
    }`,
    span: 'radius*2.3', dt: '1.,5.', loop: 48, absorb: '.04', stop: 'length(p-sun)<31.6',
    shade: `sampleColor=mix(vec3(1.1,.3,.05),vec3(1.8,.9,.32),f.z)*(.5+.7*f.y)+vec3(1.4,.65,.18)*f.y*.28;` });
  solar.add(ejection);
  const engulfVolume = marchedVolume({ name: 'Engulf volume', geometry: new THREE.SphereGeometry(1, 32 * fine, 24 * fine),
    uniforms: volumeUniforms({ time, fogDensity: { value: 0 }, swallow: { value: 0 }, axis: { value: axis.clone() } }),
    declare: 'uniform float swallow;uniform vec3 axis;',
    // A bow shock on the sun-facing side, a fire sheath over the atmosphere and a plasma wake behind the planet.
    field: `vec3 field(vec3 p,bool detail){
      vec3 q=p-origin;float r=length(q);if(r<9.2)return vec3(0.);
      float along=dot(q,axis);vec3 perp=q-axis*along;float rp=length(perp);
      float shock=exp(-pow((r-11.2)/1.5,2.))*(1.-smoothstep(-.5,.1,along/r));
      float sheath=1.-smoothstep(9.4,13.,r);
      float wake=(1.-smoothstep(8.,15.,rp))*smoothstep(0.,6.,along)*(1.-smoothstep(12.,26.,along));
      float turb=fbm(q*.25-axis*time*4.);
      float d=(shock*.8+sheath*.06+wake*.12)*(.4+.8*turb)*swallow;if(d<.01)return vec3(0.);
      float grain=detail?fbm(q*.6-axis*time*6.+2.):.5;
      return vec3(d*(.6+.4*grain),shock,grain);
    }`,
    span: '40.', dt: '.6,2.', loop: 48, absorb: '.24', stop: 'length(p-origin)<9.2',
    shade: `sampleColor=mix(vec3(1.,.22,.04),vec3(2.2,1.1,.4),f.z)*(1.+f.y*.45);` });
  engulfVolume.position.copy(earthCenter).addScaledVector(axis, 6); engulfVolume.quaternion.setFromUnitVectors(up, axis); engulfVolume.scale.set(17, 30, 17);
  engulfVolume.material.uniforms.origin.value.copy(earthCenter); solar.add(engulfVolume);
  const calmAir = new THREE.Color('#49a9ff'), searedAir = new THREE.Color('#ff8b39');

    function update(t, quality) {
      sunSurface.material.uniforms.radiance.value = quality === 'lite' ? .85 : .9;
      const volumetric = quality === 'high' || quality === 'ultra', ultra = quality === 'ultra';
      const burst = Math.sin(clamp((t - 5) / 2.6) * Math.PI), afterglow = ease((t - 5) / .6) * (1 - ease((t - 7.6) / 8)) * .3;
      activity.value = ease(t / 5) * (1 - ease((t - 5) / 3) * .55);
      flash.value = burst * .48 + afterglow * .35; phase.value = ease((t - 5) / 8);
      loops.rotation.y = t * .01;
      loopMat.color.set('#ff6b15').multiplyScalar(1.7 * (1 + activity.value * .5 + burst * .4));
      const rise = ease((t - 4.5) / 7);
      arch.scale.set(.25+rise*2.1,.25+rise*3.4,.7); arch.rotation.y = .45 + t * .015;
      archMaterial.opacity = ease((t - 4.4) / 1.2) * (1 - ease((t - 18) / 5));
      const progress = Math.pow(clamp((t - 7) / 16),1.8), radius = 3 + progress * 45;
      prominence.position.copy(site).addScaledVector(axis,progress*24);
      bubble.visible = t > 7 && !volumetric; bubble.position.copy(site).addScaledVector(axis, radius * .5); bubble.scale.set(radius*.38,radius*.38,radius);
      front.value = ease((t - 7) / 2) * .65 * (1 - ease((t - 23) / 5));
      stream.visible = t > 5; ejecta.visible = t > 5 && t < 12;
      solarShock.visible = t > 7 && t < 26; solarShock.position.copy(site).addScaledVector(axis, radius * 1.5);
      solarShock.scale.setScalar(2 + progress * 14); solarShock.material.opacity = (1 - progress) * .12;
      solarEarth.group.rotation.y = t * .025;
      solarEarth.clouds.rotation.y = t * .009;
      solarEarth.surface.material.uniforms.heat.value = ease((t - 22) / 3) * .75 * (1 - ease((t - 27) / 3) * .55);
      const seared = ease((t - 22) / 2);
      solarEarth.air.material.uniforms.tint.value.copy(calmAir).lerp(searedAir, seared);
      solarEarth.air.material.uniforms.strength.value = .42 + seared * .2 - ease((t - 27) / 3) * .22;
      const swallow = ease((t - 22) / 2.2) * (1 - ease((t - 26) / 4));
      engulf.visible = t > 21.5 && !volumetric; engulf.scale.setScalar(9 * (1.15 + swallow * .75));
      engulf.material.uniforms.fade.value = swallow * (.38 + .06 * Math.sin(t * 9));
      corona.visible = !volumetric; coronaVolume.visible = volumetric;
      ejection.visible = volumetric && t > 7; ejection.position.copy(bubble.position); ejection.scale.setScalar(radius * 1.15);
      ejection.material.uniforms.radius.value = radius; ejection.material.uniforms.origin.value.copy(bubble.position);
      engulfVolume.visible = volumetric && t > 21.5; engulfVolume.material.uniforms.swallow.value = swallow;
      for (const [volume, steps] of [[coronaVolume, ultra ? 28 : 20], [ejection, ultra ? 40 : 32], [engulfVolume, ultra ? 32 : 24]]) volume.material.uniforms.steps.value = steps;
    }
    // The corona and the flash are camera-facing sprites, so they follow the viewer like the lensed halo.
    function updateView() {
      corona.lookAt(camera.position); flareFlash.lookAt(camera.position);
      const c = camera.position;
      setInside(coronaVolume, c.distanceTo(sunCenter) < 62);
      setInside(ejection, c.distanceTo(ejection.position) < ejection.scale.x);
      setInside(engulfVolume, c.distanceTo(engulfVolume.position) < 17);
    }
    return { group: solar, update, updateView };
  }
  function createAsteroid() {
    seed = 77495;
    const asteroidScene = group('armageddon-asteroid');
    // An offset crescent establishes planetary scale behind the foreground fracture.
    const asteroidEarth = earth(76, new THREE.Vector3(-90, 2, -170), 1, new THREE.Vector3(-.8, .5, -.65));
    asteroidEarth.group.name = 'Earth beyond the fracture'; asteroidScene.add(asteroidEarth.group);
    asteroidEarth.air.material.uniforms.strength.value = .3;
    // Keep the backdrop quiet: the surface retains cloud texture, while the extra deck would brighten the night side.
    asteroidEarth.clouds.visible = false; asteroidEarth.clouds.userData.fineDetail = false;
    const asteroid = new THREE.Group(); asteroid.name = 'Fracturing asteroid'; asteroidScene.add(asteroid);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#596774', vertexColors: true, roughness: .88, metalness: .12 });
    rockMat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 rockPoint;').replace('#include <begin_vertex>', '#include <begin_vertex>\nrockPoint=position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 rockPoint;' + noise)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=normalize(normal+(vec3(noise(rockPoint*1.8),noise(rockPoint.zxy*1.8),noise(rockPoint.yzx*1.8))-.5)*.42);')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=.7+fbm(rockPoint*2.4)*.65;');
    };
    rockMat.customProgramCacheKey = () => 'cosmic-fractured-rock-v1';
    recordSurface(rockMat,{kind:'rock',uniforms:{}});
    const interior = new THREE.MeshStandardMaterial({ color: '#77756c', vertexColors: true, roughness: .9, metalness: .04, emissive: '#ed762e', emissiveIntensity: .01 });
    interior.onBeforeCompile = rockMat.onBeforeCompile;
    interior.customProgramCacheKey = rockMat.customProgramCacheKey;
    recordSurface(interior,{kind:'rock',uniforms:{}});
    // Blender exports each closed half around its own centroid. Both retain their mass and
    // match at the seam before the blast; only their absolute-time poses change afterward.
    const halves = armageddonFragments.map(piece => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(piece.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(piece.normals, 3));
      const colors = new Float32Array(piece.positions.length);
      for (let i = 0; i < colors.length; i += 3) {
        const x = piece.positions[i] + piece.pivot[0], y = piece.positions[i + 1] + piece.pivot[1], z = piece.positions[i + 2] + piece.pivot[2];
        const shade = .68 + .25 * Math.sin(x * .31 + z * .13) * Math.sin(y * .24 - z * .18);
        const vein = Math.pow(Math.abs(Math.sin(y * .34 + z * .27 + x * .12)), 18) * .16;
        colors.set([shade + vein * .8, shade + vein * .95, shade + vein], i);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      for (const face of piece.groups) geometry.addGroup(face.start, face.count, face.materialIndex);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, [rockMat, interior]); mesh.name = piece.name;
      const pivot = new THREE.Vector3(...piece.pivot); mesh.position.copy(pivot); asteroid.add(mesh);
      return { mesh, pivot, side: Math.sign(pivot.x) };
    });
    const seamPoints = [];
    for (let i = 0; i < armageddonSeam.length; i += 3) {
      const point = new THREE.Vector3(...armageddonSeam.slice(i, i + 3));
      point.addScaledVector(new THREE.Vector3(0, point.y, point.z).normalize(), .32);
      seamPoints.push(point);
    }
    // Follow the authored corners instead of smoothing the warning into the jagged shell.
    const seamPath = new THREE.CurvePath();
    for (let i = 0; i < seamPoints.length; i++) seamPath.add(new THREE.LineCurve3(seamPoints[i], seamPoints[(i + 1) % seamPoints.length]));
    const seamMat = new THREE.MeshBasicMaterial({ color: '#ff9b54', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const seam = new THREE.Mesh(new THREE.TubeGeometry(seamPath, seamPoints.length * 2, .27, 5, true), seamMat);
    seam.name = 'Core fracture seam'; asteroid.add(seam);
    const seamGlowMat = new THREE.MeshBasicMaterial({ color: '#ff732f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const seamGlow = new THREE.Mesh(new THREE.TubeGeometry(seamPath, seamPoints.length * 2, .65, 5, true), seamGlowMat);
    seamGlow.name = 'Fracture seam glow'; seam.add(seamGlow);

    const fragmentMat = new THREE.MeshStandardMaterial({ color: '#6b747b', roughness: .86, metalness: .12 });
    const fragments = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), fragmentMat, 110);
    fragments.name = 'Secondary asteroid ejecta'; fragments.userData.total = 110;
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fragments.frustumCulled = false; asteroid.add(fragments);
    const fragmentSeeds = Array.from({ length: 110 }, () => ({
      side: random() > .5 ? 1 : -1, angle: random() * TAU,
      speed: .65 + random() * .65, size: .16 + Math.pow(random(), 3) * 1.55, offset: random(),
    }));
    // Two narrow, one-shot streams follow the breakup; no continuously recycled dust wedge.
    const dustSeeds = Array.from({ length: 600 }, () => ({ side: random() > .5 ? 1 : -1, angle: random() * TAU,
      speed: 12 + random() * 22, delay: random() * .8, spread: .3 + random() * .7 }));
    const dustGeometry = new THREE.BufferGeometry(), dustPositions = new Float32Array(dustSeeds.length * 3);
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const dustMaterial = new THREE.PointsMaterial({ color: '#d1a16e', size: .8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const dust = new THREE.Points(dustGeometry, dustMaterial); dust.name = 'Asteroid fracture dust'; dust.frustumCulled = false;
    applyParticlePoints(dust, canvas, 'debris'); asteroid.add(dust);
    const detonation = new THREE.Mesh(new THREE.SphereGeometry(1, 40 * fine, 24 * fine), createShaderMaterial({
      uniforms: { time, fade: { value: 0 } }, vertexShader: vertex,
      fragmentShader: `uniform float time,fade;varying vec3 point;${noise}
    void main(){float turbulence=fbm(point*7.+vec3(0.,-time*.4,0.));
    vec3 fire=mix(vec3(.25,.028,.003),vec3(2.8,1.25,.27),smoothstep(.24,.74,turbulence));
    gl_FragColor=vec4(fire,fade*(.7+turbulence*.3));${output}}`,
      transparent: true, depthWrite: false
    }));
    detonation.name = 'Core detonation'; asteroid.add(detonation);

    function update(t, quality) {
      const flight = Math.max(0, t - 16), opened = ease(flight / 1.1), heat = ease((t - 8) / 8);
      const impulse = Math.pow(Math.sin(clamp(flight / .95) * Math.PI), 1.2);
      const travel = opened * 3.8 + flight * (1.3 + 1.5 * ease(flight / 6));
      const tumble = ease(flight / 5) + Math.max(0, flight - 5) * .03;
      phase.value = opened * (1 - ease((t - 20) / 8));
      asteroid.position.set(-7 + ease(t / 16) * 9, 47 + ease(t / 15) * 2, -4 - ease(t / 30) * 12);
      asteroid.rotation.set(-.08 + t * .006, -.18 + t * .009, -.22 + t * .003);
      for (const { mesh, pivot, side } of halves) {
        const near = side < 0;
        mesh.position.set(pivot.x + side * travel * (near ? 1.05 : .82), pivot.y + travel * (near ? .28 : -.16), pivot.z + travel * (near ? .38 : -.55));
        mesh.rotation.set(tumble * (near ? -.2 : .37), tumble * (near ? -.57 : .82), tumble * (near ? .2 : -.16));
      }
      interior.emissiveIntensity = .01 + impulse * .7 + heat * (1 - ease((t - 16) / 6)) * .22;
      seam.visible = t > 8 && t < 17.7;
      seamMat.color.set('#ffb96b').multiplyScalar(1.4 + heat * 2.6 + impulse * 4);
      seamMat.opacity = heat * (.45 + .2 * Math.pow(Math.sin((t - 8) * 2.4), 2) + impulse * .35) * (1 - ease(flight / 1.7));
      seamGlowMat.opacity = seamMat.opacity * .22;
      fragments.visible = t > 16;
      for (let i = 0; i < fragments.count; i++) {
        const f = fragmentSeeds[i], spread = travel * f.speed;
        dummy.position.set(f.side * (2 + spread * 1.5), Math.cos(f.angle) * (3 + spread * .18) + f.side * spread * .22, Math.sin(f.angle) * (5 + spread * .24) - spread * .12);
        dummy.rotation.set(f.offset + flight * .21, flight * .17 + f.angle, flight * .11);
        dummy.scale.set(f.size, f.size * .68, f.size * 1.2); dummy.updateMatrix(); fragments.setMatrixAt(i, dummy.matrix);
      }
      fragments.instanceMatrix.needsUpdate = true;
      const dustCount = Math.floor(dustSeeds.length * (quality === 'lite' ? .28 : quality === 'balanced' ? .58 : 1));
      dustGeometry.setDrawRange(0, dustCount);
      for (let i = 0; i < dustCount; i++) {
        const s = dustSeeds[i], age = Math.max(0, flight - s.delay), distance = age * s.speed / (1 + age * .18), width = (1 + distance * .045) * s.spread;
        dustPositions[i * 3] = s.side * (2 + distance);
        dustPositions[i * 3 + 1] = Math.cos(s.angle) * width + s.side * distance * .26;
        dustPositions[i * 3 + 2] = Math.sin(s.angle) * width - distance * .15;
      }
      dustGeometry.attributes.position.needsUpdate = true;
      dust.visible = t > 16 && t < 28; dustMaterial.opacity = phase.value * .65;
      detonation.visible = flight > 0 && flight < .95;
      detonation.scale.set(.01 + impulse * 18, .01 + impulse * 10, .01 + impulse * 14);
      detonation.material.uniforms.fade.value = impulse * .9;
      asteroidEarth.group.rotation.y = t * .003;
    }
    return { group: asteroidScene, update, fragments };
  }
  function createBlackHole() {
    seed = 77496;
  // INTERSTELLAR: an accretion disk and geometric lensing approximation.
  const blackHoleScene = group('interstellar-black-hole');
  const blackHole = new THREE.Group(); blackHole.position.y = 50; blackHoleScene.add(blackHole);
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(16.2, 64 * fine, 40 * fine), new THREE.MeshBasicMaterial({ color: '#000000', fog: false })); blackHole.add(horizon);
  const disk = new THREE.Mesh(new THREE.RingGeometry(19, 74, 192 * fine, 12 * fine), createShaderMaterial({
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
  const halo = new THREE.Mesh(new THREE.RingGeometry(16.9, 34, 160 * fine, 8 * fine), createShaderMaterial({
    uniforms: { time }, vertexShader: vertex,
    fragmentShader: `uniform float time;varying vec3 point;${noise}
    void main(){float radius=length(point.xy);float a=atan(point.y,point.x);float radial=(radius-16.9)/17.1;
    float lens=exp(-radial*5.5)*(.65+.35*sin(radial*90.));float plume=fbm(vec3(cos(a)*8.,sin(a)*8.,radial*8.+time*.15));
    float sides=.3+.7*abs(sin(a));gl_FragColor=vec4(vec3(3.4,1.85,.76)*(.62+plume),lens*sides*.78);${output}}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  })); lens.add(halo);
  const photon = new THREE.Mesh(new THREE.TorusGeometry(16.65, .27, 8, 128 * fine), emissive('#fff2d2', 4.3)); lens.add(photon);
  const rearArc = new THREE.Mesh(new THREE.TorusGeometry(25, 2, 9, 120 * fine, Math.PI), createShaderMaterial({
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
    const cascade = group('gravity-debris-cascade');
    const home = earth(520, new THREE.Vector3(-100, -350, -680), 1.5, new THREE.Vector3(-.72, .12, -.68));
    home.group.name = 'Earth terminator backdrop'; home.air.material.uniforms.strength.value = .24; cascade.add(home.group);
    const station = new THREE.Group(); station.name = 'Orbital station'; station.position.set(0, 40, 0); cascade.add(station);
    const silver = new THREE.MeshStandardMaterial({ color: '#d1dbe3', metalness: .62, roughness: .34 });
    const white = new THREE.MeshStandardMaterial({ color: '#dddeda', metalness: .2, roughness: .56 });
    const foil = new THREE.MeshStandardMaterial({ color: '#b89045', metalness: .72, roughness: .44 });
    const blue = new THREE.MeshStandardMaterial({ color: '#153c6b', metalness: .3, roughness: .56, emissive: '#102b53', emissiveIntensity: .18 });
    const graphite = new THREE.MeshStandardMaterial({ color: '#263746', metalness: .64, roughness: .4 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const box = (parent, material, size, position) => {
      const mesh = new THREE.Mesh(unit, material); mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
    };
    const trussHalves = [-1, 1].map(side => {
      const half = new THREE.Group(); half.name = side < 0 ? 'Port truss' : 'Starboard truss'; station.add(half);
      for (const y of [-1.15, 1.15]) for (const z of [-1.4, 1.4]) box(half, silver, [50, .28, .28], [0, y, z]);
      const braces = new THREE.InstancedMesh(unit, graphite, 48); half.add(braces);
      for (let i = 0; i < 48; i++) {
        dummy.position.set(-23 + (i % 12) * 4.15, 0, i < 24 ? -1.4 : 1.4);
        dummy.rotation.set(0, 0, i % 2 ? -.56 : .56); dummy.scale.set(.24, 4.4, .24);
        dummy.updateMatrix(); braces.setMatrixAt(i, dummy.matrix);
      }
      braces.instanceMatrix.needsUpdate = true;
      return half;
    });
    const hub = new THREE.Group(); hub.name = 'Pressure module spine'; station.add(hub);
    for (const [z, length, material] of [[-14, 12, white], [0, 12, silver], [14, 12, white]]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, length, 24 * fine), material);
      body.rotation.x = Math.PI / 2; body.position.z = z; hub.add(body);
      for (const end of [-1, 1]) {
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, .8, 24 * fine), graphite);
        collar.rotation.x = Math.PI / 2; collar.position.z = z + end * length / 2; hub.add(collar);
      }
      box(hub, foil, [2.8, 1.5, 4], [0, 3.15, z]);
    }
    for (const side of [-1, 1]) {
      const port = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 9, 16 * fine), white);
      port.rotation.z = Math.PI / 2; port.position.set(side * 6, 0, 1); hub.add(port);
      const radiator = box(hub, white, [9, .2, 12], [side * 10, -4.3, 9]); radiator.rotation.z = side * .25;
      for (let i = 0; i < 5; i++) box(hub, graphite, [8.8, .05, .08], [side * 10, -4.1, 4 + i * 2.3]);
    }
    const wings = [];
    for (const x of [-43, -26, 26, 43]) for (const side of [-1, 1]) {
      const wing = new THREE.Group(); wing.name = `Solar wing ${wings.length + 1}`; station.add(wing);
      box(wing, graphite, [8.6, .2, 23], [0, 0, 0]);
      for (const edge of [-1, 1]) {
        box(wing, silver, [.16, .28, 23.3], [edge * 4.35, 0, 0]);
        box(wing, silver, [8.8, .28, .16], [0, 0, edge * 11.6]);
      }
      const cells = new THREE.InstancedMesh(unit, blue, 24); cells.name = 'Photovoltaic cells'; wing.add(cells);
      for (let i = 0; i < 24; i++) {
        dummy.position.set((i % 3 - 1) * 2.78, .32, (Math.floor(i / 3) - 3.5) * 2.82);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(2.48, .24, 2.55); dummy.updateMatrix(); cells.setMatrixAt(i, dummy.matrix);
      }
      cells.instanceMatrix.needsUpdate = true;
      const index = wings.length, detach = [11.3, 11.8, 12.5, 13.1, 14.6, 15.2, 17.9, 18.5][index];
      wings.push({ object: wing, x, side, detach, speed: 1.1 + random() * .8, spin: .055 + random() * .045 });
    }
    const astronaut = new THREE.Group(); astronaut.name = 'Untethered astronaut'; astronaut.scale.setScalar(2.1); cascade.add(astronaut);
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(.75, 1.5, 4, 12), white); astronaut.add(suit);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.8, 16, 12), white); helmet.position.y = 1.5; astronaut.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(.64, 16, 10), foil); visor.scale.set(1, .75, .45); visor.position.set(0, 1.55, .55); astronaut.add(visor);
    box(astronaut, silver, [1.25, 1.8, .75], [0, .1, -.7]);
    for (const side of [-1, 1]) {
      const arm = box(astronaut, white, [.45, 1.7, .5], [side * 1.05, .1, 0]); arm.rotation.z = side * .6;
      const leg = box(astronaut, white, [.55, 1.6, .65], [side * .45, -1.5, 0]); leg.rotation.z = side * .15;
    }
    const streamDirection = new THREE.Vector3(1, -.18, -.55).normalize();
    const lateral = new THREE.Vector3(-.482, 0, -.876), vertical = new THREE.Vector3(.137, .988, -.075);
    const debris = new THREE.InstancedMesh(unit, silver, 160); debris.name = 'Kessler debris field'; debris.userData.total = 160;
    debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debris.frustumCulled = false; cascade.add(debris);
    const debrisSeeds = Array.from({ length: 160 }, (_, i) => {
      debris.setColorAt(i, new THREE.Color(i % 4 === 0 ? '#376ca0' : i % 4 === 1 ? '#b5c7d4' : '#5e7180'));
      return { cross: 8.5 + random() * 11.5, u: (random() - .5) * 100, v: (random() - .5) * 74,
        speed: 90 + random() * 70, width: .25 + random() * 1.5, length: 1.5 + random() * 4, spin: random() * TAU };
    });
    debris.instanceColor.needsUpdate = true;
    const streaks = particles(cascade, 1400, 'streak', '#9ab6cb'); streaks.name = 'Orbital dust streaks';
    const sparks = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#e7edee', transparent: true, opacity: 0, depthWrite: false }), 42);
    sparks.name = 'Impact splinters'; sparks.frustumCulled = false; cascade.add(sparks);
    const sparkSeeds = Array.from({ length: 42 }, () => new THREE.Vector3(.7 + random(), (random() - .5) * 1.6, (random() - .5) * 1.3).normalize());
    const flashes = [[11.3, -43, 40, -16], [14.6, 26, 40, -16], [17.9, 0, 40, 0]];
    const impact = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.7, 2.8), transparent: true, opacity: 0, depthWrite: false }));
    impact.name = 'Impact glint'; cascade.add(impact);
    const impactLight = new THREE.PointLight('#e5efff', 0, 100, 1.5); cascade.add(impactLight);
    const origin = new THREE.Vector3(), direction = new THREE.Vector3();

    function update(t, quality) {
      phase.value = .3 * ease((t - 7) / 3) * (1 - ease((t - 21) / 7));
      home.group.rotation.y = t * .0015; home.clouds.rotation.y = t * .0007;
      station.rotation.set(.12, -.24 + t * .003, -.12);
      for (const wing of wings) {
        const age = Math.max(0, t - wing.detach), release = age * ease(age / .75), side = Math.sign(wing.x);
        wing.object.position.set(wing.x + side * release * wing.speed, release * (.65 + wing.side * .3), wing.side * (15.6 + release * .65));
        wing.object.rotation.set(.16 + release * wing.spin * wing.side, release * wing.spin * .7, release * wing.spin * side);
      }
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1, age = Math.max(0, t - (i ? 14.6 : 17.9)), release = age * ease(age / 1.25);
        trussHalves[i].position.set(side * (25 + release * 1.2), -release * (i ? .9 : .28), release * side * .4);
        trussHalves[i].rotation.set(release * .025 * side, release * .025, -release * .055 * side);
      }
      const shear = Math.max(0, t - 17.9), release = shear * ease(shear / 1.1);
      hub.position.set(release * .22, -release * .6, release * .55); hub.rotation.set(release * .055, -release * .028, release * .035);
      const drift = Math.max(0, t - 19), adrift = drift * ease(drift / 1.4);
      astronaut.visible = true; astronaut.position.set(11 - adrift * 4.45, 43 + adrift * .36, 24 + adrift * 3.64);
      astronaut.rotation.set(.15 + adrift * .035, .55 + adrift * .018, -.2 + adrift * .055);
      debris.visible = t > 7 && t < 24;
      for (let i = 0; i < debris.count; i++) {
        const s = debrisSeeds[i], along = (t - s.cross) * s.speed;
        dummy.position.set(0, 40, 0).addScaledVector(lateral, s.u).addScaledVector(vertical, s.v).addScaledVector(streamDirection, along);
        dummy.rotation.set(s.spin + t * .6, s.spin + t * .25, t * .45);
        dummy.scale.set(s.width, .08 + s.width * .08, s.length); dummy.updateMatrix(); debris.setMatrixAt(i, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      impact.visible = false; impact.material.opacity = 0; impact.scale.setScalar(1); impact.position.set(0, 40, 0); impactLight.intensity = 0; impactLight.position.set(0, 40, 0);
      sparks.visible = false; sparks.material.opacity = 0; sparks.count = quality === 'lite' ? 14 : quality === 'balanced' ? 26 : 42;
      let burstAge = 0; origin.set(0, 40, 0);
      for (const [at, x, y, z] of flashes) {
        const age = t - at;
        if (age < 0 || age > 1.4) continue;
        origin.set(x, y - 40, z).applyEuler(station.rotation).add(station.position); burstAge = age;
        const pulse = Math.sin(clamp(age / .28) * Math.PI) * (age < .28 ? 1 : 0);
        impact.visible = pulse > .01; impact.position.copy(origin); impact.scale.setScalar(.3 + pulse * 1.4); impact.material.opacity = pulse;
        impactLight.position.copy(origin); impactLight.intensity = pulse * 280;
        sparks.visible = true; sparks.material.opacity = .8 * (1 - ease(age / 1.4));
      }
      for (let i = 0; i < sparks.count; i++) {
        direction.copy(sparkSeeds[i]); dummy.position.copy(origin).addScaledVector(direction, burstAge * (9 + i * .7));
        dummy.quaternion.setFromUnitVectors(up, direction); dummy.scale.set(.055, .2 + burstAge * 1.8, .055);
        dummy.updateMatrix(); sparks.setMatrixAt(i, dummy.matrix);
      }
      sparks.instanceMatrix.needsUpdate = true;
    }
    return { group: cascade, update, fragments: debris };
  }
  function createEngines() {
    seed = 77498;
    const exodus = group('wandering-earth-jupiter-flyby');
    const jupiterPosition = new THREE.Vector3(-185, 110, -540);
    const jupiter = new THREE.Group(); jupiter.name = 'Jupiter'; jupiter.position.copy(jupiterPosition); jupiter.rotation.z = -.09; exodus.add(jupiter);
    const flash = { value: 0 };
    const jupiterSurface = new THREE.Mesh(new THREE.SphereGeometry(285, 96 * fine, 64 * fine), createShaderMaterial({
      uniforms: { time, flash, light: { value: new THREE.Vector3(-.4, .6, .9).normalize() } }, vertexShader: vertex,
      fragmentShader: `uniform float time,flash;uniform vec3 light;varying vec3 point;varying vec3 worldNormal;varying vec3 viewNormal;varying vec3 viewDirection;${noise}
      void main(){vec3 p=normalize(point);float lon=atan(p.z,p.x);
      float flow=fbm(vec3(p.x*4.,p.y*11.,p.z*4.)+vec3(time*.006,0.,0.));
      float latitude=p.y+(flow-.5)*.065+sin(lon*7.+p.y*30.)*.008;
      float belt=sin(latitude*42.+fbm(p*12.)*2.2);
      float wisps=fbm(vec3(p.x*32.,p.y*90.,p.z*32.)+flow*3.);
      vec3 color=mix(vec3(.24,.13,.08),vec3(.62,.49,.34),smoothstep(-.45,.7,belt));
      float ribbons=sin(latitude*142.+wisps*7.+flow*3.);
      color=mix(color,vec3(.79,.69,.53),smoothstep(.25,.95,ribbons)*.22);
      color*=.72+wisps*.5;
      vec2 spot=vec2(lon-1.2,p.y+.22)*vec2(1.,2.4);
      float storm=1.-smoothstep(.045,.15,length(spot)+fbm(vec3(spot*25.,time*.02))*.025);
      color=mix(color,vec3(.45,.18,.095)*(.8+wisps*.4),storm*.85);
      float daylight=dot(normalize(worldNormal),light);
      float facing=abs(dot(normalize(viewNormal),normalize(viewDirection)));
      color*= (.055+max(daylight,0.)*.9)*(.36+.64*pow(facing,.5));
      color+=vec3(.026,.035,.055)*(1.-smoothstep(-.3,.2,daylight));
      color+=vec3(1.8,.72,.19)*flash*pow(max(dot(normalize(worldNormal),normalize(vec3(.35,-.12,.93))),0.),7.);
      gl_FragColor=vec4(color,1.);${output}}`
    }));
    jupiterSurface.name = 'Jupiter storm bands';
    jupiter.add(jupiterSurface, atmosphere(289, '#c6ad8b', .2));
    const earthHome = new THREE.Vector3(18, 40, 12), earthPosition = new THREE.Vector3();
    const home = earth(26, earthHome); home.group.name = 'Frozen Earth'; home.surface.name = 'Frozen crust'; home.air.name = 'Frozen atmosphere';
    home.surface.material.uniforms.frost.value = 1; exodus.add(home.group);
    const toJupiter = new THREE.Vector3().subVectors(jupiterPosition, earthHome).normalize();
    const lateral = new THREE.Vector3().crossVectors(up, toJupiter).normalize();
    const vertical = new THREE.Vector3().crossVectors(toJupiter, lateral).normalize();

    // A soft tapered ribbon keeps the exhaust luminous without a crown of solid spikes.
    const pixels = new Uint8Array(32 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) {
      const v = y / 127, u = (x / 31 - .5) * 2, width = .22 + .72 * (1 - v);
      const alpha = Math.exp(-u * u / (width * width) * 4) * Math.pow(1 - v, 1.4) * Math.min(1, v * 16);
      const i = (y * 32 + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; pixels[i + 3] = Math.round(alpha * 255);
    }
    const plumeMap = new THREE.DataTexture(pixels, 32, 128); plumeMap.needsUpdate = true;
    plumeMap.magFilter = THREE.LinearFilter; plumeMap.minFilter = THREE.LinearFilter;
    const plume = new THREE.MeshBasicMaterial({ map: plumeMap, color: new THREE.Color('#348dd9').multiplyScalar(1.2), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const plumeCore = new THREE.MeshBasicMaterial({ map: plumeMap, color: new THREE.Color('#b9e8ff').multiplyScalar(1.3), transparent: true, opacity: .66, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const jetGeometry = new THREE.PlaneGeometry(1, 1);
    const jets = new THREE.InstancedMesh(jetGeometry, plume, 72), cores = new THREE.InstancedMesh(jetGeometry, plumeCore, 72);
    jets.name = 'Fusion engine plumes'; cores.name = 'Plume cores';
    for (const mesh of [jets, cores]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; exodus.add(mesh); }
    const engineSeeds = Array.from({ length: 72 }, (_, i) => {
      const angle = (i % 6) * TAU / 6 + .32;
      const direction = toJupiter.clone().multiplyScalar(.58)
        .addScaledVector(lateral, Math.cos(angle) * .92 + (random() - .5) * .18)
        .addScaledVector(vertical, Math.sin(angle) * .8 + (random() - .5) * .18).normalize();
      return { direction, phase: random() * TAU, width: 1.6 + random() * 1.1 };
    });
    const siphon = particles(exodus, 2800, 'stream', '#659fc8'); siphon.name = 'Atmospheric siphon';
    const ignition = new THREE.Mesh(new THREE.SphereGeometry(1, 40 * fine, 24 * fine), createShaderMaterial({
      uniforms: { time, fade: { value: 0 } }, vertexShader: vertex,
      fragmentShader: `uniform float time,fade;varying vec3 point;${noise}
    void main(){float turbulence=fbm(point*7.+vec3(0.,-time*.4,0.));
    vec3 fire=mix(vec3(.25,.028,.003),vec3(2.8,1.25,.27),smoothstep(.24,.74,turbulence));
    gl_FragColor=vec4(fire,fade*(.7+turbulence*.3));${output}}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    })); ignition.name = 'Jupiter ignition'; exodus.add(ignition);
    const shockMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc788').multiplyScalar(1.3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const shock = new THREE.Mesh(new THREE.TorusGeometry(1, .004, 6, 120 * fine), shockMaterial); shock.name = 'Ignition pressure wave'; exodus.add(shock);
    shock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toJupiter);
    const ignitionPoint = jupiterPosition.clone().addScaledVector(toJupiter, -284);
    // Bury the flattened flare into the cloud deck so it reads as ignition on Jupiter.
    ignition.position.copy(ignitionPoint).addScaledVector(toJupiter, 6); shock.position.copy(ignitionPoint);
    ignition.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toJupiter.clone().negate()); ignition.rotateZ(-.32);
    const view = new THREE.Vector3(), across = new THREE.Vector3(), normal = new THREE.Vector3(), cameraPosition = new THREE.Vector3(), basis = new THREE.Matrix4();
    const warmAir = new THREE.Color('#ffc08b');
    let lastTime = 0, power = .35, coreBoost = 1;
    function updateView() {
      camera.getWorldPosition(cameraPosition);
      for (let i = 0; i < jets.count; i++) {
        const s = engineSeeds[i], length = (7 + 16 * power) * (.96 + .04 * Math.sin(lastTime * 5.2 + s.phase));
        dummy.position.copy(earthPosition).addScaledVector(s.direction, 26 + length * .5);
        view.subVectors(cameraPosition, dummy.position).normalize(); across.crossVectors(s.direction, view);
        if (across.lengthSq() < .0001) across.crossVectors(s.direction, up);
        across.normalize(); normal.crossVectors(across, s.direction).normalize();
        basis.makeBasis(across, s.direction, normal); dummy.quaternion.setFromRotationMatrix(basis);
        dummy.scale.set(s.width * 1.8, length, 1); dummy.updateMatrix(); jets.setMatrixAt(i, dummy.matrix);
        dummy.position.copy(earthPosition).addScaledVector(s.direction, 26 + length * .39);
        dummy.scale.set(s.width * .58 * coreBoost, length * .78, 1); dummy.updateMatrix(); cores.setMatrixAt(i, dummy.matrix);
      }
      jets.instanceMatrix.needsUpdate = true; cores.instanceMatrix.needsUpdate = true;
    }
    function update(t, quality = 'high') {
      lastTime = t;
      jets.count = cores.count = quality === 'lite' ? 24 : quality === 'balanced' ? 42 : 72;
      coreBoost = quality === 'lite' ? 1.6 : quality === 'balanced' ? 1.35 : 1;
      const approach = ease(t / 22), push = ease((t - 25.5) / 4.5);
      earthPosition.copy(earthHome).addScaledVector(toJupiter, approach * 28 - push * 65);
      home.group.position.copy(earthPosition); home.group.rotation.y = t * .014; home.clouds.rotation.y = t * .006;
      const ignitionEnvelope = ease((t - 22) / .7) * (1 - ease((t - 23.1) / 2.4));
      home.air.material.uniforms.tint.value.set('#8fd4ff').lerp(warmAir, ignitionEnvelope * .55);
      home.surface.material.uniforms.heat.value = ignitionEnvelope * .12;
      jupiter.rotation.y = t * .002;
      power = .35 + ease((t - 15) / 2) * .65 - ease((t - 24) / 2) * .22;
      plume.opacity = .42 + power * .16; plumeCore.opacity = (.5 + power * .16) * Math.sqrt(coreBoost);
      updateView();
      phase.value = .38 * ease((t - 7) / 8) * (1 - ease((t - 21.8) / 2.2));
      siphon.material.uniforms.origin.value.copy(earthPosition).addScaledVector(toJupiter, 26);
      siphon.material.uniforms.target.value.copy(ignitionPoint);
      const blastAge = Math.max(0, t - 22);
      ignition.visible = t > 22 && t < 25.5;
      const flareSize = .01 + ease(blastAge / 1.4) * 66;
      ignition.scale.set(flareSize * 1.65, flareSize * .45, flareSize * .32);
      ignition.material.uniforms.fade.value = ignitionEnvelope * .58;
      flash.value = ignitionEnvelope * .36;
      shock.visible = t > 22.25 && t < 27;
      shock.scale.setScalar(1 + ease((t - 22.25) / 4.75) * 250);
      shockMaterial.opacity = .32 * ease((t - 22.25) / .35) * (1 - ease((t - 23.1) / 3.9));
    }
    return { group: exodus, update, updateView };
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
        // Sprites thin out where a marched volume carries the same plasma.
        const share = object.userData.volumetricShare && fraction === 1 ? object.userData.volumetricShare : 1;
        object.geometry.setDrawRange(0, Math.floor(object.userData.particleCount * fraction * share));
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
    if (!loaded.has(config.id)) { const result = factory(); markEffects(result.group); loaded.set(config.id, result); }
    const next = loaded.get(config.id);
    if (next !== active) next.quality = undefined;
    active = next; active.group.visible = true; stars.visible = true;
    setQuality();
    const t = Math.max(0, Math.min(30, seconds)); time.value = t;
    active.update(t, active.quality);
  }
  // The lensed image follows the viewer, including orbiting a paused timeline.
  function updateView() { active?.updateView?.(); }
  return { update, updateView };
}
