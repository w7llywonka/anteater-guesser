// A purpose-built satellite map. No mapping library: just <img> tiles inside a handful of
// GPU-composited layers whose transform is the only thing that changes while panning.
//
// Performance notes:
//  - One transform per zoom level per frame; tiles themselves are never moved after creation.
//  - Tiles load centre-first; anything that scrolls away or belongs to an abandoned zoom
//    level is cancelled before it finishes downloading.
//  - The render loop only runs while something is moving, so an idle map costs nothing.
//  - Quality presets trade sharpness for tile count on weak devices (see settings.ts).

import { HIRES_BOX, MAX_ZOOM, ATTRIBUTION, imageryUrl, placesUrl, roadsUrl } from '../config';
import { perfProfile, settings, type PerfProfile } from '../settings';
import type { Pt } from '../util/geo';

export interface Camera { x: number; y: number; z: number }

const TILE = 256;
const EMPTY = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const LN2 = Math.LN2;

interface TileSource {
  url: (z: number, x: number, y: number) => string;
  minZoom: number;
  maxZoom: (cam: Camera) => number;
  cls: string;
  /** Extra level bias. Labels lean towards the lower level so text renders larger. */
  bias?: number;
  /** Never show a stale level underneath (stretched label text looks broken). */
  solo?: boolean;
}

interface Tile { img: HTMLImageElement; tx: number; ty: number; done: boolean; started: boolean; url: string }
interface Level { z: number; el: HTMLDivElement; ox: number; oy: number; tiles: Map<number, Tile>; pending: number }

const tileKey = (tx: number, ty: number) => (tx + 16777216) * 4194304 + ty;

const inHiRes = (cam: Camera) => {
  // Cheap inverse of the projection bounds, computed once.
  return cam.x >= HIRES_X0 && cam.x <= HIRES_X1 && cam.y >= HIRES_Y0 && cam.y <= HIRES_Y1;
};
const HIRES_X0 = (HIRES_BOX.minLng + 180) / 360;
const HIRES_X1 = (HIRES_BOX.maxLng + 180) / 360;
const mercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const HIRES_Y0 = mercY(HIRES_BOX.maxLat);
const HIRES_Y1 = mercY(HIRES_BOX.minLat);

const IMAGERY: TileSource = { url: imageryUrl, minZoom: 0, maxZoom: (c) => (inHiRes(c) ? 20 : 19), cls: 'img' };
const PLACES: TileSource = { url: placesUrl, minZoom: 0, maxZoom: () => 19, cls: 'lbl', bias: -0.35, solo: true };
const ROADS: TileSource = { url: roadsUrl, minZoom: 5, maxZoom: () => 19, cls: 'lbl', bias: -0.35, solo: true };

/**
 * Whole-world z2 mosaic (16 small tiles, loaded once) under everything, so zooming out
 * faster than tiles can load shows blurry Earth instead of black.
 */
