// #/duel: live 1v1. The host creates a room and shares a link; both players get the same
// random drops, see each other's camera live, and score on accuracy + speed per round.

import { DUEL_HURRY_MS, ROUND_TIME_LIMIT_MS, ZONES, type ZoneId } from '../config';
import { h, icon, shareLink, toast } from '../util/dom';
import { fmtDist, fmtInt, fmtTime } from '../util/format';
import { randomCode, randomSeed } from '../util/rng';
import { navigate } from '../router';
import { DuelNet, PROTOCOL, type Msg, type NetPlayer } from '../net/duel';
import { getMap } from '../game/mapHost';
import { createGameHud, revealRound, countUp, keyDir, isTyping, type GameHud } from '../game/hud';
import { RoundRunner } from '../game/round';
import { categoryName, roundStarts, type GameConfig } from '../game/modes';
import { scoreRound, type RoundScore } from '../game/scoring';
import { recordRun, runToCode, runUrl, summarize, type RoundRecord, type RunData } from '../game/runs';
import { sfx } from '../game/sfx';
import { profile, levelFromXp } from '../profile/profile';
import { applyRewards, rewardsBlock } from '../profile/rewards';
import { avatarSVG } from '../profile/avatar';
import { item } from '../profile/items';
import type { Camera, MapView, Marker, Shape } from '../map/MapView';
import { segmented } from './home';
import { page, topbar } from './chrome';

const EMOTES = ['👋', '😂', '😱', '🔥', 'GG'];

export async function duelScreen(root: HTMLElement, room: string): Promise<() => void> {
  let ctl: DuelController | null = null;
  let disposed = false;
  const me = (): NetPlayer => ({ name: profile.name, level: levelFromXp(profile.xp), av: { ...profile.av } });

  const startWith = (net: DuelNet) => {
    if (disposed) {
      net.close();
      return;
    }
    root.replaceChildren();
    ctl = new DuelController(root, net, me());
  };

  if (room) {
    const code = room.toUpperCase();
    root.append(topbar(), page('Live 1v1', h('section', { class: 'card center' }, h('div', { class: 'spinner' }), h('p', null, `Joining room ${code}…`))));
    try {
      startWith(await DuelNet.join(code));
    } catch (e) {
      if (!disposed) {
        root.replaceChildren(
          topbar(),
          page('Live 1v1', h('section', { class: 'card' }, h('h2', null, "Couldn't join"), h('p', null, (e as Error).message), h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/duel' }, 'Create your own room'), h('a', { class: 'btn', href: '#/' }, 'Home')))),
        );
      }
    }
  } else {
    landing(root, startWith);
  }

  return () => {
    disposed = true;
    ctl?.destroy();
  };
}

function landing(root: HTMLElement, onReady: (net: DuelNet) => void) {
  const codeInput = h('input', { class: 'seed-input code-input', placeholder: 'ROOM CODE', maxlength: 6, 'aria-label': 'Room code', spellcheck: 'false', autocomplete: 'off' });
  const err = h('p', { class: 'err', hidden: true });
  const createBtn = h('button', { class: 'btn primary lg' }, icon('swords', 18), 'Create a room');
  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    err.hidden = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        onReady(await DuelNet.host(randomCode(5)));
        return;
      } catch (e) {
        err.textContent = (e as Error).message;
      }
    }
    err.hidden = false;
    createBtn.disabled = false;
  });
  const join = () => {
    const c = codeInput.value.trim().toUpperCase();
    if (c.length >= 4) navigate(`/duel/${c}`);
  };
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  root.append(
    topbar(),
    page(
      'Live 1v1',
      h(
        'section',
        { class: 'card duel-landing' },
        h('div', null, h('h2', null, icon('swords', 20), ' Race a friend in real time'), h('p', { class: 'muted' }, 'Create a room and send the link. You both get the same random drops, see each other’s camera live, and score on accuracy and speed. When one of you locks in, the other has 15 seconds left.'), createBtn, err),
        h('div', { class: 'join-box' }, h('h3', null, 'Got a code?'), h('div', { class: 'row' }, codeInput, h('button', { class: 'btn', onclick: join }, 'Join'))),
      ),
      h('p', { class: 'muted small' }, 'Connections are peer-to-peer (WebRTC). A free public broker introduces the two browsers; the game itself never touches a server.'),
    ),
  );
}

