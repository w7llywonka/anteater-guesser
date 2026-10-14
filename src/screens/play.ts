// Singleplayer session (also used for racing a ghost from a challenge link).

import { ROUND_TIME_LIMIT_MS, ZONES } from '../config';
import { h, icon, toast, shareLink } from '../util/dom';
import { fmtDist, fmtInt, fmtTime } from '../util/format';
import { randomSeed, seedLabel } from '../util/rng';
import { motionReduced, settings } from '../settings';
import { getMap, TARGET_PT, FOOTPRINT_PTS, pinEl, targetEl, targetThumb } from '../game/mapHost';
import { RoundRunner, type GhostRound } from '../game/round';
import { categoryName, roundStarts, type GameConfig } from '../game/modes';
import { MAX_ROUND, rankLabel, scoreRound, type RoundScore } from '../game/scoring';
import { pbFor, recordRun, runToCode, runUrl, summarize, type RoundRecord, type RunData } from '../game/runs';
import { sfx } from '../game/sfx';
import { profile, saveProfile, levelFromXp, levelProgress, newlyUnlocked, grantAchievement } from '../profile/profile';
import { ACHIEVEMENTS, SLOT_NAMES, type AchId } from '../profile/items';
import { avatarSVG } from '../profile/avatar';
import { navigate } from '../router';
import type { MapView, Marker, Shape } from '../map/MapView';

export interface SessionOpts {
  cfg: GameConfig;
  ghost?: RunData | null;
}

export function cfgToQuery(cfg: GameConfig): string {
  // No seed in the URL: reloading or restarting always rolls a fresh random drop.
  const q = new URLSearchParams({ mode: cfg.mode, rounds: String(cfg.rounds) });
  if (cfg.mode === 'drop') q.set('zone', cfg.zone);
  if (cfg.labels) q.set('labels', '1');
  return q.toString();
}

export function playScreen(root: HTMLElement, opts: SessionOpts): () => void {
  const s = new Session(root, opts);
  return () => s.destroy();
}

type Phase = 'countdown' | 'playing' | 'reveal' | 'summary' | 'idle';

class Session {
  private map: MapView;
  private cfg: GameConfig;
  private ghost: RunData | null;
  private gen = 0;
  private phase: Phase = 'idle';
  private runner: RoundRunner | null = null;
  private records: RoundRecord[] = [];
  private scores: RoundScore[] = [];
  private revealBits: Array<Marker | Shape> = [];
  private nextResolve: (() => void) | null = null;

  private el: HTMLElement;
  private timer: HTMLElement;
  private roundLbl: HTMLElement;
  private scoreLbl: HTMLElement;
  private lockBtn: HTMLButtonElement;
  private countdownEl: HTMLElement;
  private sheet: HTMLElement;
  private modal: HTMLElement;
  private ghostStatus: HTMLElement | null = null;
  private hint: HTMLElement;

