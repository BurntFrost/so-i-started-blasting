import {
  NodeMaterial, InstancedBufferGeometry, InstancedBufferAttribute, PlaneGeometry,
  DataTexture, Matrix3, Matrix4, RGBAFormat, UnsignedByteType
} from 'three/webgpu';
import {
  Fn, If, builtin, float, vec2, vec3, vec4, attribute, property, varyingProperty,
  reference, uniform, texture, renderGroup, modelWorldMatrix, modelViewMatrix,
  cameraProjectionMatrix, cameraViewMatrix, cameraPosition, frontFacing,
  screenCoordinate, screenSize, screenUV, viewportSize, uv, instancedBufferAttribute
} from 'three/tsl';
import { nodePrograms, shaderProgramKey } from './node-fields.js';
import { createSurfaceMaterial } from './node-surfaces.js';
import { particleCells } from './particle-atlas.js';

const emptyTexture = new DataTexture(new Uint8Array([255,255,255,255]),1,1,RGBAFormat,UnsignedByteType);
emptyTexture.needsUpdate=true;
// TSL depth reconstructs through view space. Legacy gl_FragCoord.z and soft
// particle intersections require the rasterizer's depth, including custom vertices.
const fragmentDepth=Fn(builder=>builtin(builder.getFragCoord().replace(/\.xy$/,'.z')))();
const materialProperties = ['color','opacity','transparent','side','depthTest','depthWrite','blending',
  'blendSrc','blendDst','blendEquation','premultipliedAlpha','toneMapped','fog','visible','alphaTest',
  'emissive','emissiveIntensity','roughness','metalness','envMapIntensity','map','normalMap','normalScale',
  'roughnessMap','metalnessMap','emissiveMap','aoMap','aoMapIntensity','alphaMap','vertexColors','flatShading'];

function linkedMaterial(source, target) {
  for (const key of materialProperties) if (key in source) {
    Object.defineProperty(target,key,{configurable:true,enumerable:true,get:()=>source[key],set:value=>{source[key]=value;}});
  }
  target.uniforms=source.uniforms;
  target.name=source.name;
  return target;
}

function uniformBinding(holder,type,renderer,key) {
  if (!holder) throw new Error(`Missing shader uniform ${key}`);
  if (type==='sampler2D') return texture(holder.value || emptyTexture).onRenderUpdate(()=>holder.value || emptyTexture);
  if (key==='opaqueProjectionInverse') {
    // Legacy field math reconstructs from GL NDC (-1..1); native WebGPU uses 0..1.
    const projection=new Matrix4(), zMap=new Matrix4().set(1,0,0,0, 0,1,0,0, 0,0,.5,.5, 0,0,0,1);
    return uniform(projection).onRenderUpdate(()=>{
      projection.copy(holder.value);
      if(renderer.backend.isWebGPUBackend)projection.multiply(zMap);
      return projection;
    });
  }
  // GLSL vec3 uniforms can be supplied as Color objects. Native uploaders read
  // xyz for vec3 and rgb for color; confusing them injects NaNs into bloom.
  const bindingType=type==='vec3'&&holder.value?.isColor?'color':type;
  return reference('value',bindingType,holder).setGroup(renderGroup);
}

function pointGeometry(source) {
  const geometry=new InstancedBufferGeometry();
  const quad=new PlaneGeometry(1,1);
  geometry.index=quad.index;
  for(const [key,value] of Object.entries(quad.attributes))geometry.setAttribute(key,value);
  const attributes=[];
  for(const [key,value] of Object.entries(source.attributes)) {
    const copy=new InstancedBufferAttribute(value.array,value.itemSize,value.normalized);
    copy.setUsage(value.usage);
    geometry.setAttribute(`point_${key}`,copy);
    attributes.push({source:value,copy,version:-1});
  }
  return {geometry,attributes};
}

