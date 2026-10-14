import { load, save } from '../util/storage';
import { ITEMS, DEFAULT_AVATAR, SLOTS, type AchId, type Avatar, type Item, type Slot } from './items';

export interface Profile {
  name: string;
  av: Avatar;
  xp: number;
  games: number;
  rounds: number;
  roofs: number;
  duels: number;
  wins: number;
  ach: AchId[];
  created: number;
}

function fresh(): Profile {
  return {
    name: `Anteater${Math.floor(100 + Math.random() * 900)}`,
    av: { ...DEFAULT_AVATAR },
    xp: 0,
    games: 0,
    rounds: 0,
    roofs: 0,
    duels: 0,
    wins: 0,
    ach: [],
    created: Date.now(),
  };
}

export const profile: Profile = { ...fresh(), ...load<Partial<Profile>>('profile', {}) };
profile.av = { ...DEFAULT_AVATAR, ...profile.av };

export function saveProfile() {
  save('profile', profile);
}

export const sanitizeName = (s: string) => s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Anteater';

// ---------------------------------------------------------------- levels

const STEP = 400;
/** Total XP required to reach level L. L2 = 800, L5 = 8,000, L10 = 36,000, L20 = 152,000. */
export const xpForLevel = (L: number) => STEP * L * (L - 1);
export const levelFromXp = (xp: number) => Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / STEP)) / 2));

export function levelProgress(xp = profile.xp) {
  const lvl = levelFromXp(xp);
  const a = xpForLevel(lvl);
  const b = xpForLevel(lvl + 1);
  return { lvl, into: xp - a, need: b - a, frac: (xp - a) / (b - a) };
}

export function isUnlocked(it: Item, p: Profile = profile): boolean {
  const u = it.unlock;
  return 'lvl' in u ? levelFromXp(p.xp) >= u.lvl : p.ach.includes(u.ach);
}

/** Items that unlock when going from one state to another (for the post-game toast). */
export function newlyUnlocked(before: { xp: number; ach: AchId[] }, after: Profile): Array<{ slot: Slot; item: Item }> {
  const out: Array<{ slot: Slot; item: Item }> = [];
  const prev = { ...after, xp: before.xp, ach: before.ach };
  for (const slot of SLOTS) for (const it of ITEMS[slot]) if (!isUnlocked(it, prev) && isUnlocked(it, after)) out.push({ slot, item: it });
  return out;
}

export function grantAchievement(id: AchId): boolean {
  if (profile.ach.includes(id)) return false;
  profile.ach.push(id);
  return true;
}