class Backdrop {
  readonly el: HTMLDivElement;
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'tlvl backdrop';
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const img = document.createElement('img');
        img.className = 'tl on';
        img.alt = '';
        img.decoding = 'async';
        img.style.left = `${x * TILE}px`;
        img.style.top = `${y * TILE}px`;
        img.src = imageryUrl(2, x, y);
        this.el.append(img);
      }
    }
  }

  position(cam: Camera, w: number, h: number) {
    if (cam.z > 12) {
      this.el.style.visibility = 'hidden';
      return;
    }
    this.el.style.visibility = '';
    const scale = 2 ** (cam.z - 2);
    const S = TILE * 4;
    // The world wraps: shift by whole worlds so the copy nearest the camera is drawn.
    const tx = w / 2 + (Math.floor(cam.x) - cam.x) * S * scale;
    const ty = h / 2 - cam.y * S * scale;
    this.el.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`;
  }
}

class TileLayer {
  readonly el: HTMLDivElement;
  private levels = new Map<number, Level>();
  private active: Level | null = null;
  private pruneTimer = 0;
  // Request queue: tiles get a src only when a slot is free, so tiles for levels we zoom
  // straight through are dropped before they ever touch the network.
  private queue: Tile[] = [];
  private inflight = 0;

  constructor(private src: TileSource, private perf: () => PerfProfile) {
    this.el = document.createElement('div');
    this.el.className = `tlayer ${src.cls}`;
  }

  /** Tile level to show for this camera, or -1 when the layer is hidden at this zoom. */
  levelFor(cam: Camera): number {
    if (cam.z < this.src.minZoom - 0.5) return -1;
    const z = Math.round(cam.z + this.perf().tileBias + (this.src.bias ?? 0));
    return Math.max(this.src.minZoom, Math.min(this.src.maxZoom(cam), z));
  }

  get activeZ() {
    return this.active?.z ?? -1;
  }

  /** Every frame: reposition each level with one transform. */
  position(cam: Camera, w: number, h: number, dpr: number) {
    for (const lvl of this.levels.values()) {
      const scale = 2 ** (cam.z - lvl.z);
      const S = TILE * 2 ** lvl.z;
      let tx = w / 2 + (lvl.ox * TILE - cam.x * S) * scale;
      let ty = h / 2 + (lvl.oy * TILE - cam.y * S) * scale;
      tx = Math.round(tx * dpr) / dpr;
      ty = Math.round(ty * dpr) / dpr;
      lvl.el.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`;
    }
  }

  /** Throttled: diff the tile set for the active level against the viewport. */
  update(cam: Camera, w: number, h: number) {
    const perf = this.perf();
    const Z = this.levelFor(cam);
    if (Z < 0) {
      this.clear();
      return;
    }
    let lvl = this.levels.get(Z);
    if (!lvl) {
      const n = 2 ** Z;
      const el = document.createElement('div');
      el.className = 'tlvl';
      lvl = { z: Z, el, ox: Math.floor(cam.x * n), oy: Math.floor(cam.y * n), tiles: new Map(), pending: 0 };
      this.levels.set(Z, lvl);
      this.el.append(el);
    }
    if (this.active !== lvl) {
      if (this.active) this.dropPending(this.active);
      this.active = lvl;
      for (const l of this.levels.values()) l.el.style.zIndex = String(l === lvl ? 64 : 32 - Math.abs(l.z - Z));
      this.limitLevels(this.src.solo ? 1 : perf.maxLevels);
    }

    const n = 2 ** Z;
    const scale = 2 ** (cam.z - Z);
    const cx = cam.x * n * TILE;
    const cy = cam.y * n * TILE;
    const hw = (w / 2 + perf.marginPx) / scale;
    const hh = (h / 2 + perf.marginPx) / scale;
    const tx0 = Math.floor((cx - hw) / TILE);
    const tx1 = Math.floor((cx + hw) / TILE);
    const ty0 = Math.max(0, Math.floor((cy - hh) / TILE));
    const ty1 = Math.min(n - 1, Math.floor((cy + hh) / TILE));

    // Drop tiles that left the viewport (with one tile of slack to avoid thrashing at edges).
    for (const [k, t] of lvl.tiles) {
      if (t.tx < tx0 - 1 || t.tx > tx1 + 1 || t.ty < ty0 - 1 || t.ty > ty1 + 1) this.removeTile(lvl, k, t);
    }

    const missing: Array<[number, number, number]> = [];
    const ccx = cx / TILE - 0.5;
    const ccy = cy / TILE - 0.5;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!lvl.tiles.has(tileKey(tx, ty))) missing.push([tx, ty, (tx - ccx) ** 2 + (ty - ccy) ** 2]);
      }
    }
    if (missing.length) {
      missing.sort((a, b) => a[2] - b[2]);
      const frag = document.createDocumentFragment();
      const fade = perf.fade;
      // New tiles jump the queue ahead of older, less central ones (centre tile first).
      const count = Math.min(missing.length, 400);
      const fresh: Tile[] = [];
      for (let i = 0; i < count; i++) {
        const [tx, ty] = missing[i];
        const t = this.createTile(lvl, tx, ty, n, fade, i < 4);
        frag.append(t.img);
        fresh.push(t);
      }
      this.queue = fresh.concat(this.queue.filter((t) => !t.done));
      lvl.el.append(frag);
    }
    this.pump();
    if (lvl.pending === 0) this.schedulePrune(0);
  }

  private pump() {
    const max = this.perf().maxRequests;
    while (this.inflight < max && this.queue.length) {
      const t = this.queue.shift()!;
      if (t.done) continue;
      t.started = true;
      this.inflight++;
      t.img.src = t.url;
    }
  }

  private createTile(lvl: Level, tx: number, ty: number, n: number, fade: boolean, urgent: boolean): Tile {
    const img = document.createElement('img');
    const wx = ((tx % n) + n) % n;
    const tile: Tile = { img, tx, ty, done: false, started: false, url: this.src.url(lvl.z, wx, ty) };
    img.className = fade ? 'tl' : 'tl on';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    if (urgent) img.setAttribute('fetchpriority', 'high');
    img.style.left = `${(tx - lvl.ox) * TILE}px`;
    img.style.top = `${(ty - lvl.oy) * TILE}px`;
    const finish = (ok: boolean) => {
      if (tile.done) return;
      tile.done = true;
      this.inflight--;
      img.onload = img.onerror = null;
      if (ok) img.classList.add('on');
      else img.style.visibility = 'hidden';
      lvl.pending--;
      if (lvl === this.active && lvl.pending === 0) this.schedulePrune(fade ? 260 : 0);
      this.pump();
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    lvl.pending++;
    lvl.tiles.set(tileKey(tx, ty), tile);
    return tile;
  }

  private removeTile(lvl: Level, key: number, t: Tile) {
    if (!t.done) {
      t.done = true;
      lvl.pending--;
      t.img.onload = t.img.onerror = null;
      if (t.started) {
        this.inflight--;
        t.img.src = EMPTY; // cancels the in-flight request
      }
    }
    t.img.remove();
    lvl.tiles.delete(key);
  }

  /** A level we zoomed away from: keep what is on screen as a backdrop, cancel the rest. */
  private dropPending(lvl: Level) {
    for (const [k, t] of lvl.tiles) if (!t.done) this.removeTile(lvl, k, t);
  }

  private limitLevels(max: number) {
    if (!this.active) return;
    const az = this.active.z;
    const others = [...this.levels.values()].filter((l) => l !== this.active).sort((a, b) => Math.abs(b.z - az) - Math.abs(a.z - az));
    while (others.length > max - 1) this.removeLevel(others.shift()!);
  }

  private schedulePrune(delay: number) {
    clearTimeout(this.pruneTimer);
    this.pruneTimer = window.setTimeout(() => {
      const a = this.active;
      if (!a || a.pending !== 0) return;
      for (const l of [...this.levels.values()]) if (l !== a) this.removeLevel(l);
    }, delay);
  }

  private removeLevel(lvl: Level) {
    for (const [k, t] of lvl.tiles) this.removeTile(lvl, k, t);
    lvl.el.remove();
    this.levels.delete(lvl.z);
    if (this.active === lvl) this.active = null;
  }

  clear() {
    clearTimeout(this.pruneTimer);
    for (const l of [...this.levels.values()]) this.removeLevel(l);
    this.queue = [];
  }
}

