import { describe, expect, it } from 'vitest';
import { TARGET } from '../src/config';
import { project, unproject } from '../src/util/geo';
import { accuracyPoints, scoreRound, speedPoints, MAX_ROUND } from '../src/game/scoring';
import { decodeRun, encodeRun, runFromCode, runToCode, summarize, type RunData } from '../src/game/runs';
import { categoryKey, roundStarts, type GameConfig } from '../src/game/modes';
import { isLand } from '../src/game/land';
import { DEFAULT_AVATAR } from '../src/profile/items';
import { xpForLevel, levelFromXp } from '../src/profile/profile';

const target = project(TARGET.lat, TARGET.lng);

describe('scoring', () => {
  it('gives full accuracy on the roof and decays with distance', () => {
    expect(accuracyPoints(0)).toBe(5000);
    expect(accuracyPoints(10)).toBeGreaterThan(4500);
    expect(accuracyPoints(100)).toBeLessThan(2500);
    expect(accuracyPoints(50_000)).toBe(0);
  });

  it('scales speed by accuracy so a fast wrong pin is worthless', () => {
    expect(speedPoints(1000, 5000)).toBe(5000);
    expect(speedPoints(1000, 0)).toBe(0);
    expect(speedPoints(20_000, 5000)).toBeLessThan(speedPoints(10_000, 5000));
  });

  it('scores a pin on the house as on target', () => {
    const s = scoreRound(target, 8000);
    expect(s.dist).toBe(0);
    expect(s.onTarget).toBe(true);
    expect(s.total).toBeLessThanOrEqual(MAX_ROUND);
    expect(scoreRound(null, 120_000).total).toBe(0);
  });
});

describe('run links', () => {
  const cfg: GameConfig = { mode: 'drop', zone: 'world', rounds: 2, seed: 123456789 };
  const run: RunData = {
    cfg,
    date: Date.UTC(2026, 9, 14, 12, 0),
    player: { name: 'Zot', level: 7, av: { ...DEFAULT_AVATAR, hat: 'crown' } },
    vw: 1280,
    vh: 800,
    rounds: [
      {
        time: 9876,
        pin: target,
        pins: [{ t: 9000, x: target.x, y: target.y }],
        track: Array.from({ length: 60 }, (_, i) => ({ t: i * 90, x: 0.3 + i * 1e-3, y: 0.4 - i * 5e-4, z: 5 + i / 5 })),
      },
      { time: 120_000, pin: null, pins: [], track: [{ t: 0, x: 0.5, y: 0.5, z: 6 }] },
    ],
    vs: { name: 'Peter', total: 12_345, time: 33_000 },
  };

  it('round-trips through the binary codec', () => {
    const back = decodeRun(encodeRun(run));
    expect(back.verified).toBe(true);
    expect(back.cfg).toEqual(cfg);
    expect(back.player.name).toBe('Zot');
    expect(back.player.av.hat).toBe('crown');
    expect(back.vs).toEqual(run.vs);
    expect(back.rounds[1].pin).toBeNull();
    expect(back.rounds[0].time).toBe(9876);
    // Pins keep ~4 cm precision; scores are recomputed identically.
    expect(summarize(back).total).toBe(summarize(run).total);
    // Camera track keeps quarter-pixel precision at each sample's zoom.
    const a = run.rounds[0].track[30];
    const b = back.rounds[0].track[30];
    expect(Math.abs(a.x - b.x) * 256 * 2 ** a.z).toBeLessThan(0.5);
    expect(Math.abs(a.z - b.z)).toBeLessThan(0.01);
  });

  it('packs into a URL-safe string and flags tampering', async () => {
    const code = await runToCode(run);
    expect(code).toMatch(/^[zb][A-Za-z0-9_-]+$/);
    expect((await runFromCode(code)).verified).toBe(true);
    const bytes = encodeRun(run);
    bytes[20] ^= 1;
    expect(decodeRun(bytes).verified).toBe(false);
  });
});

describe('drops', () => {
  it('knows land from sea', () => {
    expect(isLand(TARGET.lat, TARGET.lng)).toBe(true);
    expect(isLand(39, -98)).toBe(true); // Kansas
    expect(isLand(33.4, -118.6)).toBe(false); // Pacific off Los Angeles
    expect(isLand(30, -40)).toBe(false); // mid-Atlantic
  });

  it('is deterministic per seed, random across seeds, and always on land', () => {
    for (const zone of ['world', 'socal', 'city', 'campus'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const cfg: GameConfig = { mode: 'drop', zone, rounds: 3, seed };
        const a = roundStarts(cfg);
        expect(roundStarts(cfg)).toEqual(a);
        for (const c of a) {
          const ll = unproject(c.x, c.y);
          expect(isLand(ll.lat, ll.lng)).toBe(true);
        }
      }
      const s1 = roundStarts({ mode: 'drop', zone, rounds: 1, seed: 1 })[0];
      const s2 = roundStarts({ mode: 'drop', zone, rounds: 1, seed: 2 })[0];
      expect(s1).not.toEqual(s2);
    }
  });

  it('keeps separate leaderboards per category', () => {
    expect(categoryKey({ mode: 'drop', zone: 'world', rounds: 1, seed: 1 })).toBe('drop-world-1r');
    expect(categoryKey({ mode: 'drop', zone: 'city', rounds: 5, seed: 9 })).toBe('drop-city-5r');
  });
});

describe('levels', () => {
  it('maps XP to levels consistently', () => {
    for (let L = 1; L < 40; L++) {
      expect(levelFromXp(xpForLevel(L))).toBe(L);
      expect(levelFromXp(xpForLevel(L + 1) - 1)).toBe(L);
    }
  });
});