interface OppState {
  player: NetPlayer | null;
  cam: { cam: Camera; w: number; h: number; at: number } | null;
}

class DuelController {
  private opp: OppState = { player: null, cam: null };
  private rounds = 3;
  private zone: ZoneId = 'world';
  private view: 'lobby' | 'game' = 'lobby';
  private game: DuelGame | null = null;
  private off: () => void;
  private lobbyEl: HTMLElement | null = null;
  private emoteHost: HTMLElement | null = null;
  private wantsRematch = { me: false, opp: false };

  constructor(
    private root: HTMLElement,
    private net: DuelNet,
    private me: NetPlayer,
  ) {
    this.off = net.on((e) => {
      if (e.kind === 'open') net.send({ t: 'hello', v: PROTOCOL, p: me });
      else if (e.kind === 'close') this.onClose(e.reason);
      else this.onMsg(e.msg);
    });
    if (net.connected) net.send({ t: 'hello', v: PROTOCOL, p: me });
    this.showLobby();
  }

  destroy() {
    this.off();
    this.game?.destroy();
    this.net.close();
  }

  private get link() {
    return `${location.origin}${location.pathname}#/duel/${this.net.code}`;
  }

  private onMsg(m: Msg) {
    switch (m.t) {
      case 'hello':
        if (m.v !== PROTOCOL) toast('Your friend is on a different version. Both of you should refresh.', 'bad', 5000);
        this.opp.player = m.p;
        if (this.net.isHost) this.net.send({ t: 'cfg', rounds: this.rounds, zone: this.zone });
        if (this.view === 'lobby') this.showLobby();
        sfx.pin();
        break;
      case 'cfg':
        this.rounds = m.rounds;
        this.zone = m.zone;
        if (this.view === 'lobby') this.showLobby();
        break;
      case 'start':
        this.rounds = m.rounds;
        this.zone = m.zone;
        this.startGame({ mode: 'drop', zone: m.zone, rounds: m.rounds, seed: m.seed });
        break;
      case 'cam':
        this.opp.cam = { cam: { x: m.x, y: m.y, z: m.z }, w: m.w, h: m.h, at: performance.now() };
        break;
      case 'emote':
        this.showEmote(m.e);
        break;
      case 'rematch':
        this.wantsRematch.opp = true;
        toast(`${this.opp.player?.name ?? 'Opponent'} wants a rematch`, 'info');
        this.game?.markRematch(this.wantsRematch);
        this.maybeRematch();
        break;
      case 'lobby':
        this.backToLobby(false);
        break;
      case 'bye':
        this.onClose(`${this.opp.player?.name ?? 'Your opponent'} left the room.`);
        break;
      default:
        this.game?.onMsg(m);
    }
  }

