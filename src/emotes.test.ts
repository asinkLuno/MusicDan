import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEmoteImage, parseSegments, removeEmoteListener } from './emotes.ts';
const emote = (name: string, id: number) => ({ type: 'emote', name, url: `https://s1.music.126.net/style/web2/emt/emoji_${id}.png` });
test('splits known emotes and preserves plain or unknown text', () => {
  assert.deepEqual(parseSegments('打卡[爱心]'), [{ type: 'text', text: '打卡' }, emote('爱心', 33)]);
  assert.deepEqual(parseSegments('[doge]你好'), [{ type: 'text', text: '[doge]你好' }]);
  assert.deepEqual(parseSegments('晴天'), [{ type: 'text', text: '晴天' }]);
  assert.deepEqual(parseSegments('[大笑][呲牙]'), [emote('大笑', 86), emote('呲牙', 343)]);
  assert.deepEqual(parseSegments('[doge][爱心][constructor]'), [{ type: 'text', text: '[doge]' }, emote('爱心', 33), { type: 'text', text: '[constructor]' }]);
  assert.deepEqual(parseSegments(''), [{ type: 'text', text: '' }]);
});
test('deduplicates images, notifies pending consumers and releases listeners', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const images: MockImage[] = [];
  class MockImage {
    src = '';
    onload = () => {};
    onerror = () => {};
    constructor() { images.push(this); }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage });
  try {
    let first = 0, second = 0;
    const listener = () => { first++; };
    const next = () => { second++; };
    assert.equal(getEmoteImage('test:loaded', listener), null);
    assert.equal(getEmoteImage('test:loaded', listener), null);
    assert.equal(getEmoteImage('test:loaded', next), null);
    assert.equal(images.length, 1);
    removeEmoteListener(listener);
    images[0].onload();
    assert.equal(first, 0); assert.equal(second, 1);
    assert.equal(getEmoteImage('test:loaded', next), images[0]);
    assert.equal(getEmoteImage('test:failed', next), null);
    images[1].onerror();
    assert.equal(getEmoteImage('test:failed', next), null);
    assert.equal(images.length, 2); assert.equal(second, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'Image', original);
    else Reflect.deleteProperty(globalThis, 'Image');
  }
});
