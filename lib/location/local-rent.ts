/**
 * Local rent: the middle and high end of the nearest rent listings of the same bedroom
 * group. Inside one district, rents can go from S/ 1,500 to S/ 2,500, so the district
 * median alone flatters cheap pockets and undersells streets near a good zone.
 */

import type { GridIndex, LatLon } from './geo';
import { bedroomBucket } from '../rent';
import { median, quantile } from '../linalg';

export const LOCAL_RENT_RADIUS_M = 1_000;
export const LOCAL_RENT_K = 15;
export const LOCAL_RENT_MIN = 8;

export type RentPoint = LatLon & { perM2: number; bedrooms: number | null };
export type LocalRent = { middlePerM2: number; highPerM2: number; n: number; maxDistanceM: number };

/** null when fewer than LOCAL_RENT_MIN rents qualify; the caller falls back to the district. */
export function localRent(
  subject: LatLon & { bedrooms: number | null },
  rents: GridIndex<RentPoint>,
): LocalRent | null {
  const bucket = bedroomBucket(subject.bedrooms);
  const nearest = rents
    .near(subject, LOCAL_RENT_RADIUS_M)
    .filter(({ item }) => bucket == null || bedroomBucket(item.bedrooms) === bucket)
    .slice(0, LOCAL_RENT_K);
  if (nearest.length < LOCAL_RENT_MIN) return null;
  const values = nearest.map(({ item }) => item.perM2);
  return {
    middlePerM2: median(values),
    highPerM2: quantile(values, 0.75),
    n: nearest.length,
    maxDistanceM: nearest[nearest.length - 1].distanceM,
  };
}