export interface Marker {
  el: HTMLElement;
  x: number;
  y: number;
  visible: boolean;
  set(x: number, y: number): void;
  show(v: boolean): void;
  remove(): void;
}

export interface Shape {
  el: SVGElement;
  remove(): void;
}

type ShapeUpdate = () => void;

const SVGNS = 'http://www.w3.org/2000/svg';

export class MapView {
  readonly el: HTMLDivElement;
  readonly cam: Camera = { x: 0.5, y: 0.5, z: 2 };
  w = 1;
  h = 1;
  minZoom = 1;
  maxZoom = MAX_ZOOM;
  interactive = true;

  onMove: ((cam: Camera) => void) | null = null;
  onClick: ((p: Pt) => void) | null = null;
  /** When set, a double-click/tap calls this instead of zooming in. */
  onDoubleClick: ((p: Pt) => void) | null = null;
  /** Fired on any user gesture (used to cancel replays, etc.). */
  onUserInput: (() => void) | null = null;

  private perf: PerfProfile = perfProfile();
  private pane: HTMLDivElement;
  private layers: TileLayer[] = [];
  private imagery: TileLayer;
  private backdrop = new Backdrop();
  private labelLayers: TileLayer[];
  private labelsOn = false;
  private svg: SVGSVGElement;
  private markerHost: HTMLDivElement;
  private markers = new Set<Marker>();
  private shapes = new Map<SVGElement, ShapeUpdate>();
  private dpr = Math.min(3, window.devicePixelRatio || 1);
  private raf = 0;
  private last = 0;
  private dirty = true;
  private ro: ResizeObserver;

