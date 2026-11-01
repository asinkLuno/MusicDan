import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackClock } from './playbackClock.ts';
import { defaults } from './types.ts';
import type { Snapshot } from './types.ts';
const snapshot = (position: number, sampledAt: number, playing = true, speed = 1): Snapshot => ({ sampledAt, nowPlaying: { title: 'song', artist: 'artist', album: '', duration: 180000, position, isPlaying: playing, playbackSpeed: speed }, permissionGranted: true, song: null, comments: [], revision: 1, settings: defaults, manualMatch: false, error: null, loading: false });
test('repeated backend sample does not reset progress at the frontend polling boundary', () => {
  const clock = new PlaybackClock();
  clock.update(snapshot(10000, 100000), 0, 100200);
  assert.equal(clock.position(750), 10950);
  clock.update(snapshot(10000, 100000), 750, 100950);
  assert.equal(clock.position(750), 10950);
  assert.equal(clock.position(1000), 11200);
});
test('fresh sample compensates delivery latency and small drift without a backward jump', () => {
  const clock = new PlaybackClock();
  clock.update(snapshot(10000, 100000), 0, 100000);
  clock.update(snapshot(10980, 101000), 1200, 101200);
  assert.equal(clock.position(1200), 11200);
  assert.ok(clock.position(1208) > clock.position(1200));
  assert.equal(clock.position(1700), 11680);
});
test('seek, pause, playback speed change and track change apply immediately', () => {
  const clock = new PlaybackClock();
  clock.update(snapshot(10000, 100000), 0, 100000);
  clock.update(snapshot(60000, 101000), 1000, 101000);
  assert.equal(clock.position(1000), 60000);
  clock.update(snapshot(62000, 102000, false), 2000, 102000);
  assert.equal(clock.position(9000), 62000);
  clock.update(snapshot(62000, 109000, true, 2), 9000, 109000);
  assert.equal(clock.position(10000), 64000);
  const next = snapshot(0, 110000); next.nowPlaying!.title = 'another song';
  clock.update(next, 10000, 110000);
  assert.equal(clock.position(10000), 0);
});
