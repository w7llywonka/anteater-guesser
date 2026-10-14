// End-of-game progression shared by every mode: XP, achievements, unlocks.

import { h, icon, toast } from '../util/dom';
import { fmtInt } from '../util/format';
import type { GameConfig } from '../game/modes';
import type { RunSummary } from '../game/runs';
import { ACHIEVEMENTS, SLOT_NAMES, type AchId, type Item, type Slot } from './items';
import { grantAchievement, levelFromXp, levelProgress, newlyUnlocked, profile, saveProfile } from './profile';

export interface Rewards {
  xp: number;
  lvlBefore: number;
  achievements: AchId[];
  unlocked: Array<{ slot: Slot; item: Item }>;
}

export function applyRewards(cfg: GameConfig, sum: RunSummary, extra: { beatGhost?: boolean; duel?: 'win' | 'loss' | 'draw' } = {}): Rewards {
  const before = { xp: profile.xp, ach: [...profile.ach] };
  const lvlBefore = levelFromXp(profile.xp);
  const xp = Math.round(sum.total / 10) + 50 + (extra.beatGhost ? 150 : 0) + (extra.duel === 'win' ? 250 : 0);
  profile.xp += xp;
  profile.games++;
  profile.rounds += sum.scores.length;
  profile.roofs += sum.scores.filter((s) => s.dist === 0).length;
  if (extra.duel) {
    profile.duels++;
    if (extra.duel === 'win') profile.wins++;
  }
  const got: AchId[] = [];
  const award = (id: AchId, cond: boolean) => cond && grantAchievement(id) && got.push(id);
  award('first', true);
  award('roof', sum.scores.some((s) => s.dist === 0));
  award('sniper', cfg.rounds === 5 && sum.scores.every((s) => s.dist === 0));
  award('sub10', cfg.zone === 'world' && sum.scores.some((s) => s.onTarget && s.time < 10_000));
  award('blink', sum.scores.some((s) => s.onTarget && s.time < 5_000));
  award('flawless', sum.scores.some((s) => s.total >= 9_500));
  award('golden', cfg.rounds === 5 && sum.total >= 45_000);
  award('daily', cfg.mode === 'daily');
  award('local', cfg.mode === 'drop' && cfg.zone === 'world' && cfg.rounds === 5 && sum.valid);
  award('marathon', profile.games >= 50);
  award('ghost', !!extra.beatGhost);
  award('duel', extra.duel === 'win');
  saveProfile();
  const unlocked = newlyUnlocked(before, profile);
  if (unlocked.length) toast(unlocked.length === 1 ? `Unlocked: ${unlocked[0].item.name}. Equip it in the Locker` : `${unlocked.length} new items unlocked. Check the Locker`, 'good', 4000);
  return { xp, lvlBefore, achievements: got, unlocked };
}

/** XP bar, new achievements and unlocked gear for a summary modal. */
export function rewardsBlock(r: Rewards): HTMLElement[] {
  const lp = levelProgress();
  const out: HTMLElement[] = [
    h('div', { class: 'xp' }, h('div', { class: 'xp-top' }, h('span', null, `+${fmtInt(r.xp)} XP`), h('span', null, `Level ${lp.lvl}${lp.lvl > r.lvlBefore ? ' · LEVEL UP!' : ''}`)), h('div', { class: 'bar' }, h('i', { style: `width:${(lp.frac * 100).toFixed(1)}%` }))),
  ];
  if (r.achievements.length) out.push(h('div', { class: 'unlocks' }, r.achievements.map((a) => h('span', { class: 'tag ach' }, icon('trophy', 13), ' ', ACHIEVEMENTS[a].name))));
  if (r.unlocked.length) out.push(h('div', { class: 'unlocks' }, h('small', null, 'Unlocked: '), r.unlocked.map((u) => h('span', { class: 'tag new' }, `${u.item.name} (${SLOT_NAMES[u.slot]})`))));
  return out;
}
