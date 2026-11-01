import { trackKey } from './types.ts';
import type { Snapshot } from './types.ts';

/** A monotonic animation clock; repeated reads of the same backend sample never rewind it. */
export class PlaybackClock {
  private key = '';
  private sample = -1;
  private playing = false;
  private speed = 1;
  private base = 0;
  private at = 0;
  private correction = 0;
  private correctionMs = 500;

  position(now: number): number {
    if (!this.playing) return this.base;
    const elapsed = Math.max(0, now - this.at);
    return this.base + elapsed * this.speed + this.correction * Math.min(1, elapsed / this.correctionMs);
  }

  update(snapshot: Snapshot | null, now: number, wallNow: number): void {
    const np = snapshot?.nowPlaying;
    if (!np) { this.key = ''; this.sample = -1; this.playing = false; this.base = 0; return; }
    const key = trackKey(np);
    const sampledAt = snapshot.sampledAt;
    const playing = np.isPlaying;
    const speed = np.playbackSpeed;
    if (key === this.key && sampledAt === this.sample && playing === this.playing && speed === this.speed) return;
    const target = np.position + (playing ? Math.max(0, wallNow - sampledAt) * speed : 0);
    const current = this.position(now);
    const reset = key !== this.key || playing !== this.playing || speed !== this.speed || Math.abs(target - current) > 1500;
    this.base = reset ? target : current;
    this.correction = reset ? 0 : target - current;
    // Keep ordinary corrections below half of playback speed, so animation continues forward.
    this.correctionMs = Math.max(500, Math.abs(this.correction) * 2 / Math.max(.1, speed));
    this.at = now;
    this.key = key;
    this.sample = sampledAt;
    this.playing = playing;
    this.speed = speed;
  }
}
