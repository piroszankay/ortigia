import { MAP_BUILD, type LatLon } from './config';

/** Local equirectangular projection: metres east (x) / north (y) of MAP_BUILD.origin. */
const [LAT0, LON0] = MAP_BUILD.origin;
export const M_PER_DEG_LAT = 111132;
export const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

export type Vec = { x: number; y: number };

export function project([lat, lon]: LatLon): Vec {
  return { x: (lon - LON0) * M_PER_DEG_LON, y: (lat - LAT0) * M_PER_DEG_LAT };
}

export function unproject({ x, y }: Vec): LatLon {
  return [LAT0 + y / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON];
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylineLength(pts: Vec[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPolygonEdge(p: Vec, poly: Vec[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j], poly[i]));
  return d;
}
