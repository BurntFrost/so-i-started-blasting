import test from 'node:test';
import assert from 'node:assert/strict';

// Temporary negative verification of GitHub's required quality check. NEVER MERGE.
test('DELIBERATE FAILURE: required quality gate must block this draft PR', () => {
  assert.fail('Expected negative test: the required quality check must reject this PR.');
});