function rawMaterial(source,object,renderer,points) {
  const key=shaderProgramKey(source), entry=nodePrograms[key];
  if(!entry)throw new Error(`Custom material has no generated TSL program: ${key}`);
  const bindings={uniforms:{},attributes:{},varyings:{},builtins:{}};
  for(const contract of [entry.interface.vertex,entry.interface.fragment]) {
    for(const [name,type] of Object.entries(contract.uniforms))bindings.uniforms[name] ||= uniformBinding(source.uniforms[name],type,renderer,name);
    for(const [name,type] of Object.entries(contract.attributes))bindings.attributes[name] ||= attribute(points?`point_${name}`:name,type);
    for(const [name,type] of Object.entries(contract.varyings))bindings.varyings[name] ||= varyingProperty(type);
  }
  const pointSize=property('float');
  const known={
    modelMatrix:modelWorldMatrix,modelViewMatrix,projectionMatrix:cameraProjectionMatrix,
    viewMatrix:cameraViewMatrix,cameraPosition,
    normalMatrix:uniform(new Matrix3()).onObjectUpdate(({object,camera},node)=>
      node.value.getNormalMatrix(new Matrix4().multiplyMatrices(camera.matrixWorldInverse,object.matrixWorld))),
    gl_FragCoord:vec4(screenCoordinate.x,screenSize.y.sub(screenCoordinate.y),fragmentDepth,1),
    gl_PointCoord:vec2(uv().x,uv().y.oneMinus()),gl_PointSize:pointSize,gl_FrontFacing:frontFacing
  };
  for(const contract of [entry.interface.vertex,entry.interface.fragment])for(const name of Object.keys(contract.builtins)) {
    if(name==='instanceMatrix') {
      if(!object.instanceMatrix)throw new Error('Instanced shader requires instanceMatrix');
      bindings.builtins[name]=instancedBufferAttribute(object.instanceMatrix,'mat4');
    } else {
      if(!known[name])throw new Error(`Unsupported native shader binding: ${name}`);
      bindings.builtins[name]=known[name];
    }
  }
  const program=entry.createProgram(bindings), material=linkedMaterial(source,new NodeMaterial());
  material.vertexNode=points?Fn(()=>{
    const clip=program.vertex().toVar();
    clip.xy.addAssign(attribute('position','vec3').xy.mul(pointSize).div(viewportSize).mul(2).mul(clip.w));
    return clip;
  })():program.vertex();
  material.fragmentNode=program.fragment();
  material.userData.programKey=key;
  return material;
}

function standardPoints(source,renderer,depthContext) {
  const material=linkedMaterial(source,new NodeMaterial()), point=attribute('point_position','vec3');
  // Built-in fog must use each particle's centre, not the unit quad's position.
  material.positionNode=point;
  const size=reference('size','float',source), opacity=reference('opacity','float',source);
  const color=reference('color','color',source);
  const dpr=uniform(renderer.getPixelRatio()).onRenderUpdate(()=>renderer.getPixelRatio());
  material.vertexNode=Fn(()=>{
    const view=modelViewMatrix.mul(vec4(point,1)), clip=cameraProjectionMatrix.mul(view).toVar();
    const pixels=source.sizeAttenuation?size.mul(viewportSize.y).mul(.5).div(view.z.negate()):size.mul(dpr);
    clip.xy.addAssign(attribute('position','vec3').xy.mul(pixels).div(viewportSize).mul(2).mul(clip.w));
    return clip;
  })();
  const descriptor=source.nodeParticle;
  const u=descriptor?Object.fromEntries(Object.entries(descriptor.uniforms).map(([key,holder])=>
    [key,key==='particleAtlas'||key==='opaqueDepth'?uniformBinding(holder,'sampler2D',renderer,key):null])):{};
  const atlasReady=descriptor?reference('value','float',descriptor.uniforms.particleAtlasReady):float(0);
  material.fragmentNode=Fn(()=>{
    const p=vec2(uv().x,uv().y.oneMinus()).sub(.5);
    const alpha=(descriptor?.kind==='stars'?p.length().smoothstep(.05,.5):p.length().mul(2).smoothstep(.1,1)).oneMinus().toVar();
    if(descriptor) {
      const [start,count]=particleCells[descriptor.kind], seed=attribute('point_particleSeed','float');
      If(atlasReady.greaterThan(.5),()=>{
        const angle=seed.mul(Math.PI*2), c=angle.cos(), s=angle.sin();
        const rotated=vec2(c.mul(p.x).add(s.mul(p.y)),c.mul(p.y).sub(s.mul(p.x))).add(.5);
        const cell=seed.min(.999999).mul(count).floor().add(start);
        const tile=vec2(cell.mod(4),float(3).sub(cell.div(4).floor()));
        const atlasUV=tile.mul(256).add(.5).add(vec2(rotated.x,rotated.y.oneMinus()).mul(255)).div(1024);
        alpha.assign(u.particleAtlas.sample(atlasUV).r);
        If(rotated.lessThan(vec2(0)).any().or(rotated.greaterThan(vec2(1)).any()),()=>{alpha.assign(0);});
      });
      if(depthContext.nodes) {
        const {available,near,far}=depthContext.nodes;
        const linear=value=>near.mul(far).div(far.sub(value.mul(far.sub(near))));
        const opaque=depthContext.nodes.texture.sample(screenUV).r;
        If(available.greaterThan(.5).and(opaque.lessThan(1)),()=>{
          alpha.mulAssign(linear(opaque).sub(linear(fragmentDepth)).smoothstep(0,reference('value','float',descriptor.uniforms.particleSoftness)));
        });
      }
    }
    const tint=source.vertexColors?color.mul(attribute('point_color','vec3')):color;
    return vec4(tint,alpha.mul(opacity));
  })();
  return material;
}

