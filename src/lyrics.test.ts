import assert from 'node:assert/strict';
import test from 'node:test';
import { activeLine, parseLrc, parseYrc } from './lyrics.ts';

test('LRC supports repeated timestamps, fractions, offsets and instrumental gaps', () => {
  const lines = parseLrc('[offset:-100]\n[00:01.20][00:03.200]hello\n[00:02.00]\n[ar:artist]');
  assert.deepEqual(lines.map(line => [line.start, line.text]), [[1100, 'hello'], [1900, ''], [3100, 'hello']]);
  assert.equal(activeLine(lines, 0), -1);
  assert.equal(activeLine(lines, 1900), 1);
  assert.equal(activeLine(lines, 9999), 2);
});

test('YRC ignores metadata and preserves absolute word timings', () => {
  const lines = parseYrc('{"t":0,"c":[]}\n[1000,800](1000,200,0)你(1200,600,0)好\nmalformed');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, '你好');
  assert.deepEqual(lines[0].words[1], { start: 1200, end: 1800, text: '好' });
  assert.equal(lines[0].end, 1800);
  assert.deepEqual(parseYrc(''), []);
});
