/**
 * Checks a zone drawn on the workspace map: 3 to 50 distinct points inside Lima, no crossing
 * edges, some area. Returns the ring closed, as GeoJSON stores it. Pure, so it is tested alone.
 */

import { polygonAreaM2, type Ring } from './geo';
import { LIMA_BOX } from './zone-input';

export const POLYGON_MAX_POINTS = 50;

const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

/** Twice the signed area of a, b, c: its sign says which side of ab the point c is on. */
function cross(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: [number, number], b: [number, number], p: [number, number]): boolean {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

/** True when the segments ab and cd touch or cross, endpoints included. */
function segmentsMeet(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d));
}

/** Points are [lon, lat] pairs; a closing point equal to the first is allowed and dropped. */
export function validatePolygon(points: [number, number][]): { ok: true; ring: Ring } | { ok: false; error: string } {
  if (points.some((p) => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    return { ok: false, error: 'La zona tiene puntos inválidos.' };
  }
  // Drop repeats in a row (a double click) and the closing point.
  const open: [number, number][] = [];
  for (const p of points) if (open.length === 0 || !same(open[open.length - 1], p)) open.push([p[0], p[1]]);
  while (open.length > 1 && same(open[0], open[open.length - 1])) open.pop();

  const distinct = new Set(open.map((p) => `${p[0]},${p[1]}`)).size;
  if (distinct < 3) return { ok: false, error: 'Dibuja al menos 3 puntos.' };
  if (distinct > POLYGON_MAX_POINTS) return { ok: false, error: `Usa como máximo ${POLYGON_MAX_POINTS} puntos.` };
  // A point visited twice makes the outline touch itself.
  if (distinct !== open.length) return { ok: false, error: 'Los bordes no pueden cruzarse.' };

  const outside = open.some(([lon, lat]) => lat < LIMA_BOX.latMin || lat > LIMA_BOX.latMax || lon < LIMA_BOX.lonMin || lon > LIMA_BOX.lonMax);
  if (outside) return { ok: false, error: 'La zona debe estar dentro de Lima.' };

  const n = open.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Edges next to each other share a point; that is not a crossing.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsMeet(open[i], open[(i + 1) % n], open[j], open[(j + 1) % n])) return { ok: false, error: 'Los bordes no pueden cruzarse.' };
    }
  }

  const ring: Ring = [...open, open[0]];
  // Under 1 m²: the points sit on one line.
  if (polygonAreaM2([ring]) < 1) return { ok: false, error: 'La zona no tiene área.' };
  return { ok: true, ring };
}
