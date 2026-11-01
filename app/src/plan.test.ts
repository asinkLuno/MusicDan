import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, visibleRange } from './plan.ts';
import { defaults } from './types.ts';
const comments = Array.from({ length: 500 }, (_, i) => ({ commentId: i, content: `评论 ${i}`, liked_count: i, time: i }));
test('split screen reduces lanes and capacity while preserving popular comments', () => {
  const full = makePlan(comments, 180000, 600, defaults);
  const split = makePlan(comments, 180000, 80, defaults);
  assert.equal(full.lanes, 6); assert.equal(split.lanes, 2);
  assert.equal(full.list.length, 120); assert.equal(split.list.length, 40);
  assert.equal(split.list[0].commentId, 460);
  assert.ok(split.spacing * split.lanes >= defaults.crossSeconds * 1000);
});
test('playback-based visible range supports forward seek, rewind and song end', () => {
  assert.deepEqual(visibleRange(20000, 9000, 3000, 30), [4, 6]);
  assert.deepEqual(visibleRange(0, 9000, 3000, 30), [0, 0]);
  assert.deepEqual(visibleRange(120000, 9000, 3000, 30), [37, 29]);
});
test('duplicates do not consume lanes', () => {
  const plan = makePlan([comments[0], comments[0], comments[1]], 180000, 600, defaults);
  assert.equal(plan.list.length, 2);
});