/** Swap render representations only while drawing. Factory updates retain their
 * original objects, geometries and material holders between frames and scrubs. */
export function createNodeMaterialAdapter(renderer,depthContext) {
  const cache=new WeakMap(), allocated=new Set();
  function stateFor(object,source,points) {
    let states=cache.get(object);
    if(!states){states=new Map();cache.set(object,states);}
    let state=states.get(source);
    if(!state || state.descriptor!==source.nodeSurface) {
      const material=source.isShaderMaterial?rawMaterial(source,object,renderer,points):
        source.nodeSurface?linkedMaterial(source,createSurfaceMaterial(source)):
        points?standardPoints(source,renderer,depthContext):source;
      state={material,descriptor:source.nodeSurface,version:source.version};
      if(material!==source)allocated.add(material);
      states.set(source,state);
    }
    if(state.version!==source.version){state.material.needsUpdate=true;state.version=source.version;}
    return state;
  }
  return {
    render(scene,draw) {
      const restore=[];
      try {
        scene.traverse(object=>{
          if(!object.material)return;
          const source=object.material, points=object.isPoints===true;
          const originals=[].concat(source);
          if(!points&&!originals.some(m=>m.isShaderMaterial||m.nodeSurface))return;
          const states=originals.map(m=>stateFor(object,m,points));
          restore.push({object,source,geometry:object.geometry,points});
          object.material=Array.isArray(source)?states.map(s=>s.material):states[0].material;
          if(points) {
            const state=states[0];
            if(!state.points || state.sourceGeometry!==object.geometry) {
              state.points=pointGeometry(object.geometry);state.sourceGeometry=object.geometry;
              allocated.add(state.points.geometry);
            }
            for(const item of state.points.attributes)if(item.version!==item.source.version){item.copy.needsUpdate=true;item.version=item.source.version;}
            if(object.geometry.drawRange.start!==0)throw new Error('Particle draw ranges must start at zero');
            state.points.geometry.instanceCount=Math.min(object.geometry.attributes.position.count,object.geometry.drawRange.count);
            object.geometry=state.points.geometry;object.isPoints=false;object.isMesh=true;
          }
        });
        return draw();
      } finally {
        for(const {object,source,geometry,points} of restore){object.material=source;object.geometry=geometry;if(points){object.isPoints=true;delete object.isMesh;}}
      }
    },
    dispose(){for(const resource of allocated)resource.dispose();allocated.clear();}
  };
}
