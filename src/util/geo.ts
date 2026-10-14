// Web Mercator helpers. World coordinates are normalised to [0, 1) on both axes.

const R = 6378137;
const MAX_LAT = 85.05112878;

export interface LatLng { lat: number; lng: number }
export interface Pt { x: number; y: number }

export function project(lat: number, lng: number): Pt {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((la * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}

export function unproject(x: number, y: number): LatLng {
  const wx = x - Math.floor(x);
  const n = Math.PI - 2 * Math.PI * y;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: wx * 360 - 180 };
}

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Offset a point by metres east/north (small-distance approximation, fine below ~200 km). */
export function offsetMeters(p: LatLng, east: number, north: number): LatLng {
  const dLat = (north / R) * (180 / Math.PI);
  const dLng = (east / (R * Math.cos((p.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: p.lat + dLat, lng: ((p.lng + dLng + 540) % 360) - 180 };
}

/** Distance in metres from a point to a polygon (0 when inside). Local planar approximation. */
export function distanceToPolygon(p: LatLng, poly: ReadonlyArray<readonly [number, number]>): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * (Math.PI / 180) * R;
  const m = (Math.PI / 180) * R;
  const pts = poly.map(([la, ln]) => [(ln - p.lng) * k, (la - p.lat) * m] as const);
  // Far away: polygon size is negligible, skip the planar maths (which breaks across the antimeridian).
  const c = centroid(poly);
  const far = haversine(p, c);
  if (far > 2000) return far;
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi;
    const dy = yj - yi;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(xi * dx + yi * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(xi + t * dx, yi + t * dy));
  }
  return inside ? 0 : best;
}

export function centroid(poly: ReadonlyArray<readonly [number, number]>): LatLng {
  let lat = 0;
  let lng = 0;
  for (const [a, b] of poly) {
    lat += a;
    lng += b;
  }
  return { lat: lat / poly.length, lng: lng / poly.length };
}

/** Metres per screen pixel at a given latitude and zoom (256px tiles). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * R) / (256 * 2 ** zoom);
}
