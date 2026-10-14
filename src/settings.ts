import { load, save } from './util/storage';

export type QualitySetting = 'auto' | 'low' | 'balanced' | 'high';
export type Quality = Exclude<QualitySetting, 'auto'>;

export interface Settings {
  quality: QualitySetting;
  reduceMotion: boolean;
  /** Placing the pin immediately locks it in. Fastest, but no take-backs. */
  oneClick: boolean;
  zoomSpeed: number;
  sound: boolean;
  showGhost: boolean;
}

const DEFAULTS: Settings = {
  quality: 'auto',
  reduceMotion: false,
  oneClick: false,
  zoomSpeed: 1,
  sound: true,
  showGhost: true,
};

export const settings: Settings = { ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) };

const listeners = new Set<() => void>();
export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  save('settings', settings);
  applyRootClasses();
  listeners.forEach((f) => f());
}
export function onSettingsChange(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Rough device-class guess. Errs towards "low" so weak machines never stutter on first load. */
export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const cores = nav.hardwareConcurrency || 2;
  const mem = nav.deviceMemory ?? 4;
  const conn = nav.connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return 'low';
  if (cores <= 2 || mem <= 2) return 'low';
  if (cores >= 8 && mem >= 8 && devicePixelRatio >= 1.5) return 'high';
  return 'balanced';
}

export function effectiveQuality(): Quality {
  return settings.quality === 'auto' ? detectQuality() : settings.quality;
}

export function motionReduced(): boolean {
  return settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches || effectiveQuality() === 'low';
}

export interface PerfProfile {
  quality: Quality;
  /** Added to the camera zoom before rounding to a tile level. Negative = fewer, blurrier tiles. */
  tileBias: number;
  /** Extra pixels of tiles preloaded around the viewport. */
  marginPx: number;
  fade: boolean;
  animate: boolean;
  /** While zooming, how often a new tile level may start loading. */
  levelThrottleMs: number;
  /** Low mode waits until zooming stops before fetching a new level at all. */
  loadWhileZooming: boolean;
  maxLevels: number;
  /** Concurrent tile downloads per layer. */
  maxRequests: number;
}

export function perfProfile(): PerfProfile {
  const q = effectiveQuality();
  const anim = !motionReduced();
  if (q === 'low') return { quality: q, tileBias: -0.35, marginPx: 0, fade: false, animate: anim, levelThrottleMs: 250, loadWhileZooming: false, maxLevels: 2, maxRequests: 6 };
  if (q === 'high') return { quality: q, tileBias: 0.35, marginPx: 256, fade: anim, animate: anim, levelThrottleMs: 90, loadWhileZooming: true, maxLevels: 3, maxRequests: 16 };
  return { quality: q, tileBias: 0, marginPx: 96, fade: anim, animate: anim, levelThrottleMs: 140, loadWhileZooming: true, maxLevels: 3, maxRequests: 12 };
}

export function applyRootClasses() {
  const root = document.documentElement;
  const q = effectiveQuality();
  root.classList.toggle('q-low', q === 'low');
  root.classList.toggle('q-high', q === 'high');
  root.classList.toggle('calm', motionReduced());
}
