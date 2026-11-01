import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationsMatch } from './types.ts';
test('duration agreement uses the backend tight-match tolerance and requires known durations', () => {
  assert.equal(durationsMatch(180000, 180000), true);
  assert.equal(durationsMatch(181500, 180000), true);
  assert.equal(durationsMatch(178500, 180000), true);
  assert.equal(durationsMatch(181501, 180000), false);
  assert.equal(durationsMatch(0, 0), false);
  assert.equal(durationsMatch(180000, 0), false);
  assert.equal(durationsMatch(-1, 1000), false);
});
