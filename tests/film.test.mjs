import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { filmShader, applyFilmGrade } from '../dist/cinema.js';
import { sceneConfigs } from '../dist/scene-config.js';

test('film parameters restore exactly across scene changes and reverse scrubbing', () => {
  const uniforms = THREE.UniformsUtils.clone(filmShader.uniforms);
  const snapshot = () => Object.fromEntries(Object.entries(uniforms).map(([key, { value }]) => [key, value?.toArray ? value.toArray() : value]));
  const icy = sceneConfigs['day-after-tomorrow'].grade;
  applyFilmGrade(uniforms, 12.5, icy);
  const first = snapshot();
  assert.equal(first.frame, 300);
  assert.deepEqual(first.tint, icy.tint);
  assert.equal(first.saturation, icy.saturation);
  assert.equal(first.grain, icy.grain);
  assert.equal(first.aberration, icy.aberration);
  applyFilmGrade(uniforms, 28, sceneConfigs['terminator-2'].grade);
  applyFilmGrade(uniforms, 12.5, icy);
  assert.deepEqual(snapshot(), first);
});

test('grain frame advances at scene-time 24 fps boundaries, including backwards seeks', () => {
  const uniforms = THREE.UniformsUtils.clone(filmShader.uniforms);
  const grade = sceneConfigs.knowing.grade;
  for (const [time, expected] of [[0,0],[.01,0],[1 / 24,1],[2,48],[.02,0],[30,720]]) {
    applyFilmGrade(uniforms, time, grade);
    assert.equal(uniforms.frame.value, expected);
  }
});
