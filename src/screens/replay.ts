// Replay viewer: plays back the recorded camera path, pin drops and reveal for each round.

import { h, icon, shareLink } from '../util/dom';
import { fmtDist, fmtInt, fmtTime } from '../util/format';
import { navigate } from '../router';
import { getMap, TARGET_PT, FOOTPRINT_PTS, pinEl, targetEl } from '../game/mapHost';
import { pinAt, trackAt } from '../game/replay';
import { runUrl, summarize, type RunData } from '../game/runs';
import { avatarSVG } from '../profile/avatar';
import type { Marker, Shape } from '../map/MapView';

const SPEEDS = [0.5, 1, 2, 4];
const HOLD_MS = 2600;

export function replayScreen(root: HTMLElement, run: RunData, code: string): () => void {
  const sum = summarize(run);
  const mapHost = h('div', { class: 'map-host' });
  const timer = h('div', { class: 'timer' }, '0.00');
  const roundLbl = h('span', null, '');
  const status = h('span', null, '');
  const scrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, step: 1, class: 'scrub', 'aria-label': 'Seek' });
  const playBtn = h('button', { class: 'btn-icon', 'aria-label': 'Play/pause' }, icon('pause', 18));
  let speedIdx = 1;
  const speedBtn = h('button', { class: 'btn small', title: 'Playback speed' }, '1×');
  const roundChips = h('div', { class: 'round-chips' });
  const sheet = h('div', { class: 'sheet', hidden: true });

  const el = h(
    'div',
    { class: 'game replay' },
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
          h('button', { class: 'btn-icon', 'aria-label': 'Back', onclick: () => navigate(`/r/${code}`) }, icon('back', 20)),
          h('div', { class: 'hud-card' }, h('div', { class: 'mini-av', html: avatarSVG(run.player.av, 40) }), h('div', null, h('small', null, 'Replay'), h('b', null, run.player.name), h('small', null, `${fmtInt(sum.total)} pts · ${fmtTime(sum.time)}`))),
        ),
        h('div', { class: 'hud-center' }, timer, h('div', { class: 'hud-sub' }, roundLbl, ' · ', status)),
        h('div', { class: 'hud-right' }, h('button', { class: 'btn primary small', onclick: () => navigate(`/r/${code}?v=go`) }, icon('ghost', 15), 'Race this ghost')),
      ),
      h('div', { class: 'replay-bar' }, playBtn, scrub, speedBtn, roundChips),
    ),
    sheet,
  );
  root.append(el);
  const map = getMap(mapHost);
  map.interactive = false;

  let round = 0;
  let t = 0;
  let playing = true;
  let raf = 0;
  let last = 0;
  let holdUntil = 0;
  /** Each round pauses briefly on its first frame so the start view's tiles can load. */
  let preloadUntil = 0;
  let revealed = false;
  let pin: Marker | null = null;
  let bits: Array<Marker | Shape> = [];

  const rounds = run.rounds;
  rounds.forEach((_, i) => {
    roundChips.append(h('button', { class: 'chip-btn', onclick: () => goRound(i, true) }, `R${i + 1}`));
  });

  const clearReveal = () => {
    bits.forEach((b) => b.remove());
    bits = [];
    revealed = false;
    sheet.hidden = true;
  };

  const goRound = (i: number, play = playing) => {
    round = i;
    t = 0;
    holdUntil = 0;
    preloadUntil = performance.now() + 700;
    clearReveal();
    pin?.remove();
    pin = null;
    roundLbl.textContent = `Round ${i + 1}/${rounds.length}`;
    [...roundChips.children].forEach((c, k) => c.classList.toggle('on', k === i));
    playing = play;
    syncPlayBtn();
    draw();
  };

  const reveal = async () => {
    revealed = true;
    const r = rounds[round];
    const s = sum.scores[round];
    const tg = map.addMarker(targetEl());
    tg.set(TARGET_PT.x, TARGET_PT.y);
    bits.push(tg, map.addPath(() => FOOTPRINT_PTS, 'footprint', true));
    const pts = [TARGET_PT];
    if (r.pin) {
      const p = r.pin;
      bits.push(map.addPath(() => [p, { x: map.nearestWrap(TARGET_PT.x, p.x), y: TARGET_PT.y }], 'line mine'));
      pts.push(p);
    }
    sheet.replaceChildren(
      h(
        'div',
        { class: 'sheet-inner compact' },
        h('div', { class: 'sheet-head' }, h('span', { class: 'chip' }, `Round ${round + 1}/${rounds.length}`), h('span', { class: `verdict ${s.onTarget ? 'good' : ''}` }, !Number.isFinite(s.dist) ? 'No pin' : s.dist === 0 ? 'On the roof!' : fmtDist(s.dist))),
        h('div', { class: 'stats' }, h('div', null, h('small', null, 'Time'), h('b', null, fmtTime(s.time))), h('div', null, h('small', null, 'Accuracy'), h('b', null, fmtInt(s.acc))), h('div', null, h('small', null, 'Speed'), h('b', null, fmtInt(s.speed))), h('div', { class: 'tot' }, h('small', null, 'Round'), h('b', null, fmtInt(s.total)))),
      ),
    );
    sheet.hidden = false;
    const side = Math.min(90, map.w / 8);
    const cam = map.fitCamera(pts, { top: Math.min(130, map.h / 5), bottom: Math.min(230, map.h / 2.8), left: side, right: side }, 19);
    await map.flyTo(cam.x, cam.y, cam.z, 1200);
  };

  const draw = () => {
    const r = rounds[round];
    const tt = Math.min(t, r.time);
    timer.textContent = fmtTime(tt);
    scrub.value = String(Math.round((tt / Math.max(1, r.time)) * 1000));
    if (t >= r.time) {
      status.textContent = 'locked in';
      if (!revealed) {
        pin?.remove();
        pin = null;
        void reveal();
      }
      return;
    }
    if (revealed) clearReveal();
    const cam = trackAt(r.track, tt);
    if (cam) {
      map.setView(cam.x, cam.y, cam.z);
      map.renderNow();
    }
    const p = pinAt(r.pins, tt);
    status.textContent = p ? 'pin placed' : 'searching';
    if (p) {
      if (!pin) pin = map.addMarker(pinEl(run.player.av.pin, 'mine drop'));
      pin.set(p.x, p.y);
    } else if (pin) {
      pin.remove();
      pin = null;
    }
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (!playing || now < preloadUntil) return;
    const r = rounds[round];
    if (t < r.time) {
      t += dt * SPEEDS[speedIdx];
      draw();
      if (t >= r.time) holdUntil = now + HOLD_MS;
    } else if (now >= holdUntil) {
      if (round + 1 < rounds.length) goRound(round + 1, true);
      else {
        playing = false;
        syncPlayBtn();
        showEnd();
      }
    }
  };

  const showEnd = () => {
    sheet.replaceChildren(
      h(
        'div',
        { class: 'sheet-inner compact' },
        h('div', { class: 'sheet-head' }, h('b', null, `${run.player.name}: ${fmtInt(sum.total)} pts in ${fmtTime(sum.time)}`)),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => navigate(`/r/${code}?v=go`) }, icon('ghost', 16), 'Race this ghost'),
          h('button', { class: 'btn', onclick: () => goRound(0, true) }, icon('restart', 15), 'Watch again'),
          h('button', { class: 'btn', onclick: () => shareLink(runUrl(code, 'watch'), 'Anteater Guesser replay') }, icon('link', 15), 'Copy replay link'),
        ),
      ),
    );
    sheet.hidden = false;
  };

  const syncPlayBtn = () => playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 18));
  playBtn.addEventListener('click', () => {
    const r = rounds[round];
    if (!playing && t >= r.time && round === rounds.length - 1) {
      goRound(0, true);
      return;
    }
    playing = !playing;
    syncPlayBtn();
  });
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedBtn.textContent = `${SPEEDS[speedIdx]}×`;
  });
  scrub.addEventListener('input', () => {
    const r = rounds[round];
    t = (Number(scrub.value) / 1000) * r.time;
    if (t >= r.time) holdUntil = performance.now() + HOLD_MS;
    draw();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      playBtn.click();
    } else if (e.key === 'Escape') navigate(`/r/${code}`);
    else if (e.key === 'ArrowRight') {
      t = Math.min(rounds[round].time, t + 2000);
      draw();
    } else if (e.key === 'ArrowLeft') {
      t = Math.max(0, t - 2000);
      draw();
    }
  };
  window.addEventListener('keydown', onKey);

  goRound(0, true);
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    clearReveal();
    pin?.remove();
    map.stopMotion();
    el.remove();
  };
}
