// Singleplayer session (also used for racing a ghost from a challenge link).

import { ROUND_TIME_LIMIT_MS } from '../config';
import { h, icon, shareLink } from '../util/dom';
import { fmtDist, fmtInt, fmtTime } from '../util/format';
import { randomSeed, seedLabel } from '../util/rng';
import { unproject } from '../util/geo';
import { navigate } from '../router';
import { blockUrls, prefetch } from '../map/prefetch';
import { getMap } from '../game/mapHost';
import { createGameHud, revealRound, countUp, keyDir, isTyping, type GameHud } from '../game/hud';
import { RoundRunner, type GhostRound } from '../game/round';
import { categoryName, roundStarts, type GameConfig } from '../game/modes';
import { MAX_ROUND, rankLabel, scoreRound, type RoundScore } from '../game/scoring';
import { pbFor, recordRun, runToCode, runUrl, summarize, type RoundRecord, type RunData } from '../game/runs';
import { sfx } from '../game/sfx';
import { profile } from '../profile/profile';
import { applyRewards, rewardsBlock } from '../profile/rewards';
import { avatarSVG } from '../profile/avatar';
import type { MapView, Marker, Shape } from '../map/MapView';

export interface SessionOpts {
  cfg: GameConfig;
  ghost?: RunData | null;
}

export function cfgToQuery(cfg: GameConfig): string {
  // No seed in the URL: reloading or restarting always rolls a fresh random drop.
  const q = new URLSearchParams({ mode: cfg.mode, rounds: String(cfg.rounds) });
  if (cfg.mode === 'drop') q.set('zone', cfg.zone);
  return q.toString();
}

export function playScreen(root: HTMLElement, opts: SessionOpts): () => void {
  const s = new Session(root, opts);
  return () => s.destroy();
}

type Phase = 'countdown' | 'playing' | 'reveal' | 'summary' | 'idle';

class Session {
  private map: MapView;
  private hud: GameHud;
  private cfg: GameConfig;
  private ghost: RunData | null;
  private gen = 0;
  private phase: Phase = 'idle';
  private runner: RoundRunner | null = null;
  private records: RoundRecord[] = [];
  private scores: RoundScore[] = [];
  private revealBits: Array<Marker | Shape> = [];
  private nextResolve: (() => void) | null = null;
  private ghostStatus: HTMLElement | null = null;

  constructor(root: HTMLElement, opts: SessionOpts) {
    this.cfg = { ...opts.cfg };
    this.ghost = opts.ghost ?? null;

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
      const pb = pbFor(this.cfg);
      right = h(
        'div',
        { class: 'hud-card pb-card' },
        h('small', null, 'Personal best'),
        h('b', null, pb && pb.score >= 0 ? `${fmtInt(pb.score)} pts` : '—'),
        h('small', null, pb?.time != null ? `${fmtTime(pb.time)} on target` : ''),
      );
    }

