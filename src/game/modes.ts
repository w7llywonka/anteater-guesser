import { MODES, TARGET, ZONES, type ModeId, type ZoneId } from '../config';
import { offsetMeters, project } from '../util/geo';
import { hashString, mulberry32 } from '../util/rng';
import { isLand } from './land';
import type { Camera } from '../map/MapView';

export interface GameConfig {
  mode: ModeId;
  zone: ZoneId;
  rounds: number;
  labels: boolean;
  seed: number;
}

export const ROUND_OPTIONS = [1, 3, 5] as const;

/** Leaderboard bucket: runs only compete with runs that had identical rules. */
export function categoryKey(c: GameConfig): string {
  const base = c.mode === 'daily' ? 'daily' : `drop-${c.zone}`;
  return `${base}-${c.rounds}r${c.labels ? '-labels' : ''}`;
}

export function categoryName(c: GameConfig): string {
  const m = c.mode === 'drop' ? (c.zone === 'world' ? MODES.drop.name : `Local Drop · ${ZONES[c.zone].name}`) : MODES[c.mode].name;
  return `${m} · ${c.rounds} round${c.rounds > 1 ? 's' : ''}${c.labels ? ' · Labels' : ''}`;
}

export function todayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Day number since launch, for "Daily #42" labels. */
export function dailyNumber(d = new Date()): number {
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2026, 9, 1)) / 86400000) + 1;
}

export function dailyConfig(d = new Date()): GameConfig {
  return { mode: 'daily', zone: 'world', rounds: 3, labels: false, seed: hashString(`daily:${todayKey(d)}`) };
}

/**
 * Start camera for every round, derived from the seed so a challenge link reproduces the
 * exact same drops. Normal runs roll a fresh seed every time, so there is nothing to learn
 * by heart.
 */
export function roundStarts(cfg: GameConfig): Camera[] {
  const rnd = mulberry32(cfg.seed ^ 0x5bd1e995);
  const out: Camera[] = [];
  for (let i = 0; i < cfg.rounds; i++) {
    const zone = ZONES[cfg.mode === 'daily' ? 'world' : cfg.zone];
    let lat: number;
    let lng: number;
    if (zone.radiusKm === 0) {
      // Uniform on the sphere between 58°S and 72°N, rejecting open ocean so there is
      // always something to look at. Deterministic: same seed, same drops.
      const s0 = Math.sin((-58 * Math.PI) / 180);
      const s1 = Math.sin((72 * Math.PI) / 180);
      let tries = 0;
      do {
        lat = (Math.asin(s0 + (s1 - s0) * rnd()) * 180) / Math.PI;
        lng = rnd() * 360 - 180;
      } while (!isLand(lat, lng) && ++tries < 200);
    } else {
      // Uniform in an annulus so we never spawn right on top of the house.
      const rMin = Math.min(0.8, zone.radiusKm * 0.2) * 1000;
      const rMax = zone.radiusKm * 1000;
      const r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin));
      const a = rnd() * Math.PI * 2;
      ({ lat, lng } = offsetMeters(TARGET, Math.cos(a) * r, Math.sin(a) * r));
    }
    const p = project(lat, lng);
    const z = zone.startZoom + Math.floor(rnd() * 5) * 0.5;
    out.push({ x: p.x, y: p.y, z });
  }
  return out;
}
