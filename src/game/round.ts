// One round: countdown, timer, pin placement, lock-in, camera recording.
// Shared by solo runs, ghost races and live duels.

import type { Camera, MapView, Marker, Shape } from '../map/MapView';
import type { Pt } from '../util/geo';
import { fmtTime } from '../util/format';
import { effectiveQuality, settings } from '../settings';
import { sfx } from './sfx';
import { pinEl } from './mapHost';
import { TrackRecorder, pinAt, trackAt } from './replay';
import { prefetchZoomOut, setPrefetchPaused } from '../map/prefetch';
import { unproject } from '../util/geo';
import type { PinEvent, RoundRecord } from './runs';

export interface GhostRound {
  name: string;
  record: RoundRecord;
  vw: number;
  vh: number;
  pinSkin: string;
}

export interface RoundUI {
  timer: HTMLElement;
  lockBtn: HTMLButtonElement;
  countdown: HTMLElement;
  ghostStatus?: HTMLElement | null;
}

export interface RoundOpts {
  map: MapView;
  ui: RoundUI;
  start: Camera;
  limitMs: number;
  pinSkin: string;
  ghost?: GhostRound | null;
  /** Live opponent camera (duels); polled every frame. */
  liveGhost?: () => { cam: Camera; w: number; h: number } | null;
  onCam?: (cam: Camera, t: number) => void;
  onLock?: (rec: RoundRecord) => void;
}

export class RoundRunner {
  pin: Pt | null = null;
  readonly pins: PinEvent[] = [];
  private rec = new TrackRecorder();
  private t0 = 0;
  private raf = 0;
  private running = false;
  private done = false;
  private deadline = Infinity;
  private resolve: ((r: RoundRecord) => void) | null = null;
  private pinMarker: Marker | null = null;
  private ghostRect: Shape | null = null;
  private ghostPin: Marker | null = null;
  private liveRect: Shape | null = null;
  private lastTimerText = '';
  private lastTimerUpdate = 0;
  private cdTimers: number[] = [];

  constructor(private o: RoundOpts) {}

  get elapsed() {
    return this.running ? performance.now() - this.t0 : 0;
  }

  /** Shows the start view and counts down. Tiles preload during the countdown. */
  /**
   * Waits until the start view has actually downloaded (so a slow connection never costs
   * clock time), then 3-2-1-GO at one second per step. The map is fully locked until GO.
   */
  async countdown(steps = 3, stepMs = 1000): Promise<void> {
    const { map, ui, start } = this.o;
    map.interactive = false;
    map.stopMotion();
    map.clearKeys();
    map.setView(start.x, start.y, start.z);
    ui.timer.textContent = fmtTime(0);
    ui.lockBtn.disabled = true;
    const ll = unproject(start.x, start.y);
    prefetchZoomOut(ll.lat, ll.lng, start.z);
    const cd = ui.countdown;
    cd.hidden = false;
    cd.textContent = 'Loading map…';
    cd.className = 'countdown loading';
    await map.whenReady(10_000);
    if (this.done) return;
    return new Promise((res) => {
      for (let i = 0; i <= steps; i++) {
        this.cdTimers.push(
          window.setTimeout(() => {
            if (i < steps) {
              cd.textContent = String(steps - i);
              cd.className = 'countdown pop';
              sfx.tick();
            } else {
              cd.textContent = 'GO';
              cd.className = 'countdown pop go';
              sfx.go();
              this.cdTimers.push(window.setTimeout(() => (cd.hidden = true), 380));
              res();
            }
            // restart the CSS animation
            void cd.offsetWidth;
          }, i * stepMs),
        );
      }
    });
  }

  play(): Promise<RoundRecord> {
    const { map } = this.o;
    this.running = true;
    this.t0 = performance.now();
    this.rec.push(0, map.cam);
    map.interactive = true;
    setPrefetchPaused(true);
    map.onMove = (cam) => {
      const t = performance.now() - this.t0;
      this.rec.push(t, cam);
      this.o.onCam?.(cam, t);
    };
    map.onClick = (p) => this.placePin(p);
    // Double-click / double-tap: pin it and lock it in, in one motion.
    map.onDoubleClick = (p) => {
      this.placePin(p);
      this.lock();
    };
    if (this.o.ghost && settings.showGhost) this.setupGhost(this.o.ghost);
    if (this.o.liveGhost) this.liveRect = map.addViewRect(this.o.liveGhost, 'vrect live');
    this.loop();
    return new Promise((res) => (this.resolve = res));
  }

