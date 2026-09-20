import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldUpgradeSky } from '../dist/sky-loading.js';

test('ULTRA upgrades after startup when network information is absent or fast', () => {
  for (const connection of [undefined, {}, { effectiveType: '4g' }]) {
    assert.equal(shouldUpgradeSky({ quality: 'ultra', ceiling: 'ultra', connection }), true);
  }
});

test('data saving, slow networks, and lowered quality keep the base panorama', () => {
  for (const connection of [{ saveData: true }, ...['slow-2g', '2g', '3g'].map(effectiveType => ({ effectiveType }))]) {
    assert.equal(shouldUpgradeSky({ quality: 'ultra', ceiling: 'ultra', connection }), false);
  }
  for (const tier of ['lite', 'balanced', 'high']) {
    assert.equal(shouldUpgradeSky({ quality: tier, ceiling: 'ultra' }), false);
    assert.equal(shouldUpgradeSky({ quality: 'ultra', ceiling: tier }), false);
  }
});
