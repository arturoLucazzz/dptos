/**
 * Plain geometry for the location score. No PostGIS: distances use haversine and
 * polygon math uses a local flat projection, which is accurate to meters at city scale.
 */

export type LatLon = { lat: number; lon: number };
/** A polygon ring as GeoJSON orders it: [lon, lat] pairs. */
export type Ring = [lon: number, lat: number][];

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Even-odd rule over all rings, so holes and multipolygons both work. */
export function pointInPolygon(p: LatLon, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Meters east and north of an origin, on a plane tangent at the origin. */
function project(origin: LatLon, lon: number, lat: number): [number, number] {
  return [(lon - origin.lon) * RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD), (lat - origin.lat) * RAD * EARTH_RADIUS_M];
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 0 inside the polygon; otherwise meters to the nearest edge. Infinity with no edges. */
export function distanceToPolygonEdgeM(p: LatLon, rings: Ring[]): number {
  if (pointInPolygon(p, rings)) return 0;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = project(p, ring[i - 1][0], ring[i - 1][1]);
      const [bx, by] = project(p, ring[i][0], ring[i][1]);
      best = Math.min(best, segmentDistance(0, 0, ax, ay, bx, by));
    }
  }
  return best;
}

/** Shoelace area in m². Outer rings and holes both count as positive; fine for ranking zone size. */
export function polygonAreaM2(rings: Ring[]): number {
  let total = 0;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const origin = { lon: ring[0][0], lat: ring[0][1] };
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = project(origin, ring[i][0], ring[i][1]);
      const next = ring[(i + 1) % ring.length];
      const [x2, y2] = project(origin, next[0], next[1]);
      sum += x1 * y2 - x2 * y1;
    }
    total += Math.abs(sum) / 2;
  }
  return total;
}

/** A fixed grid of cells for fast "what is near this point" lookups. */
export class GridIndex<T extends LatLon> {
  private readonly cells = new Map<string, T[]>();

  constructor(
    items: readonly T[],
    private readonly cellDeg = 0.01,
  ) {
    for (const item of items) {
      const key = this.key(Math.floor(item.lat / cellDeg), Math.floor(item.lon / cellDeg));
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    }
  }

  private key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  near(p: LatLon, radiusM: number): { item: T; distanceM: number }[] {
    const latSpan = radiusM / (RAD * EARTH_RADIUS_M);
    const lonSpan = latSpan / Math.max(Math.cos(p.lat * RAD), 0.01);
    const rowMin = Math.floor((p.lat - latSpan) / this.cellDeg);
    const rowMax = Math.floor((p.lat + latSpan) / this.cellDeg);
    const colMin = Math.floor((p.lon - lonSpan) / this.cellDeg);
    const colMax = Math.floor((p.lon + lonSpan) / this.cellDeg);
    const found: { item: T; distanceM: number }[] = [];
    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        for (const item of this.cells.get(this.key(row, col)) ?? []) {
          const distanceM = haversineM(p, item);
          if (distanceM <= radiusM) found.push({ item, distanceM });
        }
      }
    }
    return found.sort((a, b) => a.distanceM - b.distanceM);
  }
}