  placePin(p: Pt) {
    if (!this.running) return;
    const t = performance.now() - this.t0;
    const x = p.x - Math.floor(p.x);
    this.pin = { x, y: p.y };
    this.pins.push({ t, x, y: p.y });
    if (!this.pinMarker) this.pinMarker = this.o.map.addMarker(pinEl(this.o.pinSkin, 'mine drop'));
    else {
      // Re-trigger the drop animation.
      this.pinMarker.el.classList.remove('drop');
      void this.pinMarker.el.offsetWidth;
      this.pinMarker.el.classList.add('drop');
    }
    this.pinMarker.set(x, p.y);
    this.o.ui.lockBtn.disabled = false;
    sfx.pin();
    if (settings.oneClick) this.lock();
  }

  lock() {
    if (!this.running || !this.pin) return;
    sfx.lock();
    this.finish(performance.now() - this.t0);
  }

  /** Force the round to end `ms` from now (duel hurry-up). */
  setDeadline(ms: number) {
    if (!this.running) return;
    this.deadline = Math.min(this.deadline, this.elapsed + ms);
  }

  /** Stop without producing a result (restart / quit). */
  abort() {
    this.running = false;
    this.done = true;
    this.teardown();
    this.pinMarker?.remove();
    this.pinMarker = null;
  }

  /** Remove the pin marker (after the reveal is over). */
  clearPin() {
    this.pinMarker?.remove();
    this.pinMarker = null;
  }

  private finish(t: number) {
    if (this.done) return;
    this.done = true;
    this.running = false;
    const { map } = this.o;
    const time = Math.round(Math.min(t, this.o.limitMs));
    this.rec.finish(time, map.cam);
    this.teardown();
    this.o.ui.timer.textContent = fmtTime(time);
    const rec: RoundRecord = { time, pin: this.pin, pins: this.pins, track: this.rec.track };
    this.o.onLock?.(rec);
    this.resolve?.(rec);
  }

  private teardown() {
    setPrefetchPaused(false);
    cancelAnimationFrame(this.raf);
    this.cdTimers.forEach(clearTimeout);
    this.cdTimers = [];
    this.o.ui.countdown.hidden = true;
    const { map } = this.o;
    map.onMove = null;
    map.onClick = null;
    map.onDoubleClick = null;
    map.interactive = false;
    map.clearKeys();
    map.stopMotion();
    this.o.ui.lockBtn.disabled = true;
    this.ghostRect?.remove();
    this.ghostPin?.remove();
    this.liveRect?.remove();
    this.ghostRect = this.ghostPin = this.liveRect = null;
  }

  private setupGhost(g: GhostRound) {
    const { map } = this.o;
    this.ghostRect = map.addViewRect(() => {
      const t = this.elapsed;
      if (t > g.record.time) return null;
      const cam = trackAt(g.record.track, t);
      return cam ? { cam, w: g.vw, h: g.vh } : null;
    }, 'vrect ghost');
    this.ghostPin = map.addMarker(pinEl(g.pinSkin, 'ghost'));
    this.ghostPin.show(false);
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const t = now - this.t0;
    const low = effectiveQuality() === 'low';
    if (!low || now - this.lastTimerUpdate > 60) {
      const txt = fmtTime(t, low ? 1 : 2);
      if (txt !== this.lastTimerText) {
        this.o.ui.timer.textContent = txt;
        this.lastTimerText = txt;
      }
      this.lastTimerUpdate = now;
    }
    const remaining = Math.min(this.o.limitMs, this.deadline) - t;
    this.o.ui.timer.classList.toggle('hurry', remaining < 10_000);
    const g = this.o.ghost;
    if (g && this.ghostPin) {
      const p = t >= g.record.time ? g.record.pin : pinAt(g.record.pins, t);
      if (p) {
        if (!this.ghostPin.visible) this.ghostPin.show(true);
        this.ghostPin.set(p.x, p.y);
      }
      if (this.o.ui.ghostStatus) {
        const st = t >= g.record.time ? `locked in at ${fmtTime(g.record.time)}` : p ? 'pin placed…' : 'searching…';
        if (this.o.ui.ghostStatus.textContent !== st) this.o.ui.ghostStatus.textContent = st;
      }
    }
    if (this.ghostRect || this.liveRect) this.o.map.refreshOverlays();
    if (remaining <= 0) {
      this.finish(t);
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}
