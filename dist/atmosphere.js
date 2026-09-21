import * as THREE from 'three/webgpu';
import { createShaderMaterial } from './shader-program.js';
import { markEffect } from './render-kit.js';

const clamp = value => Math.max(0, Math.min(1, value));
const output = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const turbulence = `
uniform sampler2D weatherMap;uniform float weatherReady;
float cloudHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cloudNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(cloudHash(i),cloudHash(i+vec2(1,0)),f.x),mix(cloudHash(i+vec2(0,1)),cloudHash(i+vec2(1,1)),f.x),f.y);}
float weather(vec2 p){if(weatherReady>.5)return texture2D(weatherMap,p).r;
return cloudNoise(p*8.)*.65+cloudNoise(p*17.)*.35;}`;

// Only texture data is asynchronous. Every visible pose remains a function of time.
export function createAtmosphere({ scene, camera, canvas }) {
  const weatherMap = { value: null }, weatherReady = { value: 0 }, clock = { value: 0 };
  const loader = new THREE.TextureLoader();
  const ready = () => canvas.dispatchEvent(new Event('atmosphere-ready'));
  let weatherRequested = false, nebulaRequested = false;
  const domeGeometry = new THREE.SphereGeometry(1, 40, 24);
  const domeVertex = 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
  const celestialMaterial = createShaderMaterial({
    uniforms: { panorama: { value: null }, ready: { value: 0 }, strength: { value: .35 } },
    vertexShader: domeVertex,
    fragmentShader: `uniform sampler2D panorama;uniform float ready,strength;varying vec3 direction;
    void main(){vec3 d=normalize(direction);vec2 uv=vec2(atan(d.z,d.x)/6.283185+.5,asin(clamp(d.y,-1.,1.))/3.141593+.5);
    vec3 color=vec3(.003,.006,.013);
    if(ready>.5){vec3 dust=texture2D(panorama,uv).rgb;float luma=dot(dust,vec3(.2126,.7152,.0722));
    color+=mix(vec3(luma),dust,.65)*strength;}
    gl_FragColor=vec4(color,1.);${output}}`,
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  const celestial = new THREE.Mesh(domeGeometry, celestialMaterial);
  celestial.name = 'Locally generated interstellar dust'; celestial.scale.setScalar(690);
  celestial.visible = false; celestial.renderOrder = -20; celestial.frustumCulled = false; markEffect(celestial); scene.add(celestial);

  const cloudMaterial = createShaderMaterial({
    uniforms: { weatherMap, weatherReady, time: clock, density: { value: .3 }, wind: { value: 1 }, tint: { value: new THREE.Color('#627783') } },
    vertexShader: domeVertex,
    fragmentShader: `uniform float time,density,wind;uniform vec3 tint;varying vec3 direction;${turbulence}
    void main(){vec3 d=normalize(direction);if(d.y<-.06)discard;
    vec2 p=d.xz/max(.2,d.y+.4)*.42+vec2(time*.002,-time*.0008)*wind;
    float broad=weather(p),detail=weather(p*2.3+vec2(.17,time*.001*wind));
    float thickness=smoothstep(.32,.73,broad*.7+detail*.3);
    float horizon=smoothstep(-.04,.17,d.y)*(1.-smoothstep(.8,1.,d.y));
    float silver=pow(clamp(detail-broad+.35,0.,1.),3.);
    vec3 color=tint*(.54+broad*.52)+vec3(.15,.19,.21)*silver;
    gl_FragColor=vec4(color,thickness*horizon*density);${output}}`,
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false
  });
  const cloudDome = new THREE.Mesh(domeGeometry, cloudMaterial);
  cloudDome.name = 'Layered storm ceiling'; cloudDome.scale.setScalar(610);
  cloudDome.visible = false; cloudDome.renderOrder = -8; cloudDome.frustumCulled = false; markEffect(cloudDome); scene.add(cloudDome);

  const mistMaterial = createShaderMaterial({
    uniforms: { weatherMap, weatherReady, time: clock, density: { value: .1 }, tint: { value: new THREE.Color() } },
    vertexShader: `varying vec2 mistUv;varying float variation;
    void main(){mistUv=uv;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);variation=instanceMatrix[3].x*.01;
    center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
    gl_Position=projectionMatrix*center;}`,
    fragmentShader: `uniform float time,density;uniform vec3 tint;varying vec2 mistUv;varying float variation;${turbulence}
    void main(){vec2 p=mistUv-.5;float edge=1.-smoothstep(.16,.5,length(p));
    float cloud=weather(mistUv*.6+vec2(variation+time*.003,variation));
    gl_FragColor=vec4(tint,edge*smoothstep(.2,.7,cloud)*density);${output}}`,
    transparent: true, depthWrite: false, fog: false
  });
  const mist = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mistMaterial, 12);
  mist.name = 'Distant atmospheric haze'; mist.frustumCulled = false; mist.renderOrder = 2; mist.visible = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    dummy.position.set(Math.sin(angle) * 230, 19 + Math.sin(i * 2.3) * 8, Math.cos(angle) * 230);
    dummy.scale.set(115 + Math.sin(i * 1.7) * 25, 32 + Math.cos(i * 2.1) * 10, 1);
    dummy.updateMatrix(); mist.setMatrixAt(i, dummy.matrix);
  }
  mist.instanceMatrix.needsUpdate = true; markEffect(mist); scene.add(mist);
  const whiteout = new THREE.Color('#c4d4dd'), dawn = new THREE.Color('#ffb48f');
  for (const dome of [celestial, cloudDome]) dome.onBeforeRender = () => {
    dome.position.copy(camera.position); dome.updateMatrixWorld();
  };

  function requestWeather() {
    if (weatherRequested) return; weatherRequested = true;
    canvas.dataset.weatherTexture = 'loading';
    loader.load('/assets/storm-noise.webp', texture => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.NoColorSpace;
      weatherMap.value = texture; weatherReady.value = 1; canvas.dataset.weatherTexture = 'ready'; ready();
    }, undefined, () => { canvas.dataset.weatherTexture = 'fallback'; ready(); });
  }
  function requestNebula() {
    if (nebulaRequested) return; nebulaRequested = true;
    // The 4096-wide panorama only downloads where ULTRA can render it; phones keep the 1536 original.
    const ultra = canvas.dataset.qualityCeiling === 'ultra';
    canvas.dataset.nebulaTexture = 'loading'; canvas.dataset.nebulaResolution = ultra ? '4096' : '1536';
    loader.load(ultra ? '/assets/nebula-4k.webp' : '/assets/nebula.webp', texture => {
      texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping;
      celestialMaterial.uniforms.panorama.value = texture; celestialMaterial.uniforms.ready.value = 1;
      canvas.dataset.nebulaTexture = 'ready'; ready();
    }, undefined, () => { canvas.dataset.nebulaTexture = 'fallback'; ready(); });
  }
  return {
    update(t, config) {
      const space = Boolean(config.space), storm = config.id === 'day-after-tomorrow';
      const supercell = config.id === 'twister', ashfall = config.id === 'dantes-peak', instrumentality = config.id === 'evangelion';
      const quality = canvas.dataset.quality || 'high';
      clock.value = t; celestial.visible = space; cloudDome.visible = !space;
      mist.visible = !space && quality !== 'lite'; mist.count = quality === 'high' || quality === 'ultra' ? 12 : 6;
      if (space) requestNebula(); else requestWeather();
      celestialMaterial.uniforms.strength.value = config.id === 'interstellar' ? .22 : .35;
      celestial.rotation.y = .7;
      // The supercell ceiling is dense from the start; the ash ceiling thickens as the column spreads;
      // the superstorm ceiling races overhead and whitens as the blizzard closes in; the Third Impact
      // ceiling is a dusk-red haze that thickens as the giant rises and warms to dawn after the pulse.
      cloudMaterial.uniforms.density.value = storm ? .7 + clamp((t - 4) / 16) * .28 : supercell ? .74 : ashfall ? .26 + clamp((t - 8) / 14) * .52 : instrumentality ? .3 + clamp((t - 19) / 9) * .38 : .24;
      cloudMaterial.uniforms.wind.value = storm ? 5 + clamp(t / 20) * 7 : supercell ? 2.5 : instrumentality ? 1.8 : 1;
      cloudMaterial.uniforms.tint.value.set(storm ? '#597487' : supercell ? '#3d4b45' : ashfall ? '#4c4541' : instrumentality ? '#7d3b3d' : config.id === 'war-of-the-worlds' ? '#655e79' : '#82909a');
      if (storm) cloudMaterial.uniforms.tint.value.lerp(whiteout, clamp((t - 8) / 18) * .6);
      if (instrumentality) cloudMaterial.uniforms.tint.value.lerp(dawn, clamp((t - 22) / 8) * .75);
      mistMaterial.uniforms.tint.value.set(config.environment.fog);
      mistMaterial.uniforms.density.value = storm ? .23 + clamp((t - 6) / 20) * .22 : supercell ? .23 : ashfall ? .18 : instrumentality ? .16 : .11;
      canvas.dataset.atmosphere = space ? 'interstellar-dust' : storm ? 'superstorm' : supercell ? 'supercell' : ashfall ? 'ashfall' : instrumentality ? 'instrumentality' : 'layered-haze';
      canvas.dataset.atmosphereLayers = String(space || quality === 'lite' ? 1 : 2);
    }
  };
}