  constructor(root: HTMLElement, opts: SessionOpts) {
    this.cfg = { ...opts.cfg };
    this.ghost = opts.ghost ?? null;

    const mapHost = h('div', { class: 'map-host' });
    this.timer = h('div', { class: 'timer', 'aria-live': 'off' }, '0.00');
    this.roundLbl = h('span', null, '');
    this.scoreLbl = h('span', null, '0');
    this.lockBtn = h('button', { class: 'btn lock', disabled: true, onclick: () => this.runner?.lock() }, icon('lock', 18), 'Lock in', h('kbd', null, 'Space'));
    this.countdownEl = h('div', { class: 'countdown', hidden: true });
    this.sheet = h('div', { class: 'sheet', hidden: true });
    this.modal = h('div', { class: 'modal-wrap', hidden: true });
    this.hint = h('div', { class: 'hint' }, settings.oneClick ? 'One-click mode: your first click locks in' : 'Click to place a pin · Double-click or Space to lock in · R for a new drop');

    const pb = pbFor(this.cfg);
    let right: HTMLElement;
    if (this.ghost) {
      this.ghostStatus = h('small', null, 'waiting…');
      const gs = summarize(this.ghost);
      right = h(
        'div',
        { class: 'hud-card ghost-card' },
        h('div', { class: 'mini-av', html: avatarSVG(this.ghost.player.av, 40) }),
        h('div', null, h('b', null, icon('ghost', 14), ' ', this.ghost.player.name), h('small', null, `${fmtInt(gs.total)} pts · ${fmtTime(gs.time)}`), this.ghostStatus),
      );
    } else {
      right = h(
        'div',
        { class: 'hud-card pb-card' },
        h('small', null, 'Personal best'),
        h('b', null, pb && pb.score >= 0 ? `${fmtInt(pb.score)} pts` : '—'),
        h('small', null, pb?.time != null ? `${fmtTime(pb.time)} on target` : ''),
      );
    }

    this.el = h(
      'div',
      { class: 'game' },
      mapHost,
      h(
        'div',
        { class: 'hud' },
        h(
          'div',
          { class: 'hud-top' },
          h(
            'div',
            { class: 'hud-left' },
            h('button', { class: 'btn-icon', title: 'Quit (Esc)', 'aria-label': 'Quit', onclick: () => navigate('/') }, icon('back', 20)),
            h('div', { class: 'hud-card target-card' }, targetThumb(52), h('div', null, h('small', null, 'Find'), h('b', null, '26 Murasaki St'), h('small', null, 'Irvine, CA'))),
          ),
          h('div', { class: 'hud-center' }, this.timer, h('div', { class: 'hud-sub' }, this.roundLbl, ' · ', this.scoreLbl, ' pts')),
          h('div', { class: 'hud-right' }, right),
        ),
        h(
          'div',
          { class: 'zoom-ctl' },
          h('button', { class: 'btn-icon', 'aria-label': 'Zoom in', onclick: () => this.map.zoomBy(1) }, icon('plus', 20)),
          h('button', { class: 'btn-icon', 'aria-label': 'Zoom out', onclick: () => this.map.zoomBy(-1) }, icon('minus', 20)),
        ),
        h('div', { class: 'hud-bottom' }, this.hint, this.lockBtn),
      ),
      this.countdownEl,
      this.sheet,
      this.modal,
    );
    root.append(this.el);
    this.map = getMap(mapHost);
    this.map.setLabels(this.cfg.labels);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    void this.start();
  }

  destroy() {
    this.gen++;
    this.runner?.abort();
    this.clearReveal();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.map.interactive = true;
    this.el.remove();
  }

  // ---------------------------------------------------------------- flow

  private async start() {
    const gen = ++this.gen;
    this.runner?.abort();
    this.clearReveal();
    this.records = [];
    this.scores = [];
    this.sheet.hidden = true;
    this.modal.hidden = true;
    this.scoreLbl.textContent = '0';
    const starts = roundStarts(this.cfg);

    for (let i = 0; i < this.cfg.rounds; i++) {
      this.roundLbl.textContent = `Round ${i + 1}/${this.cfg.rounds}`;
      const gr = this.ghost?.rounds[i];
      const ghost: GhostRound | null = gr && this.ghost ? { name: this.ghost.player.name, record: gr, vw: this.ghost.vw, vh: this.ghost.vh, pinSkin: this.ghost.player.av.pin } : null;
      const runner = new RoundRunner({
        map: this.map,
        ui: { timer: this.timer, lockBtn: this.lockBtn, countdown: this.countdownEl, ghostStatus: this.ghostStatus },
        start: starts[i],
        limitMs: ROUND_TIME_LIMIT_MS,
        pinSkin: profile.av.pin,
        ghost,
      });
      this.runner = runner;
      this.phase = 'countdown';
      this.el.classList.remove('revealing');
      await runner.countdown(3, i === 0 ? 550 : 450);
      if (gen !== this.gen) return;
      this.phase = 'playing';
      const rec = await runner.play();
      if (gen !== this.gen) return;
      this.records.push(rec);
      const sc = scoreRound(rec.pin, rec.time);
      this.scores.push(sc);
      this.phase = 'reveal';
      this.scoreLbl.textContent = fmtInt(this.scores.reduce((a, b) => a + b.total, 0));
      await this.reveal(rec, sc, ghost);
      if (gen !== this.gen) return;
      const last = i === this.cfg.rounds - 1;
      this.showRoundSheet(i, sc, last, ghost);
      await new Promise<void>((res) => (this.nextResolve = res));
      if (gen !== this.gen) return;
      this.sheet.hidden = true;
      runner.clearPin();
      this.clearReveal();
    }
    await this.finishGame(gen);
  }

