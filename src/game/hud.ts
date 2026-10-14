// In-game HUD and round reveal, shared by solo runs, ghost races and live duels.

import { h, icon } from '../util/dom';
import { fmtInt } from '../util/format';
import { motionReduced, settings } from '../settings';
import { navigate } from '../router';
import type { MapView, Marker, Shape } from '../map/MapView';
import type { Pt } from '../util/geo';
import { FOOTPRINT_PTS, TARGET_PT, pinEl, targetEl, targetThumb } from './mapHost';

export interface GameHud {
  el: HTMLElement;
  mapHost: HTMLElement;
  timer: HTMLElement;
  roundLbl: HTMLElement;
  scoreLbl: HTMLElement;
  lockBtn: HTMLButtonElement;
  countdown: HTMLElement;
  sheet: HTMLElement;
  modal: HTMLElement;
  hint: HTMLElement;
  banner: HTMLElement;
}

export interface HudOpts {
  right: HTMLElement;
  onLock: () => void;
  onZoom: (dz: number) => void;
  quitTo?: string;
  hint?: string;
  extra?: HTMLElement | null;
}

export function createGameHud(o: HudOpts): GameHud {
  const mapHost = h('div', { class: 'map-host' });
  const timer = h('div', { class: 'timer', 'aria-live': 'off' }, '0.00');
  const roundLbl = h('span', null, '');
  const scoreLbl = h('span', null, '0');
  const lockBtn = h('button', { class: 'btn lock', disabled: true, onclick: o.onLock }, icon('lock', 18), 'Lock in', h('kbd', null, 'Space'));
  const countdown = h('div', { class: 'countdown', hidden: true });
  const sheet = h('div', { class: 'sheet', hidden: true });
  const modal = h('div', { class: 'modal-wrap', hidden: true });
  const banner = h('div', { class: 'banner', hidden: true });
  const hint = h('div', { class: 'hint' }, o.hint ?? (settings.oneClick ? 'One-click mode: your first click locks in' : 'Click to place a pin · Double-click or Space to lock in · R for a new drop'));
  const el = h(
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
          h('button', { class: 'btn-icon', title: 'Quit (Esc)', 'aria-label': 'Quit', onclick: () => navigate(o.quitTo ?? '/') }, icon('back', 20)),
          h('div', { class: 'hud-card target-card' }, targetThumb(52), h('div', null, h('small', null, 'Find'), h('b', null, '26 Murasaki St'), h('small', null, 'Irvine, CA'))),
        ),
        h('div', { class: 'hud-center' }, timer, h('div', { class: 'hud-sub' }, roundLbl, ' · ', scoreLbl, ' pts')),
        h('div', { class: 'hud-right' }, o.right),
      ),
      banner,
      h(
        'div',
        { class: 'zoom-ctl' },
        h('button', { class: 'btn-icon', 'aria-label': 'Zoom in', onclick: () => o.onZoom(1) }, icon('plus', 20)),
        h('button', { class: 'btn-icon', 'aria-label': 'Zoom out', onclick: () => o.onZoom(-1) }, icon('minus', 20)),
      ),
      h('div', { class: 'hud-bottom' }, hint, lockBtn),
      o.extra ?? null,
    ),
    countdown,
    sheet,
    modal,
  );
  return { el, mapHost, timer, roundLbl, scoreLbl, lockBtn, countdown, sheet, modal, hint, banner };
}

export interface RevealPin {
  pin: Pt | null;
  skin: string;
  cls: 'mine' | 'ghost' | 'opp';
  /** Draw a marker for this pin (the player's own marker already exists). */
  marker: boolean;
}

/** Target, house outline and a line from each pin; flies to frame them. Returns cleanup. */
export async function revealRound(map: MapView, pins: RevealPin[]): Promise<Array<Marker | Shape>> {
  const bits: Array<Marker | Shape> = [];
  const tgt = map.addMarker(targetEl());
  tgt.set(TARGET_PT.x, TARGET_PT.y);
  bits.push(tgt, map.addPath(() => FOOTPRINT_PTS, 'footprint', true));
  const pts: Pt[] = [TARGET_PT];
  for (const r of pins) {
    if (!r.pin) continue;
    const p = r.pin;
    bits.push(map.addPath(() => [p, { x: map.nearestWrap(TARGET_PT.x, p.x), y: TARGET_PT.y }], `line ${r.cls}`));
    if (r.marker) {
      const m = map.addMarker(pinEl(r.skin, r.cls === 'mine' ? 'mine' : 'ghost'));
      m.set(p.x, p.y);
      bits.push(m);
    }
    pts.push(p);
  }
  // Keep the pins clear of the HUD at the top and the result sheet at the bottom.
  const side = Math.min(90, map.w / 8);
  const cam = map.fitCamera(pts, { top: Math.min(130, map.h / 5), bottom: Math.min(250, map.h / 2.6), left: side, right: side }, 19);
  await map.flyTo(cam.x, cam.y, cam.z, 1400);
  return bits;
}

export function countUp(el: HTMLElement, to: number) {
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

export function keyDir(k: string): 'l' | 'r' | 'u' | 'd' | null {
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

export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
};