    this.hud = createGameHud({
      right,
      onLock: () => this.runner?.lock(),
      onZoom: (dz) => this.phase === 'playing' && this.map.zoomBy(dz),
    });
    root.append(this.hud.el);
    this.map = getMap(this.hud.mapHost);
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
    this.hud.el.remove();
  }

  // ---------------------------------------------------------------- flow

  private async start() {
    const gen = ++this.gen;
    const hud = this.hud;
    this.runner?.abort();
    this.clearReveal();
    this.records = [];
    this.scores = [];
    hud.sheet.hidden = true;
    hud.modal.hidden = true;
    hud.scoreLbl.textContent = '0';
    const starts = roundStarts(this.cfg);
    // Later rounds' start areas download in the background while round 1 is played.
    for (const s of starts.slice(1)) {
      const ll = unproject(s.x, s.y);
      prefetch(blockUrls(ll.lat, ll.lng, Math.round(s.z), 2));
    }

    for (let i = 0; i < this.cfg.rounds; i++) {
      hud.roundLbl.textContent = `Round ${i + 1}/${this.cfg.rounds}`;
      const gr = this.ghost?.rounds[i];
      const ghost: GhostRound | null = gr && this.ghost ? { name: this.ghost.player.name, record: gr, vw: this.ghost.vw, vh: this.ghost.vh, pinSkin: this.ghost.player.av.pin } : null;
      const runner = new RoundRunner({
        map: this.map,
        ui: { timer: hud.timer, lockBtn: hud.lockBtn, countdown: hud.countdown, ghostStatus: this.ghostStatus },
        start: starts[i],
        limitMs: ROUND_TIME_LIMIT_MS,
        pinSkin: profile.av.pin,
        ghost,
      });
      this.runner = runner;
      this.phase = 'countdown';
      hud.el.classList.remove('revealing');
      hud.el.classList.add('counting');
      await runner.countdown();
      hud.el.classList.remove('counting');
      if (gen !== this.gen) return;
      this.phase = 'playing';
      const rec = await runner.play();
      if (gen !== this.gen) return;
      this.records.push(rec);
      const sc = scoreRound(rec.pin, rec.time);
      this.scores.push(sc);
      this.phase = 'reveal';
      hud.scoreLbl.textContent = fmtInt(this.scores.reduce((a, b) => a + b.total, 0));
      hud.el.classList.add('revealing');
      sc.onTarget ? sfx.good() : sfx.meh();
      this.revealBits = await revealRound(this.map, [
        { pin: rec.pin, skin: profile.av.pin, cls: 'mine', marker: false },
        ...(ghost ? [{ pin: ghost.record.pin, skin: ghost.pinSkin, cls: 'ghost' as const, marker: true }] : []),
      ]);
      if (gen !== this.gen) {
        this.clearReveal();
        return;
      }
      this.showRoundSheet(i, sc, i === this.cfg.rounds - 1, ghost);
      await new Promise<void>((res) => (this.nextResolve = res));
      if (gen !== this.gen) return;
      hud.sheet.hidden = true;
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
    this.hud.sheet.replaceChildren(
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
    this.hud.sheet.hidden = false;
    countUp(acc, sc.acc);
    countUp(spd, sc.speed);
    countUp(total, sc.total);
  }

  // ---------------------------------------------------------------- summary

  private async finishGame(gen: number) {
    this.phase = 'summary';
    const c = this.cfg;
    const sum = summarize({ rounds: this.records });
    const gsum = this.ghost ? summarize(this.ghost) : null;
    const beatGhost = !!gsum && sum.total > gsum.total;

    const run: RunData = {
      cfg: c,
      date: Date.now(),
      player: { name: profile.name, level: 0, av: { ...profile.av } },
      vw: Math.round(this.map.w),
      vh: Math.round(this.map.h),
      rounds: this.records,
      vs: this.ghost && gsum ? { name: this.ghost.player.name, total: gsum.total, time: gsum.time } : undefined,
    };
    const rewards = applyRewards(c, sum, { beatGhost });
    run.player.level = rewards.lvlBefore;
    const code = await runToCode(run);
    if (gen !== this.gen) return;
    const pb = recordRun(run, code, this.ghost ? 'ghost' : 'solo', this.ghost ? { opp: this.ghost.player.name, result: beatGhost ? 'win' : sum.total === gsum!.total ? 'draw' : 'loss' } : {});
    if (pb.scorePB || pb.timePB) sfx.pb();

    const max = MAX_ROUND * c.rounds;
    const rank = rankLabel(sum.total, max);
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

    this.hud.modal.replaceChildren(
      h(
        'div',
        { class: 'modal summary' },
        h(
          'div',
          { class: 'sum-head' },
          h('div', { class: `rank r-${rank.replace('+', 'p')}` }, rank),
          h(
            'div',
            null,
            h('small', null, `${categoryName(c)} · seed ${seedLabel(c.seed)}`),
            h('div', { class: 'sum-score' }, fmtInt(sum.total), h('span', null, ` / ${fmtInt(max)}`)),
            h('div', { class: 'sum-time' }, icon('bolt', 14), ` ${fmtTime(sum.time)} `, sum.valid ? h('span', { class: 'tag good' }, 'all on target') : h('span', { class: 'tag' }, 'not all on target')),
          ),
        ),
        pb.scorePB || pb.timePB ? h('div', { class: 'pb-row' }, pb.scorePB ? h('span', { class: 'tag gold' }, icon('trophy', 14), ' New score PB') : null, pb.timePB ? h('span', { class: 'tag gold' }, icon('bolt', 14), ' New time PB') : null) : null,
        ghostBlock,
        h('table', { class: 'rounds' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Distance'), h('th', null, 'Time'), h('th', null, 'Points'))), h('tbody', null, rows)),
        ...rewardsBlock(rewards),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => this.restart() }, icon('restart', 16), this.ghost ? 'Race again' : c.mode === 'daily' ? 'Replay daily' : 'New drop', h('kbd', null, 'R')),
          h('button', { class: 'btn', onclick: () => navigate(`/r/${code}?v=watch`) }, icon('play', 14), 'Watch replay'),
          h('button', { class: 'btn', onclick: () => shareLink(runUrl(code, 'race'), 'Beat my Anteater Guesser run') }, icon('swords', 16), 'Challenge a friend'),
          h('button', { class: 'btn', onclick: () => shareLink(runUrl(code), 'My Anteater Guesser run') }, icon('link', 16), 'Copy run link'),
          h('button', { class: 'btn ghosty', onclick: () => navigate('/') }, 'Home'),
        ),
      ),
    );
    this.hud.modal.hidden = false;
  }

  // ---------------------------------------------------------------- input

  private onKey = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
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
