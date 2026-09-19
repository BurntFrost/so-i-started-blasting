import test from 'node:test';
import assert from 'node:assert/strict';
import { frameMetrics, summarize } from '../tools/performance/metrics.mjs';

test('frame percentiles retain rare stalls that an average can hide',()=>{
  const data=[...Array(356).fill(16.7),50,100,100,100];
  const result=frameMetrics(data);
  assert.equal(result.count,360);
  assert.equal(result.p95,16.7);
  assert.equal(result.p99,50);
  assert.equal(result.max,100);
  assert.equal(result.over25ms,4);
  assert.equal(result.over50ms,3);
});

test('absent Event Timing samples are unavailable, never zero latency',()=>{
  assert.deepEqual(summarize([]),{count:0,median:null,p95:null,p99:null,max:null});
});
