import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveQuality } from '../dist/adaptive-quality.js';

function run(governor,fps,seconds){
  const changes=[];
  for(let i=0;i<Math.ceil(fps*seconds);i++){
    const result=governor.measure(1/fps,true);
    if(result?.reason)changes.push(result);
  }
  return changes;
}

test('sustained 45 FPS reduces resolution before detail and responds within two seconds',()=>{
  const governor=createAdaptiveQuality(2,2);
  const changes=run(governor,45,1.5);
  assert.deepEqual(changes.map(({level,scale})=>({level,scale})),[{level:2,scale:.9}]);
  assert.equal(run(governor,45,4).at(-1).level,1);
});

test('one long frame does not lower quality, while repeated frame spikes do',()=>{
  const governor=createAdaptiveQuality(2,2);
  run(governor,60,1);
  governor.measure(.1,true);
  assert.equal(run(governor,60,3).length,0);
  const changes=[];
  for(let i=0;i<120;i++){
    const value=governor.measure(i%4===0?.04:1/60,true);
    if(value?.reason)changes.push(value);
  }
  assert.equal(changes[0].reason,'resolution-slow');
});

test('paused, hidden, invalid and resumed intervals cannot drive quality decisions',()=>{
  const governor=createAdaptiveQuality(2,2);
  for(const delta of [0,-1,NaN,Infinity,5])assert.equal(governor.measure(delta,true),null);
  for(let i=0;i<30;i++){
    governor.measure(0,false);
    assert.equal(governor.measure(.8,true),null,'first frame after idle is not an active frame interval');
  }
  assert.equal(run(governor,60,3).length,0);
});

test('recovery needs sustained headroom, respects ceiling and never oscillates near 55 FPS',()=>{
  const governor=createAdaptiveQuality(2,2);
  run(governor,45,1.5);
  assert.equal(run(governor,55,10).length,0);
  assert.equal(run(governor,60,6).length,0);
  const recovered=run(governor,60,4);
  assert.equal(recovered.length,1);
  assert.equal(recovered[0].scale,1);
  assert.equal(run(governor,120,12).length,0);
});

test('viewport ceiling immediately drops detail and sustained load stops at the quality floor',()=>{
  const governor=createAdaptiveQuality(3,3);
  assert.deepEqual(governor.setCeiling(1),{level:1,scale:1,reason:'viewport'});
  const changes=run(governor,20,30);
  assert.equal(changes.at(-1).level,0);
  assert.equal(changes.at(-1).scale,.8);
  assert.equal(run(governor,20,20).length,0);
});
