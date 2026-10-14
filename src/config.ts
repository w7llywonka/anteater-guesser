// Static game configuration: the target, the imagery sources and the mode catalog.

export const TARGET = {
  lat: 33.6401366,
  lng: -117.8336553,
  street: '26 Murasaki St',
  city: 'Irvine, CA 92617',
};

/** Building footprint of 26 Murasaki St (OSM way 1035167841, traced from OC county data). */
export const TARGET_FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [33.6401595, -117.8335653],
  [33.6400592, -117.8336433],
  [33.6400969, -117.8337133],
  [33.6401112, -117.8337022],
  [33.6401164, -117.8337118],
  [33.6401247, -117.8337054],
  [33.6401485, -117.8337496],
  [33.6402262, -117.8336892],
];

/** Pins within this many metres of the house count as "on target" (valid for time PBs). */
export const ON_TARGET_M = 15;

const ESRI = 'arcgisonline.com/ArcGIS/rest/services';
// Two hostnames serve the same tiles; spreading requests across both doubles the
// connection pool on HTTP/1.1 networks. The choice is stable per tile so caching still works.
const host = (x: number, y: number) => ((x + y) & 1 ? 'services' : 'server');

export const imageryUrl = (z: number, x: number, y: number) =>
  `https://${host(x, y)}.${ESRI}/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
export const placesUrl = (z: number, x: number, y: number) =>
  `https://${host(x, y)}.${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`;
export const roadsUrl = (z: number, x: number, y: number) =>
  `https://${host(x, y)}.${ESRI}/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`;

export const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN & the GIS User Community';

/** Esri has 0.15 m imagery (z20) over Southern California; elsewhere z19 is the safe ceiling. */
export const HIRES_BOX = { minLat: 32.4, maxLat: 35.0, minLng: -119.6, maxLng: -116.0 };

export const MAX_ZOOM = 21;
export const ROUND_TIME_LIMIT_MS = 120_000;
export const DUEL_HURRY_MS = 15_000;

export type ModeId = 'drop' | 'daily';
export type ZoneId = 'campus' | 'city' | 'socal' | 'world';

export interface Zone {
  id: ZoneId;
  name: string;
  blurb: string;
  /** Max start distance from the target in km (0 = anywhere on Earth). */
  radiusKm: number;
  startZoom: number;
}

export const ZONES: Record<ZoneId, Zone> = {
  world: { id: 'world', name: 'World', blurb: 'A random spot on land anywhere on Earth', radiusKm: 0, startZoom: 5 },
  socal: { id: 'socal', name: 'SoCal', blurb: 'Somewhere within 100 km', radiusKm: 100, startZoom: 9.5 },
  city: { id: 'city', name: 'Irvine', blurb: 'Somewhere within 15 km', radiusKm: 15, startZoom: 12 },
  campus: { id: 'campus', name: 'Campus', blurb: 'Within 4 km', radiusKm: 4, startZoom: 14 },
};

export const MODES: Record<ModeId, { name: string; blurb: string }> = {
  drop: { name: 'World Drop', blurb: 'Dropped at a random point anywhere on Earth. A new spot every run, so there is no route to memorise.' },
  daily: { name: 'Daily Drop', blurb: 'Three random drops, the same for everyone today.' },
};
