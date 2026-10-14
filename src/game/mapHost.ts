// One MapView for the whole session, moved between screens so tile state and the
// browser's image cache stay warm.

import { MapView } from '../map/MapView';
import { perfProfile, onSettingsChange } from '../settings';
import { TARGET, TARGET_FOOTPRINT, imageryUrl } from '../config';
import { project, type Pt } from '../util/geo';
import { pinSVG } from '../profile/avatar';

let map: MapView | null = null;

export function getMap(host: HTMLElement): MapView {
  if (!map) {
    map = new MapView(host);
    // Hybrid view: roads, highway shields, city and street names over the imagery.
    map.setLabels(true);
    onSettingsChange(() => map?.setPerf(perfProfile()));
    // ?debug in the page URL exposes the map for automated tests.
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __map: MapView }).__map = map;
  } else host.append(map.el);
  map.onClick = null;
  map.onDoubleClick = null;
  map.onMove = null;
  map.onUserInput = null;
  map.interactive = true;
  map.clearKeys();
  return map;
}

export const TARGET_PT: Pt = project(TARGET.lat, TARGET.lng);
export const FOOTPRINT_PTS: Pt[] = TARGET_FOOTPRINT.map(([la, ln]) => project(la, ln));

export function pinEl(skin: string, cls = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = `pin ${cls}`;
  el.innerHTML = pinSVG(skin);
  return el;
}

export function targetEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'target-mk';
  el.innerHTML =
    '<span class="ring"></span><svg width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#ffd200" stroke="#0b2e57" stroke-width="2"/><path d="M6.5 12.5 L12 7.5 L17.5 12.5 V17.5 H6.5 Z" fill="#0b2e57"/><rect x="10.5" y="13.5" width="3" height="4" fill="#ffd200"/></svg>';
  return el;
}

/** Small satellite crop centred on the house: "this is what you are looking for". */
export function targetThumb(size = 112, z = 19): HTMLElement {
  const box = document.createElement('div');
  box.className = 'thumb';
  box.style.width = box.style.height = `${size}px`;
  const n = 2 ** z;
  const px = TARGET_PT.x * n * 256;
  const py = TARGET_PT.y * n * 256;
  const left = px - size / 2;
  const top = py - size / 2;
  for (let ty = Math.floor(top / 256); ty <= Math.floor((top + size) / 256); ty++) {
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + size) / 256); tx++) {
      const img = document.createElement('img');
      img.alt = '';
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.src = imageryUrl(z, tx, ty);
      img.style.left = `${tx * 256 - left}px`;
      img.style.top = `${ty * 256 - top}px`;
      box.append(img);
    }
  }
  return box;
}
