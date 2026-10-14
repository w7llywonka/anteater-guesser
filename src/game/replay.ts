import type { Camera } from '../map/MapView';
import type { PinEvent, Sample } from './runs';

/** Interpolated camera at time t (ms since GO). */
export function trackAt(track: Sample[], t: number): Camera | null {
  const n = track.length;
  if (!n) return null;
  if (t <= track[0].t) return { x: track[0].x, y: track[0].y, z: track[0].z };
  if (t >= track[n - 1].t) return { x: track[n - 1].x, y: track[n - 1].y, z: track[n - 1].z };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  // Interpolate position in screen space of the zoom path so pans during zooms don't swim.
  const z = a.z + (b.z - a.z) * k;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z };
}

/** Latest pin placed at or before t. */
export function pinAt(pins: PinEvent[], t: number): PinEvent | null {
  let p: PinEvent | null = null;
  for (const e of pins) {
    if (e.t > t) break;
    p = e;
  }
  return p;
}

/** Records the camera at up to ~12 Hz, keeping the last pose before every pause. */
export class TrackRecorder {
  readonly track: Sample[] = [];
  private pending: Sample | null = null;

  push(t: number, cam: Camera) {
    const s: Sample = { t, x: cam.x, y: cam.y, z: cam.z };
    const last = this.track[this.track.length - 1];
    if (!last || t - last.t >= 80) {
      if (this.pending && last && t - this.pending.t > 80) this.track.push(this.pending);
      this.track.push(s);
      this.pending = null;
    } else this.pending = s;
  }

  finish(t: number, cam: Camera) {
    if (this.pending) this.track.push(this.pending);
    this.pending = null;
    const last = this.track[this.track.length - 1];
    if (!last || last.x !== cam.x || last.y !== cam.y || last.z !== cam.z) this.track.push({ t, x: cam.x, y: cam.y, z: cam.z });
  }
}