  private next() {
    const r = this.nextResolve;
    this.nextResolve = null;
    r?.();
  }

  /** Fixed seeds only for ghost races and the daily; everything else is a brand-new drop. */
  private restart() {
    this.nextResolve = null;
    if (!this.ghost && this.cfg.mode !== 'daily') this.cfg = { ...this.cfg, seed: randomSeed() };
    void this.start();
  }

  // ---------------------------------------------------------------- reveal

  private async reveal(rec: RoundRecord, sc: RoundScore, ghost: GhostRound | null) {
    const map = this.map;
    this.el.classList.add('revealing');
    const tgt = map.addMarker(targetEl());
    tgt.set(TARGET_PT.x, TARGET_PT.y);
    this.revealBits.push(tgt, map.addPath(() => FOOTPRINT_PTS, 'footprint', true));
    const pts = [TARGET_PT];
    if (rec.pin) {
      const p = rec.pin;
      this.revealBits.push(map.addPath(() => [p, { x: map.nearestWrap(TARGET_PT.x, p.x), y: TARGET_PT.y }], 'line mine'));
      pts.push(p);
    }
    if (ghost?.record.pin) {
      const gp = ghost.record.pin;
      const m = map.addMarker(pinEl(ghost.pinSkin, 'ghost'));
      m.set(gp.x, gp.y);
      this.revealBits.push(m, map.addPath(() => [gp, { x: map.nearestWrap(TARGET_PT.x, gp.x), y: TARGET_PT.y }], 'line ghost'));
      pts.push(gp);
    }
    sc.dist <= 15 ? sfx.good() : sfx.meh();
    // Keep both pins clear of the HUD at the top and the result sheet at the bottom.
    const side = Math.min(90, map.w / 8);
    const cam = map.fitCamera(pts, { top: Math.min(130, map.h / 5), bottom: Math.min(250, map.h / 2.6), left: side, right: side }, 19);
    await map.flyTo(cam.x, cam.y, cam.z, 1400);
  }

  private clearReveal() {
    for (const b of this.revealBits) b.remove();
    this.revealBits = [];
  }

  private showRoundSheet(i: number, sc: RoundScore, last: boolean, ghost: GhostRound | null) {
    const verdict = !Number.isFinite(sc.dist) ? 'Time up: no pin' : sc.dist === 0 ? 'On the roof!' : sc.onTarget ? `On target · ${fmtDist(sc.dist)}` : `Off by ${fmtDist(sc.dist)}`;
    const total = h('b', { class: 'big' }, '0');
    const acc = h('b', null, '0');
    const spd = h('b', null, '0');
    let vs: HTMLElement | null = null;
    if (ghost) {
      const gs = scoreRound(ghost.record.pin, ghost.record.time);
      const diff = sc.total - gs.total;
      vs = h('div', { class: `vs-line ${diff >= 0 ? 'win' : 'lose'}` }, `${ghost.name}: ${fmtInt(gs.total)} pts in ${fmtTime(gs.time)} · `, h('b', null, diff >= 0 ? `+${fmtInt(diff)}` : fmtInt(diff)));
    }
    this.sheet.replaceChildren(
      h(
        'div',
        { class: 'sheet-inner' },
        h('div', { class: 'sheet-head' }, h('span', { class: 'chip' }, `Round ${i + 1}/${this.cfg.rounds}`), h('span', { class: `verdict ${sc.onTarget ? 'good' : ''}` }, verdict)),
        h(
          'div',
          { class: 'stats' },
          h('div', null, h('small', null, 'Time'), h('b', null, fmtTime(sc.time))),
          h('div', null, h('small', null, 'Accuracy'), acc),
          h('div', null, h('small', null, 'Speed'), spd),
          h('div', { class: 'tot' }, h('small', null, 'Round'), total),
        ),
        vs,
        h('button', { class: 'btn primary', onclick: () => this.next() }, last ? 'See results' : 'Next round', h('kbd', null, 'Space')),
      ),
    );
    this.sheet.hidden = false;
    countUp(acc, sc.acc);
    countUp(spd, sc.speed);
    countUp(total, sc.total);
  }

