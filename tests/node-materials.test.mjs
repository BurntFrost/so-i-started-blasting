import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNodeMaterialAdapter } from '../dist/node-materials.js';
import { recordSurface } from '../dist/shader-program.js';
import { nodePrograms, shaderProgramKey } from '../dist/node-fields.js';
import { vec4 } from 'three/tsl';
import NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import NodeUniform from 'three/src/nodes/core/NodeUniform.js';
import UniformsGroup from 'three/src/renderers/common/UniformsGroup.js';
import { WebGPURenderer } from 'three/webgpu';

const renderer = () => ({backend:{isWebGPUBackend:false},getPixelRatio:()=>2});
for(const forceWebGL of [false,true])test(`raw fragment depth uses rasterized ${forceWebGL?'GLSL':'WGSL'} depth with custom vertices`,t=>{
  const canvas={width:128,height:128,style:{},addEventListener(){},setAttribute(){},
    getContext(){throw new Error('CPU shader test must not access a GPU');}};
  const render=new WebGPURenderer({canvas,forceWebGL});
  render.backend.capabilities={getUniformBufferLimit:()=>65536};
  render.hasFeature=()=>false;render.hasCompatibility=()=>true;
  if(forceWebGL)render.backend.extensions={has:()=>false,get:()=>null};
  else render.backend.utils={getTextureSampleData:()=>({primarySamples:1})};
  const source=new THREE.ShaderMaterial({
    vertexShader:'void main(){gl_Position=vec4(position.xy,.6,2.);}',
    fragmentShader:'void main(){gl_FragColor=vec4(gl_FragCoord.z);}'});
  const key=shaderProgramKey(source),previous=nodePrograms[key];
  nodePrograms[key]={interface:{vertex:{uniforms:{},attributes:{},varyings:{},builtins:{}},
    fragment:{uniforms:{},attributes:{},varyings:{},builtins:{gl_FragCoord:'vec4'}}},
    createProgram({builtins}){return {vertex:()=>vec4(0,0,.6,2),fragment:()=>vec4(builtins.gl_FragCoord.z)};}};
  const scene=new THREE.Scene(),object=new THREE.Mesh(new THREE.PlaneGeometry(),source);
  scene.add(object);const adapter=createNodeMaterialAdapter(render,canvas);
  t.after(()=>{if(previous)nodePrograms[key]=previous;else delete nodePrograms[key];
    adapter.dispose();object.geometry.dispose();source.dispose();});
  adapter.render(scene,()=>{
    const builder=render.backend.createNodeBuilder(object,render);
    builder.scene=scene;builder.camera=new THREE.PerspectiveCamera();builder.build();
    assert.match(builder.fragmentShader,forceWebGL?/gl_FragCoord\.z/:/fragCoord\.z/);
    assert.doesNotMatch(builder.fragmentShader,/v_clipSpace|positionView/,
      'fragment depth must not round-trip interpolated clip coordinates through view space');
  });
});

