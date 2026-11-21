/**
 * Owner zones: a whole district, a point with a radius, or an area drawn on the map, each rated 0 to 10.
 * A zone reaches 1 inside and fades in a straight line to 0 at ZONE_FADE_M past its edge.
 */

import { distanceToPolygonEdgeM, haversineM, polygonAreaM2, type LatLon, type Ring } from './geo';

export const ZONE_FADE_M = 500;

export type ZoneShape = { id: string; name: string; rating: number } & (
  | { kind: 'CIRCLE'; lat: number; lon: number; radiusM: number }
  | { kind: 'DISTRICT'; districtSlug: string; rings: Ring[] }
  | { kind: 'POLYGON'; rings: Ring[] }
);

export function zoneReach(p: LatLon, zone: ZoneShape): { reach: number; distanceToEdgeM: number } {
  const raw =
    zone.kind === 'CIRCLE'
      ? Math.max(0, haversineM(p, zone) - zone.radiusM)
      : distanceToPolygonEdgeM(p, zone.rings);
  // Centimeters: float noise must not put a point on the edge a hair outside it.
  const distanceToEdgeM = Math.round(raw * 100) / 100;
  const reach = distanceToEdgeM >= ZONE_FADE_M ? 0 : 1 - distanceToEdgeM / ZONE_FADE_M;
  return { reach, distanceToEdgeM };
}

function zoneArea(zone: ZoneShape): number {
  return zone.kind === 'CIRCLE' ? Math.PI * zone.radiusM ** 2 : polygonAreaM2(zone.rings);
}

/** Highest reach wins; a tie goes to the smaller zone, because it is more specific. */
export function pickZone(
  p: LatLon,
  zones: readonly ZoneShape[],
): { zone: ZoneShape; reach: number; distanceToEdgeM: number } | null {
  let best: { zone: ZoneShape; reach: number; distanceToEdgeM: number; area: number } | null = null;
  for (const zone of zones) {
    const { reach, distanceToEdgeM } = zoneReach(p, zone);
    if (reach <= 0) continue;
    const area = zoneArea(zone);
    if (!best || reach > best.reach || (reach === best.reach && area < best.area)) {
      best = { zone, reach, distanceToEdgeM, area };
    }
  }
  return best && { zone: best.zone, reach: best.reach, distanceToEdgeM: best.distanceToEdgeM };
}
