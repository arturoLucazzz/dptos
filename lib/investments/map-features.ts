/**
 * Pure GeoJSON for the workspace map: the pins as one point collection, and the saved zones
 * as outlines colored by rating. No map library here, so the server and the tests can use it.
 */

import type { Ring } from '../location/geo';

/** One pin as the points route sends it: id, lon, lat, monthly gain in soles (null when unknown). */
export type MapPoint = [id: string, lon: number, lat: number, gainPen: number | null];

export type PointFeatures = {
  type: 'FeatureCollection';
  features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { id: string; gain: number | null } }[];
};

export type ZoneOutlineInput = { id: string; name: string; rating: number; rings: Ring[] };

export type ZoneFeatures = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Polygon'; coordinates: Ring[] };
    properties: { id: string; name: string; rating: number; color: string };
  }[];
};

/** Five decimals is about a meter: plenty for a pin, and a smaller response. */
const coord = (x: number) => Math.round(x * 1e5) / 1e5;

export function unitPoints(rows: readonly { postingId: string; lat: number | null; lon: number | null; monthlyGainPen: number | null }[]): MapPoint[] {
  const out: MapPoint[] = [];
  for (const r of rows) {
    if (r.lat == null || r.lon == null) continue;
    out.push([r.postingId, coord(r.lon), coord(r.lat), r.monthlyGainPen == null ? null : Math.round(r.monthlyGainPen)]);
  }
  return out;
}

/** A project has no single unit, so no gain: its pin is neutral. */
export function projectPoints(rows: readonly { projectId: string; lat: number | null; lon: number | null }[]): MapPoint[] {
  const out: MapPoint[] = [];
  for (const r of rows) if (r.lat != null && r.lon != null) out.push([r.projectId, coord(r.lon), coord(r.lat), null]);
  return out;
}

export function pointsToFeatures(points: readonly MapPoint[]): PointFeatures {
  return {
    type: 'FeatureCollection',
    features: points.map(([id, lon, lat, gain]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { id, gain },
    })),
  };
}

// The theme tokens from app/globals.css: --loss, --muted-foreground, --gain.
const LOSS = [0xfb, 0x71, 0x85];
const MUTED = [0x93, 0x9a, 0xa6];
const GAIN = [0x34, 0xd3, 0x99];

const hex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** Loss at 0, muted at 5, gain at 10, mixed in a straight line between. */
export function ratingColor(rating: number): string {
  const r = Math.min(10, Math.max(0, rating));
  const [from, to, t] = r <= 5 ? [LOSS, MUTED, r / 5] : [MUTED, GAIN, (r - 5) / 5];
  return hex(from.map((c, i) => c + (to[i] - c) * t));
}

/** A circle zone drawn as a closed ring of `steps` sides. */
export function circleRing(lat: number, lon: number, radiusM: number, steps = 48): Ring {
  const mPerDegLat = (Math.PI / 180) * 6_371_008.8;
  const mPerDegLon = mPerDegLat * Math.cos((lat * Math.PI) / 180);
  const ring: Ring = [];
  for (let i = 0; i < steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    ring.push([lon + (radiusM * Math.cos(t)) / mPerDegLon, lat + (radiusM * Math.sin(t)) / mPerDegLat]);
  }
  ring.push(ring[0]);
  return ring;
}

/** One polygon per ring, so a district made of several pieces draws every piece. */
export function zoneOutlines(zones: readonly ZoneOutlineInput[]): ZoneFeatures {
  return {
    type: 'FeatureCollection',
    features: zones.flatMap((z) =>
      z.rings.map((ring) => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
        properties: { id: z.id, name: z.name, rating: z.rating, color: ratingColor(z.rating) },
      }))
    ),
  };
}