  private onClose(reason: string) {
    const name = this.opp.player?.name;
    this.opp = { player: null, cam: null };
    if (this.view === 'game' && this.game) {
      this.game.opponentLeft(reason);
      return;
    }
    if (name) toast(reason, 'bad', 4000);
    if (this.net.isHost) this.showLobby();
    else {
      this.root.replaceChildren(topbar(), page('Live 1v1', h('section', { class: 'card' }, h('h2', null, 'Disconnected'), h('p', null, reason), h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/duel' }, 'Create a room'), h('a', { class: 'btn', href: '#/' }, 'Home')))));
    }
  }

  // ---------------------------------------------------------------- lobby

  private showLobby() {
    this.view = 'lobby';
    const isHost = this.net.isHost;
    const opp = this.opp.player;
    const playerCard = (p: NetPlayer | null, label: string) =>
      p
        ? h('div', { class: 'duel-player' }, h('div', { class: 'av-wrap', html: avatarSVG(p.av, 96) }), h('b', null, p.name), h('small', null, `${item('title', p.av.title).c![0]} · Lv ${p.level}`), h('span', { class: 'tag' }, label))
        : h('div', { class: 'duel-player empty' }, h('div', { class: 'spinner' }), h('b', null, 'Waiting for opponent…'), h('small', null, 'Send them the link below'));

    const settingsEl = isHost
      ? h(
          'div',
          { class: 'duel-settings' },
          h('div', null, h('small', null, 'Rounds'), segmented([1, 3, 5].map((n) => ({ v: String(n), label: String(n) })), String(this.rounds), (v) => {
            this.rounds = Number(v);
            this.net.send({ t: 'cfg', rounds: this.rounds, zone: this.zone });
          })),
          h('div', null, h('small', null, 'Drop zone'), segmented((Object.keys(ZONES) as ZoneId[]).map((z) => ({ v: z, label: ZONES[z].name, title: ZONES[z].blurb })), this.zone, (v) => {
            this.zone = v as ZoneId;
            this.net.send({ t: 'cfg', rounds: this.rounds, zone: this.zone });
          })),
        )
      : h('div', { class: 'duel-settings' }, h('p', { class: 'muted' }, `${this.rounds} round${this.rounds > 1 ? 's' : ''} · ${ZONES[this.zone].name} drops · host picks the settings`));

    const startBtn = isHost
      ? h('button', { class: 'btn primary lg wide', disabled: !opp, onclick: () => this.hostStart() }, icon('play', 16), opp ? 'Start duel' : 'Waiting for opponent…')
      : h('div', { class: 'muted center' }, 'Waiting for the host to start…');

    this.emoteHost = h('div', { class: 'emote-float' });
    this.lobbyEl = h(
      'main',
      { class: 'page duel-page' },
      h('div', { class: 'page-head' }, h('a', { class: 'btn-icon', href: '#/', 'aria-label': 'Leave' }, icon('back', 20)), h('h1', null, 'Live 1v1'), h('span', { class: 'room-code' }, `Room ${this.net.code}`)),
      h('section', { class: 'card duel-lobby' }, h('div', { class: 'duel-vs' }, playerCard(this.me, isHost ? 'Host' : 'You'), h('div', { class: 'vs' }, 'VS'), h('div', { class: 'opp-slot' }, playerCard(opp, isHost ? 'Challenger' : 'Host'), this.emoteHost)), settingsEl, startBtn, opp ? this.emoteBar() : null),
      isHost
        ? h(
            'section',
            { class: 'card invite' },
            h('div', null, h('b', null, 'Invite link'), h('code', null, this.link)),
            h('button', { class: 'btn', onclick: () => shareLink(this.link, 'Duel me in Anteater Guesser') }, icon('copy', 15), 'Copy link'),
          )
        : null,
    );
    this.root.replaceChildren(topbar(), this.lobbyEl);
  }

  private emoteBar(): HTMLElement {
    return h('div', { class: 'emote-bar' }, EMOTES.map((e, i) => h('button', { class: 'emote', title: `Send ${e} (${i + 1})`, onclick: () => this.sendEmote(e) }, e)));
  }

  sendEmote(e: string) {
    this.net.send({ t: 'emote', e });
    this.showEmote(e, true);
  }

  private showEmote(e: string, mine = false) {
    const host = this.view === 'game' ? this.game?.emoteHost(mine) : mine ? null : this.emoteHost;
    if (!host) return;
    const b = h('span', { class: 'emote-pop' }, e);
    host.append(b);
    setTimeout(() => b.remove(), 2200);
  }

  private hostStart() {
    if (!this.opp.player) return;
    const seed = randomSeed();
    this.net.send({ t: 'start', seed, rounds: this.rounds, zone: this.zone });
    this.startGame({ mode: 'drop', zone: this.zone, rounds: this.rounds, seed });
  }

  private startGame(cfg: GameConfig) {
    this.wantsRematch = { me: false, opp: false };
    this.game?.destroy();
    this.view = 'game';
    this.root.replaceChildren();
    this.game = new DuelGame(this.root, this.net, cfg, this.me, () => this.opp, {
      emote: (e) => this.sendEmote(e),
      rematch: () => {
        this.wantsRematch.me = true;
        this.net.send({ t: 'rematch' });
        this.game?.markRematch(this.wantsRematch);
        this.maybeRematch();
      },
      lobby: () => this.backToLobby(true),
    });
  }

  private maybeRematch() {
    if (this.net.isHost && this.wantsRematch.me && this.wantsRematch.opp) this.hostStart();
  }

  private backToLobby(tell: boolean) {
    if (tell) this.net.send({ t: 'lobby' });
    this.game?.destroy();
    this.game = null;
    this.showLobby();
  }
}

interface DuelActions {
  emote: (e: string) => void;
  rematch: () => void;
  lobby: () => void;
}

type Phase = 'countdown' | 'playing' | 'waiting' | 'reveal' | 'final';

class DuelGame {
  private hud: GameHud;
  private map: MapView;
  private runner: RoundRunner | null = null;
  private phase: Phase = 'countdown';
  private alive = true;
  private round = 0;
  private myRecords: RoundRecord[] = [];
  private myScores: RoundScore[] = [];
  private oppScores: RoundScore[] = [];
  private oppPins = new Map<number, { time: number; pin: { x: number; y: number } | null }>();
  private oppNext = new Set<number>();
  private oppStatus: HTMLElement;
  private oppScoreEl: HTMLElement;
  private oppEmotes: HTMLElement;
  private myEmotes: HTMLElement;
  private bits: Array<Marker | Shape> = [];
  private waiters: Array<() => void> = [];
  private lastCamSent = 0;
  private finalEl: HTMLElement | null = null;

  constructor(
    root: HTMLElement,
    private net: DuelNet,
    private cfg: GameConfig,
    private me: NetPlayer,
    private opp: () => OppState,
    private act: DuelActions,
  ) {
    const o = opp().player;
    this.oppStatus = h('small', null, 'getting ready…');
    this.oppScoreEl = h('small', null, '0 pts');
    this.oppEmotes = h('div', { class: 'emote-float' });
    this.myEmotes = h('div', { class: 'emote-float mine' });
    const right = h(
      'div',
      { class: 'hud-card opp-card' },
      h('div', { class: 'mini-av', html: o ? avatarSVG(o.av, 40) : '' }),
      h('div', null, h('b', null, icon('swords', 13), ' ', o?.name ?? 'Opponent'), this.oppScoreEl, this.oppStatus),
      this.oppEmotes,
    );
    const emotes = h('div', { class: 'emote-bar in-game' }, EMOTES.map((e, i) => h('button', { class: 'emote', title: `${e} (${i + 1})`, onclick: () => this.act.emote(e) }, e)), this.myEmotes);
    this.hud = createGameHud({
      right,
      onLock: () => this.runner?.lock(),
      onZoom: (dz) => this.phase === 'playing' && this.map.zoomBy(dz),
      quitTo: '/duel',
      hint: 'Double-click or Space to lock in · Your opponent sees your view',
      extra: emotes,
    });
    root.append(this.hud.el);
    this.map = getMap(this.hud.mapHost);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    void this.run();
  }

  destroy() {
    this.alive = false;
    this.runner?.abort();
    this.clearReveal();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.map.interactive = true;
    this.hud.el.remove();
  }

  emoteHost(mine: boolean) {
    return mine ? this.myEmotes : this.oppEmotes;
  }

  onMsg(m: Msg) {
    if (m.t === 'pin') {
      this.oppPins.set(m.round, { time: m.time, pin: m.x == null || m.y == null ? null : { x: m.x, y: m.y } });
      if (m.round === this.round) {
        this.oppStatus.textContent = `locked in · ${fmtTime(m.time)}`;
        if (this.phase === 'playing' && this.runner) {
          this.runner.setDeadline(DUEL_HURRY_MS);
          this.showBanner(`${this.opp().player?.name ?? 'Opponent'} locked in! ${DUEL_HURRY_MS / 1000} seconds left`);
          sfx.hurry();
        }
      }
    } else if (m.t === 'next') this.oppNext.add(m.round);
    else if (m.t === 'go') this.goSignals.add(m.round);
    this.wake();
  }

  private goSignals = new Set<number>();

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }

  /** Resolve when the predicate holds (re-checked whenever a network message arrives). */
  private until(pred: () => boolean): Promise<void> {
    return new Promise((res) => {
      const check = () => {
        if (!this.alive) return;
        if (pred()) res();
        else this.waiters.push(check);
      };
      check();
    });
  }

  opponentLeft(reason: string) {
    if (!this.alive) return;
    this.runner?.abort();
    this.alive = false;
    this.hud.modal.replaceChildren(
      h('div', { class: 'modal' }, h('h2', null, 'Opponent left'), h('p', null, reason), h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => navigate('/duel') }, 'New room'), h('button', { class: 'btn', onclick: () => navigate('/') }, 'Home'))),
    );
    this.hud.modal.hidden = false;
  }

  markRematch(w: { me: boolean; opp: boolean }) {
    if (!this.finalEl) return;
    const lbl = this.finalEl.querySelector('.rematch-state');
    if (lbl) lbl.textContent = w.me && w.opp ? 'Starting…' : w.me ? 'Waiting for your opponent to accept…' : w.opp ? `${this.opp().player?.name ?? 'Opponent'} wants a rematch!` : '';
  }

  private showBanner(text: string) {
    this.hud.banner.textContent = text;
    this.hud.banner.hidden = false;
  }

  private async run() {
    const hud = this.hud;
    const starts = roundStarts(this.cfg);
    for (let i = 0; i < this.cfg.rounds; i++) {
      this.round = i;
      hud.roundLbl.textContent = `Round ${i + 1}/${this.cfg.rounds}`;
      hud.banner.hidden = true;
      this.oppStatus.textContent = 'getting ready…';
      this.opp().cam = null; // no stale viewport box from the previous round
      // The host paces the rounds; the guest waits for its go signal.
      if (this.net.isHost) this.net.send({ t: 'go', round: i });
      else await this.until(() => this.goSignals.has(i));
      if (!this.alive) return;

      const runner = new RoundRunner({
        map: this.map,
        ui: { timer: hud.timer, lockBtn: hud.lockBtn, countdown: hud.countdown },
        start: starts[i],
        limitMs: ROUND_TIME_LIMIT_MS,
        pinSkin: this.me.av.pin,
        liveGhost: () => {
          const c = this.opp().cam;
          return c && performance.now() - c.at < 4000 ? c : null;
        },
        onCam: (cam) => this.sendCam(cam),
      });
      this.runner = runner;
      this.phase = 'countdown';
      hud.el.classList.remove('revealing');
      hud.el.classList.add('counting');
      await runner.countdown();
      hud.el.classList.remove('counting');
      if (!this.alive) return;
      this.phase = 'playing';
      const playing = runner.play();
      // Opponent already locked in while we were counting down: the hurry clock starts now.
      if (this.oppPins.has(i)) {
        runner.setDeadline(DUEL_HURRY_MS);
        this.showBanner(`${this.opp().player?.name ?? 'Opponent'} locked in! ${DUEL_HURRY_MS / 1000} seconds left`);
      } else this.oppStatus.textContent = 'searching…';
      const rec = await playing;
      if (!this.alive) return;
      this.net.send({ t: 'pin', round: i, time: rec.time, x: rec.pin?.x ?? null, y: rec.pin?.y ?? null });
      this.myRecords.push(rec);
      const mine = scoreRound(rec.pin, rec.time);
      this.myScores.push(mine);

      if (!this.oppPins.has(i)) {
        this.phase = 'waiting';
        this.showBanner(`Locked in! Waiting for ${this.opp().player?.name ?? 'your opponent'}…`);
        await this.until(() => this.oppPins.has(i));
        if (!this.alive) return;
      }
      hud.banner.hidden = true;
      const op = this.oppPins.get(i)!;
      const theirs = scoreRound(op.pin, op.time);
      this.oppScores.push(theirs);
      hud.scoreLbl.textContent = fmtInt(this.myScores.reduce((a, s) => a + s.total, 0));
      this.oppScoreEl.textContent = `${fmtInt(this.oppScores.reduce((a, s) => a + s.total, 0))} pts`;

      this.phase = 'reveal';
      hud.el.classList.add('revealing');
      mine.total >= theirs.total ? sfx.good() : sfx.meh();
      this.bits = await revealRound(this.map, [
        { pin: rec.pin, skin: this.me.av.pin, cls: 'mine', marker: false },
        { pin: op.pin, skin: this.opp().player?.av.pin ?? 'red', cls: 'opp', marker: true },
      ]);
      if (!this.alive) return;
      const last = i === this.cfg.rounds - 1;
      const readyBtn = this.roundSheet(i, mine, theirs, last);
      await this.until(() => readyBtn.dataset.ready === '1');
      this.net.send({ t: 'next', round: i });
      if (!this.oppNext.has(i)) {
        readyBtn.disabled = true;
        readyBtn.textContent = `Waiting for ${this.opp().player?.name ?? 'opponent'}…`;
        await this.until(() => this.oppNext.has(i));
      }
      if (!this.alive) return;
      hud.sheet.hidden = true;
      runner.clearPin();
      this.clearReveal();
    }
    await this.finish();
  }

  private sendCam(cam: Camera) {
    const now = performance.now();
    if (now - this.lastCamSent < 100) return;
    this.lastCamSent = now;
    this.net.send({ t: 'cam', x: cam.x, y: cam.y, z: cam.z, w: Math.round(this.map.w), h: Math.round(this.map.h) });
  }

  private clearReveal() {
    this.bits.forEach((b) => b.remove());
    this.bits = [];
  }

  private roundSheet(i: number, mine: RoundScore, theirs: RoundScore, last: boolean): HTMLButtonElement {
    const oppName = this.opp().player?.name ?? 'Opponent';
    const win = mine.total > theirs.total;
    const tie = mine.total === theirs.total;
    const cell = (s: RoundScore) => h('div', { class: 'duel-cell' }, h('b', { class: 'big' }, '0'), h('small', null, `${Number.isFinite(s.dist) ? fmtDist(s.dist) : 'no pin'} · ${fmtTime(s.time)}`));
    const a = cell(mine);
    const b = cell(theirs);
    const btn = h('button', { class: 'btn primary' }, last ? 'See final result' : 'Ready for next round', h('kbd', null, 'Space'));
    btn.addEventListener('click', () => {
      btn.dataset.ready = '1';
      this.wake();
    });
    this.hud.sheet.replaceChildren(
      h(
        'div',
        { class: 'sheet-inner' },
        h('div', { class: 'sheet-head' }, h('span', { class: 'chip' }, `Round ${i + 1}/${this.cfg.rounds}`), h('span', { class: `verdict ${win ? 'good' : ''}` }, tie ? 'Dead heat!' : win ? 'You take the round!' : `${oppName} takes it`)),
        h('div', { class: 'duel-round' }, h('div', null, h('small', null, 'You'), a), h('div', null, h('small', null, oppName), b)),
        btn,
      ),
    );
    this.hud.sheet.hidden = false;
    countUp(a.querySelector('b')!, mine.total);
    countUp(b.querySelector('b')!, theirs.total);
    return btn;
  }

  private async finish() {
    this.phase = 'final';
    const oppP = this.opp().player;
    const oppName = oppP?.name ?? 'Opponent';
    const sum = summarize({ rounds: this.myRecords });
    const oppTotal = this.oppScores.reduce((a, s) => a + s.total, 0);
    const oppTime = this.oppScores.reduce((a, s) => a + s.time, 0);
    const result: 'win' | 'loss' | 'draw' = sum.total > oppTotal ? 'win' : sum.total < oppTotal ? 'loss' : 'draw';
    const rewards = applyRewards(this.cfg, sum, { duel: result });
    const run: RunData = {
      cfg: this.cfg,
      date: Date.now(),
      player: { name: profile.name, level: rewards.lvlBefore, av: { ...profile.av } },
      vw: Math.round(this.map.w),
      vh: Math.round(this.map.h),
      rounds: this.myRecords,
      vs: { name: oppName, total: oppTotal, time: oppTime },
    };
    const code = await runToCode(run);
    if (!this.alive) return;
    recordRun(run, code, 'duel', { opp: oppName, result });
    result === 'win' ? sfx.pb() : sfx.meh();

    const rows = this.myScores.map((s, i) => {
      const o = this.oppScores[i];
      return h('tr', null, h('td', null, String(i + 1)), h('td', { class: s.total >= o.total ? 'win' : '' }, `${fmtInt(s.total)} · ${fmtTime(s.time)}`), h('td', { class: o.total >= s.total ? 'win' : '' }, `${fmtInt(o.total)} · ${fmtTime(o.time)}`));
    });
    this.finalEl = h(
      'div',
      { class: 'modal summary' },
      h(
        'div',
        { class: `duel-final ${result}` },
        h('div', { class: 'df-side' }, h('div', { html: avatarSVG(this.me.av, 72) }), h('b', null, 'You'), h('span', { class: 'df-score' }, fmtInt(sum.total))),
        h('div', { class: 'df-mid' }, h('span', { class: 'df-result' }, result === 'win' ? 'VICTORY' : result === 'loss' ? 'DEFEAT' : 'DRAW'), h('small', null, categoryName(this.cfg))),
        h('div', { class: 'df-side' }, h('div', { html: oppP ? avatarSVG(oppP.av, 72) : '' }), h('b', null, oppName), h('span', { class: 'df-score' }, fmtInt(oppTotal))),
      ),
      h('table', { class: 'rounds duel-table' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'You'), h('th', null, oppName))), h('tbody', null, rows)),
      ...rewardsBlock(rewards),
      h('p', { class: 'rematch-state muted small' }),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => this.act.rematch() }, icon('restart', 16), 'Rematch'),
        h('button', { class: 'btn', onclick: () => this.act.lobby() }, icon('gear', 15), 'Change settings'),
        h('button', { class: 'btn', onclick: () => navigate(`/r/${code}?v=watch`) }, icon('play', 14), 'Watch my replay'),
        h('button', { class: 'btn', onclick: () => shareLink(runUrl(code, 'race'), 'Beat my Anteater Guesser run') }, icon('link', 15), 'Share my run'),
        h('button', { class: 'btn ghosty', onclick: () => navigate('/') }, 'Leave'),
      ),
    );
    this.hud.modal.replaceChildren(this.finalEl);
    this.hud.modal.hidden = false;
  }

  private onKey = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    const k = e.key;
    if (k >= '1' && k <= String(EMOTES.length)) {
      this.act.emote(EMOTES[Number(k) - 1]);
      return;
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (this.phase === 'playing') this.runner?.lock();
      else if (this.phase === 'reveal') (this.hud.sheet.querySelector('button.btn.primary') as HTMLButtonElement | null)?.click();
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
