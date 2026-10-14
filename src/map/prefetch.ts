// Background tile prefetcher. Quietly downloads the tiles a run is going to need (the
// whole planet at low zoom and every level down to 26 Murasaki St) while the player is in
// menus, so a slow connection does not eat into anyone's time. The service worker keeps
// them on disk between visits. Paused while a round is being played so it never competes
// with tiles that are actually on screen.

import { imageryUrl, placesUrl, roadsUrl, TARGET } from '../config';
import { effectiveQuality } from '../settings';

const queue: string[] = [];
const seen = new Set<string>();
let active = 0;
let paused = false;
let done = 0;
const listeners = new Set<(done: number, total: number) => void>();

function concurrency() {
  return effectiveQuality() === 'low' ? 2 : 4;
}

function pump() {
  while (!paused && active < concurrency() && queue.length) {
    const url = queue.shift()!;
    active++;
    fetch(url, { mode: 'cors', credentials: 'omit', priority: 'low' } as RequestInit)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
      .finally(() => {
        active--;
        done++;
        listeners.forEach((f) => f(done, seen.size));
        pump();
      });
  }
}

export function prefetch(urls: string[], urgent = false) {
  const fresh = urls.filter((u) => !seen.has(u));
  fresh.forEach((u) => seen.add(u));
  if (urgent) queue.unshift(...fresh);
  else queue.push(...fresh);
  pump();
}

export function setPrefetchPaused(p: boolean) {
  paused = p;
  if (!p) pump();
}

export function onPrefetchProgress(f: (done: number, total: number) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

function tileXY(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n),
    n,
  };
}

/** Imagery plus both label layers for a (2r+1)² block of tiles around a point. */
export function blockUrls(lat: number, lng: number, z: number, r: number, labels = true): string[] {
  const { x, y, n } = tileXY(lat, lng, z);
  const out: string[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const ty = y + dy;
      if (ty < 0 || ty >= n) continue;
      const tx = (((x + dx) % n) + n) % n;
      out.push(imageryUrl(z, tx, ty));
      if (labels && z <= 19) {
        out.push(placesUrl(z, tx, ty));
        if (z >= 5) out.push(roadsUrl(z, tx, ty));
      }
    }
  }
  return out;
}

/** Every route ends at the same house: preload the whole world view and the dive to it. */
export function prefetchGoldenPath() {
  const urls: string[] = [];
  for (let z = 0; z <= 3; z++) {
    const n = 2 ** z;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) urls.push(imageryUrl(z, x, y), placesUrl(z, x, y));
  }
  for (let z = 4; z <= 20; z++) urls.push(...blockUrls(TARGET.lat, TARGET.lng, z, z >= 15 && z <= 18 ? 2 : 1));
  prefetch(urls);
}

/** The first thing players do after a drop is zoom out: preload that path from the start. */
export function prefetchZoomOut(lat: number, lng: number, fromZ: number) {
  const urls: string[] = [];
  for (let z = Math.floor(fromZ) - 1; z >= 2; z--) urls.push(...blockUrls(lat, lng, z, 1));
  prefetch(urls, true);
}
