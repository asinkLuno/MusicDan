import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentFontSize, commentKey, crossingDuration, makePlan, pinDurationMs, readingDurationMs, visibleRange } from './plan.ts';
import { defaults } from './types.ts';
const comments = Array.from({ length: 500 }, (_, i) => ({ commentId: i, content: `评论 ${i}`, liked_count: i, time: i }));
test('auto tracks fit the viewport and retain every comment even when overlapping', () => {
  const full = makePlan(comments, 180000, 600, defaults);
  const split = makePlan(comments, 180000, 80, defaults);
  assert.equal(full.lanes, 20); assert.equal(split.lanes, 2);
  assert.equal(full.list.length, 500); assert.equal(split.list.length, 500);
  assert.deepEqual(full.list.map(c => c.commentId), comments.map(c => c.commentId));
  assert.ok(split.spacing * split.lanes < crossingDuration(400, 16, split.lanes, 500, 180000));
});
test('crossing adapts to screen width and density and stays bounded', () => {
  assert.ok(crossingDuration(1000, 16, 20, 100, 180000) > crossingDuration(400, 16, 20, 100, 180000));
  assert.ok(crossingDuration(1000, 16, 20, 50000, 180000) < crossingDuration(1000, 16, 20, 100, 180000));
  assert.equal(crossingDuration(400, 16, 1, 1000000, 180000), 3000);
  assert.equal(crossingDuration(4000, 16, 100, 1, 180000), 12000);
  assert.equal(makePlan([], 0, 0, defaults).lanes, 1);
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

test('identical text preserves occurrences while repeated API IDs count once', () => {
  const first = { ...comments[0], occurrences: 3 };
  const other = { ...comments[0], commentId: 999, liked_count: 10 };
  const plan = makePlan([first, first, other], 180000, 600, defaults);
  assert.equal(plan.list.length, 1);
  assert.equal(plan.list[0].occurrences, 4);
  assert.equal(plan.list[0].liked_count, 10);
  assert.equal(first.occurrences, 3);
});

test('similar comments merge before applying display cap and use the earliest timestamp', () => {
  const data = [
    { commentId: 1, content: '好听！！', liked_count: 1, time: 10 },
    { commentId: 2, content: ' 好听 好听! ', liked_count: 30, time: 30 },
    { commentId: 3, content: '不好听', liked_count: 20, time: 20 },
    { commentId: 4, content: '打卡', liked_count: 2, time: 5 },
  ];
  const plan = makePlan(data, 180000, 600, { ...defaults, commentLimit: 2 });
  assert.equal(plan.list.length, 2);
  assert.equal(plan.list[0].content, ' 好听 好听! ');
  assert.equal(plan.list[0].occurrences, 2);
  assert.equal(plan.list[0].time, 10);
  assert.equal(plan.list[1].content, '不好听');
  assert.equal(data[1].time, 30);
  assert.equal(commentKey('[爱心][爱心]'), commentKey('[爱心]'));
  assert.notEqual(commentKey('2020'), commentKey('20'));
  assert.notEqual(commentKey('好听'), commentKey('不好听'));
});
test('frequent merged comments grow in size with a bounded maximum', () => {
  assert.equal(commentFontSize(16, 1), 16);
  assert.ok(commentFontSize(16, 4) > commentFontSize(16, 2));
  assert.equal(commentFontSize(16, 1000), 32);
  assert.equal(commentFontSize(16, 0), 16);
});
test('comments that read slower than they fly get pinned to the top queue', () => {
  const short = { commentId: 1, content: '好听', liked_count: 1, time: 1 };
  const long = { commentId: 2, content: '这段旋律从第一次听到现在已经循环了整整一个星期，每次副歌起来还是起鸡皮疙瘩', liked_count: 2, time: 2 };
  const plan = makePlan([short, long], 60000, 600, defaults, 360);
  assert.deepEqual(plan.list.map(c => c.content), ['好听']);
  assert.deepEqual(plan.pinned.list.map(c => c.content), [long.content]);
  assert.equal(plan.crossing, crossingDuration(360, defaults.fontSize, plan.lanes, plan.list.length, 60000));
});
test('pinned mode off keeps every comment in the flow', () => {
  const long = { commentId: 1, content: '长'.repeat(60), liked_count: 1, time: 1 };
  const plan = makePlan([long], 60000, 600, { ...defaults, pinLongComments: false }, 360);
  assert.equal(plan.list.length, 1);
  assert.equal(plan.pinned.list.length, 0);
});
test('pin dwell grows with length and stays bounded; reading time grows with content', () => {
  assert.equal(pinDurationMs('好听'), 6000);
  assert.ok(pinDurationMs('长'.repeat(200)) === 12000);
  assert.ok(pinDurationMs('长'.repeat(50)) > pinDurationMs('好听'));
  assert.ok(readingDurationMs('x'.repeat(50)) > readingDurationMs('x'.repeat(10)));
});