test('raw adapter uploads Color vec3 holders as finite RGB and retains live vector bindings', t => {
  const uniforms={tint:{value:new THREE.Color(.2,.4,.6)},origin:{value:new THREE.Vector3(7,8,9)}};
  const source=new THREE.ShaderMaterial({uniforms,
    vertexShader:'void main(){gl_Position=vec4(position,1.);}',
    fragmentShader:'uniform vec3 tint,origin;void main(){gl_FragColor=vec4(tint+origin,1.);}'});
  const key=shaderProgramKey(source), previous=nodePrograms[key];
  let bindings;
  // Capture the adapter's actual bindings at the generated-program boundary.
  // Shader compilation is unnecessary: exercise r186's real CPU uploader below.
  nodePrograms[key]={interface:{vertex:{uniforms:{},attributes:{},varyings:{},builtins:{}},
    fragment:{uniforms:{tint:'vec3',origin:'vec3'},attributes:{},varyings:{},builtins:{}}},
    createProgram(input){bindings=input;return {vertex:()=>vec4(0,0,0,1),fragment:()=>vec4(1)};}};
  const scene=new THREE.Scene(), object=new THREE.Mesh(new THREE.BoxGeometry(),source);
  scene.add(object);
  const adapter=createNodeMaterialAdapter(renderer(),{});
  t.after(()=>{
    if(previous)nodePrograms[key]=previous;else delete nodePrograms[key];
    adapter.dispose();object.geometry.dispose();source.dispose();
  });
  adapter.render(scene,()=>assert.ok(object.material.isNodeMaterial));
  const builder=new NodeBuilder(object,renderer(),null), group=new UniformsGroup('raw-colors');
  const uploads=Object.entries(bindings.uniforms).map(([name,binding])=>{
    assert.equal(binding.object,uniforms[name]);
    const node=binding.setup(), uniform=new NodeUniform(name,node.getNodeType(builder),node);
    const upload=builder.getNodeUniform(uniform,uniform.type);
    group.addUniform(upload);
    return upload;
  });
  function check(expected){
    for(const binding of Object.values(bindings.uniforms))binding.update();
    group.update();
    const actual=uploads.map(upload=>Array.from(group.buffer.slice(upload.offset,upload.offset+3)));
    assert.ok(actual.flat().every(Number.isFinite),'raw uniforms must never upload NaN');
    assert.deepEqual(actual,expected.map(values=>values.map(Math.fround)));
  }
  check([[.2,.4,.6],[7,8,9]]);
  uniforms.tint.value.setRGB(.9,.1,.3);uniforms.origin.value.set(-2,4,6);
  check([[.9,.1,.3],[-2,4,6]]);
  uniforms.tint.value=new THREE.Color(.5,.25,.75);
  check([[.5,.25,.75],[-2,4,6]]);
});

test('point draw ranges become quad instance counts and original factory state survives failed rendering', () => {
  const scene=new THREE.Scene(), geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,2,3,4,5,6],3));
  geometry.setDrawRange(0,2);
  const material=new THREE.PointsMaterial({size:3,transparent:true,depthWrite:false});
  const points=new THREE.Points(geometry,material);scene.add(points);
  const adapter=createNodeMaterialAdapter(renderer(),{});
  let renderedGeometry;
  assert.throws(()=>adapter.render(scene,()=>{
    assert.equal(points.isPoints,false);assert.equal(points.isMesh,true);
    assert.equal(points.geometry.instanceCount,2);assert.equal(points.geometry.index.count,6);
    assert.equal(points.material.isNodeMaterial,true);
    assert.equal(points.material.depthWrite,false);
    renderedGeometry=points.geometry;
    throw new Error('lost device');
  }),/lost device/);
  assert.equal(points.geometry,geometry);assert.equal(points.material,material);assert.equal(points.isPoints,true);
  assert.equal(points.isMesh,undefined);
  geometry.attributes.position.setXYZ(0,10,20,30);geometry.attributes.position.needsUpdate=true;
  geometry.setDrawRange(0,1);material.opacity=.2;
  adapter.render(scene,()=>{
    assert.equal(points.geometry,renderedGeometry);
    assert.equal(points.geometry.instanceCount,1);
    assert.equal(points.geometry.attributes.point_position.getX(0),10);
    assert.equal(points.material.opacity,.2);
  });
  adapter.dispose();geometry.dispose();material.dispose();
});

test('surface material conversion retains live CPU properties and shared uniform holders', () => {
  const scene=new THREE.Scene(), source=new THREE.MeshStandardMaterial({color:'#123456'});
  const ash={value:0};recordSurface(source,{kind:'mountain',uniforms:{ashFall:ash}});
  const object=new THREE.Mesh(new THREE.BoxGeometry(),source);scene.add(object);
  const adapter=createNodeMaterialAdapter(renderer(),{});
  let converted;
  adapter.render(scene,()=>{converted=object.material;assert.notEqual(converted,source);assert.equal(converted.color,source.color);});
  ash.value=.9;source.opacity=.3;source.roughness=.8;
  adapter.render(scene,()=>{
    assert.equal(object.material,converted);
    assert.equal(object.material.opacity,.3);assert.equal(object.material.roughness,.8);
    assert.equal(object.material.nodeSurface.uniforms.ashFall,ash);
  });
  assert.equal(object.material,source);
  adapter.dispose();object.geometry.dispose();source.dispose();
});