  // Animation state
  private zoomAnim: { target: number; ax: number; ay: number } | null = null;
  private inertia: { vx: number; vy: number } | null = null;
  private fly: { t0: number; dur: number; step: (k: number) => Camera; resolve: () => void } | null = null;
  private keys = { l: 0, r: 0, u: 0, d: 0 };

  // Tile scheduling
  private lastLevelSwitch = 0;
  private lastZChange = 0;
  private lastZ = NaN;
  private tileTimer = 0;

  // Gestures
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { lx: number; ly: number; sx: number; sy: number; t0: number; moved: boolean; samples: Array<[number, number, number]> } | null = null;
  private pinch: { d0: number; z0: number; wx: number; wy: number } | null = null;
  private lastClick = { t: 0, x: 0, y: 0 };

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'map';
    this.el.tabIndex = -1;
    this.pane = document.createElement('div');
    this.pane.className = 'map-pane';
    this.imagery = new TileLayer(IMAGERY, () => this.perf);
    this.labelLayers = [new TileLayer(ROADS, () => this.perf), new TileLayer(PLACES, () => this.perf)];
    this.layers = [this.imagery];
    this.pane.append(this.backdrop.el, this.imagery.el);

    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'map-svg');
    this.markerHost = document.createElement('div');
    this.markerHost.className = 'map-markers';
    const attr = document.createElement('div');
    attr.className = 'map-attr';
    attr.textContent = ATTRIBUTION;
    this.el.append(this.pane, this.svg, this.markerHost, attr);
    host.append(this.el);

    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.resize();
  }

  // ---------------------------------------------------------------- public API

  setPerf(p: PerfProfile) {
    this.perf = p;
    for (const l of this.layers) l.clear();
    this.dirty = true;
    this.requestRender();
  }

  setLabels(on: boolean) {
    if (on === this.labelsOn) return;
    this.labelsOn = on;
    for (const l of this.labelLayers) {
      if (on) this.pane.append(l.el);
      else {
        l.clear();
        l.el.remove();
      }
    }
    this.layers = on ? [this.imagery, ...this.labelLayers] : [this.imagery];
    this.dirty = true;
    this.requestRender();
  }

  setView(x: number, y: number, z: number) {
    this.stopMotion();
    this.cam.x = x;
    this.cam.y = y;
    this.cam.z = z;
    this.dirty = true;
    this.requestRender();
  }

  /** Render synchronously (used by replays that drive the camera from their own loop). */
  renderNow() {
    this.dirty = true;
    this.frame(performance.now(), true);
  }

  stopMotion() {
    this.zoomAnim = null;
    this.inertia = null;
    if (this.fly) {
      const r = this.fly.resolve;
      this.fly = null;
      r();
    }
  }

  zoomBy(dz: number, sx = this.w / 2, sy = this.h / 2) {
    this.inertia = null;
    const base = this.zoomAnim ? this.zoomAnim.target : this.cam.z;
    const target = Math.max(this.minZoom, Math.min(this.maxZoom, base + dz));
    if (!this.perf.animate) {
      this.zoomAround(target, sx, sy);
      this.dirty = true;
    } else this.zoomAnim = { target, ax: sx, ay: sy };
    this.requestRender();
  }

  panBy(dx: number, dy: number) {
    const S = TILE * 2 ** this.cam.z;
    this.cam.x -= dx / S;
    this.cam.y -= dy / S;
    this.dirty = true;
    this.requestRender();
  }

  /** van Wijk & Nuij "smooth and efficient zooming and panning", like Mapbox's flyTo. */
  flyTo(x: number, y: number, z: number, maxMs = 1600): Promise<void> {
    this.stopMotion();
    z = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    x = this.nearestWrap(x);
    if (!this.perf.animate) {
      this.setView(x, y, z);
      return Promise.resolve();
    }
    const from = { ...this.cam };
    const rho = 1.42;
    const rho2 = rho * rho;
    const w0 = Math.max(this.w, this.h);
    const w1 = w0 / 2 ** (z - from.z);
    const S0 = TILE * 2 ** from.z;
    const u1 = Math.hypot((x - from.x) * S0, (y - from.y) * S0);
    const r = (i: number) => {
      const b = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (i ? w1 : w0) * rho2 * u1);
      return Math.log(Math.sqrt(b * b + 1) - b);
    };
    const r0 = r(0);
    let wf = (s: number) => Math.cosh(r0) / Math.cosh(r0 + rho * s);
    let uf = (s: number) => (w0 * ((Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0)) / rho2)) / u1;
    let S = (r(1) - r0) / rho;
    if (Math.abs(u1) < 1e-6 || !Number.isFinite(S)) {
      if (Math.abs(w0 - w1) < 1e-6) {
        this.setView(x, y, z);
        return Promise.resolve();
      }
      const k = w1 < w0 ? -1 : 1;
      S = Math.abs(Math.log(w1 / w0)) / rho;
      uf = () => 0;
      wf = (s) => Math.exp(k * rho * s);
    }
    const dur = Math.max(350, Math.min(maxMs, (S / 1.6) * 1000));
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    return new Promise((resolve) => {
      this.fly = {
        t0: performance.now(),
        dur,
        resolve,
        step: (k) => {
          const s = ease(k) * S;
          const u = k >= 1 ? 1 : uf(s);
          const zz = k >= 1 ? z : from.z + Math.log2(1 / wf(s));
          return { x: from.x + (x - from.x) * u, y: from.y + (y - from.y) * u, z: zz };
        },
      };
      this.requestRender();
    });
  }

  /** Camera that frames all points inside the viewport minus padding (px). */
  fitCamera(points: Pt[], pad: number | { top: number; right: number; bottom: number; left: number } = 80, maxZ = 19): Camera {
    const pd = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
    const xs = points.map((p) => this.nearestWrap(p.x, points[0].x));
    const ys = points.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const aw = Math.max(40, this.w - pd.left - pd.right);
    const ah = Math.max(40, this.h - pd.top - pd.bottom);
    const zx = x1 > x0 ? Math.log2(aw / ((x1 - x0) * TILE)) : maxZ;
    const zy = y1 > y0 ? Math.log2(ah / ((y1 - y0) * TILE)) : maxZ;
    const z = Math.max(this.minZoom, Math.min(maxZ, zx, zy));
    // Shift the centre so the box sits in the middle of the padded area, not the screen.
    const S = TILE * 2 ** z;
    return { x: (x0 + x1) / 2 - (pd.left - pd.right) / 2 / S, y: (y0 + y1) / 2 - (pd.top - pd.bottom) / 2 / S, z };
  }

  screenToWorld(sx: number, sy: number): Pt {
    const S = TILE * 2 ** this.cam.z;
    return { x: this.cam.x + (sx - this.w / 2) / S, y: this.cam.y + (sy - this.h / 2) / S };
  }

  worldToScreen(x: number, y: number): Pt {
    const S = TILE * 2 ** this.cam.z;
    return { x: (this.nearestWrap(x) - this.cam.x) * S + this.w / 2, y: (y - this.cam.y) * S + this.h / 2 };
  }

  /** The copy of world-x closest to the reference (the map wraps horizontally). */
  nearestWrap(x: number, ref = this.cam.x): number {
    return x + Math.round(ref - x);
  }

  setKey(dir: 'l' | 'r' | 'u' | 'd', down: boolean) {
    this.keys[dir] = down ? 1 : 0;
    if (down) {
      this.inertia = null;
      this.requestRender();
    }
  }

  clearKeys() {
    this.keys = { l: 0, r: 0, u: 0, d: 0 };
  }

  addMarker(el: HTMLElement): Marker {
    const m: Marker = {
      el,
      x: 0,
      y: 0,
      visible: true,
      set: (x, y) => {
        m.x = x;
        m.y = y;
        this.placeMarker(m);
      },
      show: (v) => {
        m.visible = v;
        el.style.display = v ? '' : 'none';
        if (v) this.placeMarker(m);
      },
      remove: () => {
        el.remove();
        this.markers.delete(m);
      },
    };
    el.classList.add('mk');
    this.markerHost.append(el);
    this.markers.add(m);
    return m;
  }

  /** Polyline / polygon in world coordinates. */
  addPath(points: () => Pt[], cls: string, closed = false): Shape {
    const el = document.createElementNS(SVGNS, closed ? 'polygon' : 'polyline');
    el.setAttribute('class', cls);
    const update = () => {
      const pts = points();
      let s = '';
      for (const p of pts) {
        const q = this.worldToScreen(p.x, p.y);
        s += `${q.x.toFixed(1)},${q.y.toFixed(1)} `;
      }
      el.setAttribute('points', s);
    };
    return this.addShape(el, update);
  }

  /** Rectangle showing another player's viewport. */
  addViewRect(get: () => { cam: Camera; w: number; h: number } | null, cls: string): Shape {
    const el = document.createElementNS(SVGNS, 'rect');
    el.setAttribute('class', cls);
    el.setAttribute('rx', '6');
    const update = () => {
      const v = get();
      if (!v) {
        el.setAttribute('width', '0');
        return;
      }
      const c = this.worldToScreen(v.cam.x, v.cam.y);
      const k = 2 ** (this.cam.z - v.cam.z);
      const rw = Math.max(6, v.w * k);
      const rh = Math.max(6, v.h * k);
      el.setAttribute('x', (c.x - rw / 2).toFixed(1));
      el.setAttribute('y', (c.y - rh / 2).toFixed(1));
      el.setAttribute('width', rw.toFixed(1));
      el.setAttribute('height', rh.toFixed(1));
    };
    return this.addShape(el, update);
  }

  refreshOverlays() {
    for (const m of this.markers) this.placeMarker(m);
    for (const f of this.shapes.values()) f();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.tileTimer);
    this.ro.disconnect();
    for (const l of [this.imagery, ...this.labelLayers]) l.clear();
    window.removeEventListener('blur', this.onBlur);
    this.el.remove();
  }

  // ---------------------------------------------------------------- rendering

  requestRender() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number, sync = false) {
    if (!sync) this.raf = 0;
    const dt = Math.min(64, this.last ? now - this.last : 16);
    this.last = now;
    let moving = false;
    const cam = this.cam;

    if (this.fly) {
      const k = Math.min(1, (now - this.fly.t0) / this.fly.dur);
      Object.assign(cam, this.fly.step(k));
      this.dirty = true;
      if (k >= 1) {
        const r = this.fly.resolve;
        this.fly = null;
        r();
      } else moving = true;
    } else {
      if (this.zoomAnim) {
        const za = this.zoomAnim;
        const diff = za.target - cam.z;
        const nz = Math.abs(diff) < 0.002 ? za.target : cam.z + diff * (1 - Math.exp(-dt / 65));
        this.zoomAround(nz, za.ax, za.ay);
        if (nz === za.target) this.zoomAnim = null;
        else moving = true;
        this.dirty = true;
      }
      if (this.inertia) {
        const it = this.inertia;
        this.panBy(it.vx * dt, it.vy * dt);
        const decay = Math.exp(-dt / 280);
        it.vx *= decay;
        it.vy *= decay;
        if (Math.hypot(it.vx, it.vy) < 0.02) this.inertia = null;
        else moving = true;
      }
      const kx = this.keys.r - this.keys.l;
      const ky = this.keys.d - this.keys.u;
      if (kx || ky) {
        const speed = Math.min(this.w, this.h) * 1.1 * (dt / 1000);
        const norm = kx && ky ? Math.SQRT1_2 : 1;
        this.panBy(-kx * speed * norm, -ky * speed * norm);
        moving = true;
      }
    }

    if (this.dirty) {
      this.dirty = false;
      this.clamp();
      // Tiles first: a level created this frame must get its transform this frame too.
      this.scheduleTiles(now);
      this.backdrop.position(cam, this.w, this.h);
      for (const l of this.layers) l.position(cam, this.w, this.h, this.dpr);
      this.refreshOverlays();
      this.onMove?.(cam);
    }
    if (moving && !this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
    if (!moving) this.last = 0;
  }

  private scheduleTiles(now: number) {
    const cam = this.cam;
    if (cam.z !== this.lastZ) {
      this.lastZ = cam.z;
      this.lastZChange = now;
    }
    const switching = this.layers.some((l) => l.levelFor(cam) !== l.activeZ);
    const empty = this.imagery.activeZ < 0;
    let wait = 0;
    if (switching && !empty) {
      if (!this.perf.loadWhileZooming) wait = Math.max(0, 120 - (now - this.lastZChange));
      wait = Math.max(wait, this.perf.levelThrottleMs - (now - this.lastLevelSwitch));
    }
    if (wait > 0) {
      clearTimeout(this.tileTimer);
      this.tileTimer = window.setTimeout(() => {
        this.dirty = true;
        this.requestRender();
      }, wait + 1);
      // Keep the current level filled while we wait (panning at an unchanged level).
      for (const l of this.layers) if (l.activeZ >= 0 && l.levelFor(cam) === l.activeZ) l.update(cam, this.w, this.h);
      return;
    }
    if (switching) this.lastLevelSwitch = now;
    for (const l of this.layers) l.update(cam, this.w, this.h);
  }

  private clamp() {
    const c = this.cam;
    c.z = Math.max(this.minZoom, Math.min(this.maxZoom, c.z));
    const S = TILE * 2 ** c.z;
    const halfH = this.h / 2 / S;
    c.y = halfH * 2 >= 1 ? 0.5 : Math.max(halfH, Math.min(1 - halfH, c.y));
    if (c.x > 3 || c.x < -2) c.x -= Math.floor(c.x); // keep floats sane after many laps
  }

  private zoomAround(z: number, sx: number, sy: number) {
    z = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    const p = this.screenToWorld(sx, sy);
    this.cam.z = z;
    const S = TILE * 2 ** z;
    this.cam.x = p.x - (sx - this.w / 2) / S;
    this.cam.y = p.y - (sy - this.h / 2) / S;
  }

  private placeMarker(m: Marker) {
    if (!m.visible) return;
    const p = this.worldToScreen(m.x, m.y);
    const off = p.x < -200 || p.y < -200 || p.x > this.w + 200 || p.y > this.h + 200;
    m.el.style.transform = off ? 'translate(-9999px,0)' : `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
  }

  private addShape(el: SVGElement, update: ShapeUpdate): Shape {
    this.svg.append(el);
    this.shapes.set(el, update);
    update();
    return {
      el,
      remove: () => {
        el.remove();
        this.shapes.delete(el);
      },
    };
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.minZoom = Math.max(0.5, Math.min(4, Math.log2(this.h / TILE)));
    this.svg.setAttribute('viewBox', `0 0 ${this.w} ${this.h}`);
    this.dirty = true;
    this.requestRender();
  }

  // ---------------------------------------------------------------- input

  private onBlur = () => this.clearKeys();

  private bindInput() {
    const el = this.el;
    const rel = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    el.addEventListener('pointerdown', (e) => {
      if (!this.interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
      el.setPointerCapture(e.pointerId);
      const p = rel(e);
      this.pointers.set(e.pointerId, p);
      this.inertia = null;
      this.zoomAnim = null;
      if (this.fly) this.stopMotion();
      this.onUserInput?.();
      if (this.pointers.size === 1) {
        this.drag = { lx: p.x, ly: p.y, sx: p.x, sy: p.y, t0: performance.now(), moved: false, samples: [[p.x, p.y, performance.now()]] };
      } else if (this.pointers.size === 2) this.startPinch();
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = rel(e);
      this.pointers.set(e.pointerId, p);
      if (this.pinch) {
        this.updatePinch();
        return;
      }
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > (e.pointerType === 'mouse' ? 4 : 9)) d.moved = true;
      if (d.moved) {
        this.panBy(p.x - d.lx, p.y - d.ly);
        const now = performance.now();
        d.samples.push([p.x, p.y, now]);
        while (d.samples.length > 2 && now - d.samples[0][2] > 90) d.samples.shift();
      }
      d.lx = p.x;
      d.ly = p.y;
    });

    const end = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        this.pinch = null;
        if (this.pointers.size === 1) {
          const [q] = this.pointers.values();
          this.drag = { lx: q.x, ly: q.y, sx: q.x, sy: q.y, t0: 0, moved: true, samples: [[q.x, q.y, performance.now()]] };
        }
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (!d || e.type === 'pointercancel') return;
      const now = performance.now();
      if (!d.moved && now - d.t0 < 600) {
        const p = rel(e);
        this.handleClick(p.x, p.y, now);
      } else if (d.moved && d.samples.length >= 2 && this.perf.animate) {
        const a = d.samples[0];
        const b = d.samples[d.samples.length - 1];
        const dt = b[2] - a[2];
        if (dt > 8 && now - b[2] < 60) {
          const vx = (b[0] - a[0]) / dt;
          const vy = (b[1] - a[1]) / dt;
          const sp = Math.hypot(vx, vy);
          const cap = 4;
          if (sp > 0.15) this.inertia = sp > cap ? { vx: (vx / sp) * cap, vy: (vy / sp) * cap } : { vx, vy };
          this.requestRender();
        }
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.interactive) return;
        this.onUserInput?.();
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 33;
        else if (e.deltaMode === 2) dy *= this.h;
        let dz = (-dy / 100) * settings.zoomSpeed * (e.ctrlKey ? 1.6 : 1);
        dz = Math.max(-1.5, Math.min(1.5, dz));
        const p = rel(e);
        this.zoomBy(dz, p.x, p.y);
      },
      { passive: false },
    );

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', this.onBlur);
  }

  private handleClick(x: number, y: number, now: number) {
    const lc = this.lastClick;
    const dbl = now - lc.t < 300 && Math.hypot(x - lc.x, y - lc.y) < 24;
    this.lastClick = dbl ? { t: 0, x: 0, y: 0 } : { t: now, x, y };
    const p = this.screenToWorld(x, y);
    if (dbl && this.onDoubleClick) {
      this.onDoubleClick(p);
      return;
    }
    this.onClick?.(p);
    if (dbl) this.zoomBy(1, x, y);
  }

  private startPinch() {
    const [a, b] = [...this.pointers.values()];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const w = this.screenToWorld(mx, my);
    this.pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: this.cam.z, wx: w.x, wy: w.y };
    if (this.drag) this.drag.moved = true;
  }

  private updatePinch() {
    const pi = this.pinch!;
    const [a, b] = [...this.pointers.values()];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
    const z = Math.max(this.minZoom, Math.min(this.maxZoom, pi.z0 + Math.log(d / pi.d0) / LN2));
    const S = TILE * 2 ** z;
    this.cam.z = z;
    this.cam.x = pi.wx - (mx - this.w / 2) / S;
    this.cam.y = pi.wy - (my - this.h / 2) / S;
    this.dirty = true;
    this.requestRender();
  }
}