  // ---------------------------------------------------------------- summary

  private async finishGame(gen: number) {
    this.phase = 'summary';
    const before = { xp: profile.xp, ach: [...profile.ach] };
    const lvlBefore = levelFromXp(profile.xp);
    const sum = summarize({ rounds: this.records });
    const gsum = this.ghost ? summarize(this.ghost) : null;
    const beatGhost = !!gsum && sum.total > gsum.total;

    const run: RunData = {
      cfg: this.cfg,
      date: Date.now(),
      player: { name: profile.name, level: lvlBefore, av: { ...profile.av } },
      vw: Math.round(this.map.w),
      vh: Math.round(this.map.h),
      rounds: this.records,
      vs: this.ghost && gsum ? { name: this.ghost.player.name, total: gsum.total, time: gsum.time } : undefined,
    };
    const code = await runToCode(run);
    if (gen !== this.gen) return;
    const pb = recordRun(run, code, this.ghost ? 'ghost' : 'solo', this.ghost ? { opp: this.ghost.player.name, result: beatGhost ? 'win' : sum.total === gsum!.total ? 'draw' : 'loss' } : {});

    // XP and achievements
    const xp = Math.round(sum.total / 10) + 50 + (beatGhost ? 150 : 0);
    profile.xp += xp;
    profile.games++;
    profile.rounds += this.records.length;
    profile.roofs += sum.scores.filter((s) => s.dist === 0).length;
    const got: AchId[] = [];
    const award = (id: AchId, cond: boolean) => cond && grantAchievement(id) && got.push(id);
    const c = this.cfg;
    award('first', true);
    award('roof', sum.scores.some((s) => s.dist === 0));
    award('sniper', c.rounds === 5 && sum.scores.every((s) => s.dist === 0));
    award('sub10', c.zone === 'world' && sum.scores.some((s) => s.onTarget && s.time < 10_000));
    award('blink', sum.scores.some((s) => s.onTarget && s.time < 5_000));
    award('flawless', sum.scores.some((s) => s.total >= 9_500));
    award('golden', c.rounds === 5 && sum.total >= 45_000);
    award('daily', c.mode === 'daily');
    award('local', c.mode === 'drop' && c.zone === 'world' && c.rounds === 5 && !c.labels && sum.valid);
    award('marathon', profile.games >= 50);
    award('ghost', beatGhost);
    saveProfile();
    const unlocked = newlyUnlocked(before, profile);
    const lp = levelProgress();
    if (pb.scorePB || pb.timePB) sfx.pb();

    const max = MAX_ROUND * c.rounds;
    const rank = rankLabel(sum.total, max);
    const watch = () => navigate(`/r/${code}?v=watch`);

    const rows = sum.scores.map((s, i) =>
      h('tr', null, h('td', null, String(i + 1)), h('td', null, Number.isFinite(s.dist) ? fmtDist(s.dist) : '—'), h('td', null, fmtTime(s.time)), h('td', null, fmtInt(s.total))),
    );

    let ghostBlock: HTMLElement | null = null;
    if (this.ghost && gsum) {
      ghostBlock = h(
        'div',
        { class: `vs-final ${beatGhost ? 'win' : 'lose'}` },
        h('div', { class: 'mini-av', html: avatarSVG(this.ghost.player.av, 44) }),
        h('div', null, h('b', null, beatGhost ? `You beat ${this.ghost.player.name}!` : `${this.ghost.player.name} wins this one`), h('small', null, `${fmtInt(sum.total)} vs ${fmtInt(gsum.total)} · ${fmtTime(sum.time)} vs ${fmtTime(gsum.time)}`)),
      );
    }

    this.modal.replaceChildren(
      h(
        'div',
        { class: 'modal summary' },
        h('div', { class: 'sum-head' }, h('div', { class: `rank r-${rank.replace('+', 'p')}` }, rank), h('div', null, h('small', null, `${categoryName(c)} · seed ${seedLabel(c.seed)}`), h('div', { class: 'sum-score' }, fmtInt(sum.total), h('span', null, ` / ${fmtInt(max)}`)), h('div', { class: 'sum-time' }, icon('bolt', 14), ` ${fmtTime(sum.time)} `, sum.valid ? h('span', { class: 'tag good' }, 'all on target') : h('span', { class: 'tag' }, 'not all on target')))),
        pb.scorePB || pb.timePB ? h('div', { class: 'pb-row' }, pb.scorePB ? h('span', { class: 'tag gold' }, icon('trophy', 14), ' New score PB') : null, pb.timePB ? h('span', { class: 'tag gold' }, icon('bolt', 14), ' New time PB') : null) : null,
        ghostBlock,
        h('table', { class: 'rounds' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Distance'), h('th', null, 'Time'), h('th', null, 'Points'))), h('tbody', null, rows)),
        h('div', { class: 'xp' }, h('div', { class: 'xp-top' }, h('span', null, `+${fmtInt(xp)} XP`), h('span', null, `Level ${lp.lvl}${lp.lvl > lvlBefore ? ' · LEVEL UP!' : ''}`)), h('div', { class: 'bar' }, h('i', { style: `width:${(lp.frac * 100).toFixed(1)}%` }))),
        got.length ? h('div', { class: 'unlocks' }, got.map((a) => h('span', { class: 'tag ach' }, icon('trophy', 13), ' ', ACHIEVEMENTS[a].name))) : null,
        unlocked.length ? h('div', { class: 'unlocks' }, h('small', null, 'Unlocked: '), unlocked.map((u) => h('span', { class: 'tag new' }, `${u.item.name} (${SLOT_NAMES[u.slot]})`))) : null,
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => this.restart() }, icon('restart', 16), this.ghost ? 'Race again' : c.mode === 'daily' ? 'Replay daily' : 'New drop', h('kbd', null, 'R')),
          h('button', { class: 'btn', onclick: watch }, icon('play', 14), 'Watch replay'),
          h('button', { class: 'btn', onclick: () => shareLink(runUrl(code, 'race'), 'Beat my Anteater Guesser run') }, icon('swords', 16), 'Challenge a friend'),
          h('button', { class: 'btn', onclick: () => shareLink(runUrl(code), 'My Anteater Guesser run') }, icon('link', 16), 'Copy run link'),
          h('button', { class: 'btn ghosty', onclick: () => navigate('/') }, 'Home'),
        ),
      ),
    );
    this.modal.hidden = false;
    if (unlocked.length) toast(`New gear unlocked: ${unlocked.map((u) => u.item.name).join(', ')}`, 'good', 4000);
  }

  // ---------------------------------------------------------------- input

  private onKey = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (k === 'Escape') {
      navigate('/');
      return;
    }
    if (k === 'r' || k === 'R') {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      this.restart();
      return;
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (this.phase === 'playing') this.runner?.lock();
      else if (this.phase === 'reveal') this.next();
      (document.activeElement as HTMLElement | null)?.blur?.();
      return;
    }
    if (this.phase !== 'playing') return;
    const dir = keyDir(k);
    if (dir) {
      e.preventDefault();
      this.map.setKey(dir, true);
      return;
    }
    if (k === '+' || k === '=' || k === 'e' || k === 'E') this.map.zoomBy(1);
    else if (k === '-' || k === '_' || k === 'q' || k === 'Q') this.map.zoomBy(-1);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const dir = keyDir(e.key);
    if (dir) this.map.setKey(dir, false);
  };
}

function keyDir(k: string): 'l' | 'r' | 'u' | 'd' | null {
  switch (k) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'l';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'r';
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'u';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'd';
  }
  return null;
}

function countUp(el: HTMLElement, to: number) {
  if (motionReduced() || to === 0) {
    el.textContent = fmtInt(to);
    return;
  }
  const t0 = performance.now();
  const dur = 650;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = fmtInt(to * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function describeZone(cfg: GameConfig): string {
  return cfg.mode === 'drop' ? ZONES[cfg.zone].blurb : '';
}
