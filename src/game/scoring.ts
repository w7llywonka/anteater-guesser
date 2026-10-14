import { ON_TARGET_M, TARGET_FOOTPRINT } from '../config';
import { distanceToPolygon, unproject, type Pt } from '../util/geo';

export const MAX_ACC = 5000;
export const MAX_SPEED = 5000;
export const MAX_ROUND = MAX_ACC + MAX_SPEED;

/** Metres from a world point to the nearest edge of the house (0 = on the roof). */
export function distanceToTarget(p: Pt): number {
  return distanceToPolygon(unproject(p.x, p.y), TARGET_FOOTPRINT);
}

/**
 * Accuracy: a sharp curve for the neighbourhood plus a long tail so landing in the right
 * city still earns something. 0 m = 5000, 10 m ≈ 4600, 100 m ≈ 2400, 2 km ≈ 450.
 */
export function accuracyPoints(d: number): number {
  if (!Number.isFinite(d)) return 0;
  return Math.round(4000 * Math.exp(-d / 100) + 1000 * Math.exp(-d / 2500));
}

/** Fraction of speed points kept after t ms: a 3 s grace window, then exponential decay. */
export function speedFraction(ms: number): number {
  return Math.exp(-Math.max(0, ms / 1000 - 3) / 30);
}

/** Speed is scaled by accuracy so slapping a random pin down instantly is worthless. */
export function speedPoints(ms: number, acc: number): number {
  return Math.round(MAX_SPEED * speedFraction(ms) * (acc / MAX_ACC));
}

export interface RoundScore {
  time: number;
  dist: number;
  acc: number;
  speed: number;
  total: number;
  onTarget: boolean;
}

export function scoreRound(pin: Pt | null, time: number): RoundScore {
  if (!pin) return { time, dist: Infinity, acc: 0, speed: 0, total: 0, onTarget: false };
  const dist = distanceToTarget(pin);
  const acc = accuracyPoints(dist);
  const speed = speedPoints(time, acc);
  return { time, dist, acc, speed, total: acc + speed, onTarget: dist <= ON_TARGET_M };
}

export function rankLabel(total: number, max: number): string {
  const f = total / max;
  if (f >= 0.95) return 'S+';
  if (f >= 0.9) return 'S';
  if (f >= 0.8) return 'A';
  if (f >= 0.65) return 'B';
  if (f >= 0.45) return 'C';
  if (f >= 0.25) return 'D';
  return 'F';
}
